import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type ArchivoImagen } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';
import { CloudinaryService } from './cloudinary.service.js';
import {
  ConfiguracionCloudinary,
  PLAZO_CARGA,
  PLAZO_HUERFANO,
} from './configuracion-cloudinary.js';
import { DatosFotografia } from './datos-fotografia.js';
import {
  PrepararFotografiaService,
  type FotografiaRecibida,
} from './preparar-fotografia.service.js';

@Injectable()
export class ArchivosProductoService {
  private activas = 0;
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Inject(EscrituraAutorizadaService)
    readonly escritura: EscrituraAutorizadaService,
    @Inject(CloudinaryService) readonly cloudinary: CloudinaryService,
    @Inject(ConfiguracionCloudinary) readonly config: ConfiguracionCloudinary,
    @Inject(PrepararFotografiaService)
    private readonly preparar: PrepararFotografiaService,
  ) {}

  async bloquearProducto(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM productos WHERE id=${id} FOR UPDATE`;
    const p = await tx.producto.findUnique({
      where: { id },
      include: { grupoModelo: { include: { marca: true } } },
    });
    if (!p) throw new NotFoundException('Producto no encontrado.');
    return p;
  }
  async bloquearArchivo(
    tx: Prisma.TransactionClient,
    id: string,
    productoId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM archivos_imagen WHERE id=${id} AND producto_origen_id=${productoId} FOR UPDATE`;
    const a = await tx.archivoImagen.findFirst({
      where: { id, productoOrigenId: productoId },
      include: {
        _count: { select: { galerias: true, articulosPedido: true } },
      },
    });
    if (!a) throw new NotFoundException('Fotografía no encontrada.');
    return a;
  }
  exigirBorrador(p: { estado: string; version: number }, version: number) {
    if (p.estado !== 'BORRADOR')
      throw new ConflictException('Esta operación solo admite borradores.');
    if (p.version !== version)
      throw new ConflictException(
        'El borrador cambió. Vuelve a consultarlo antes de guardar.',
      );
  }
  exigirEdicion(p: { estado: string; version: number }, version: number) {
    if (p.estado === 'BORRADOR') return this.exigirBorrador(p, version);
    if (p.estado !== 'PUBLICADO')
      throw new ConflictException(
        'Solo se pueden editar fotografías de borradores o publicados.',
      );
    if (p.version !== version)
      throw new ConflictException(
        'El producto cambió. Vuelve a consultarlo antes de guardar.',
      );
  }
  async consultar(id: string, clave: string, sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const a = await tx.archivoImagen.findUnique({
        where: { claveCarga: clave },
      });
      if (
        !a ||
        a.productoOrigenId !== id ||
        a.creadoPorId !== sesion.usuario.id
      )
        throw new NotFoundException('Carga no encontrada.');
      return DatosFotografia.archivo(a);
    });
  }

  async subir(
    productoId: string,
    cuerpo: unknown,
    fichero: FotografiaRecibida | undefined,
    sesion: ContextoAuth,
  ) {
    const datos = DatosFotografia.carga(cuerpo);
    if (this.activas >= 2)
      throw new ServiceUnavailableException(
        'Hay fotografías en proceso. Reintenta con la misma clave de carga.',
      );
    this.activas++;
    try {
      const foto = await this.preparar.preparar(fichero);
      const hash = IdentidadProducto.huella({
        productoId,
        version: datos.version,
        nombre: foto.nombre,
        contenido: foto.hashOriginal,
        preparado: foto.hash,
        mime: foto.mime,
      });
      // La recuperación de una carga confirmada no depende de la disponibilidad externa.
      const previa = await this.prisma.archivoImagen.findUnique({
        where: { claveCarga: datos.claveCarga },
      });
      const modo = previa ? null : await this.cloudinary.modoCarpetas();
      let inicio: { archivo: ArchivoImagen; ejecutar: boolean };
      try {
        inicio = await this.escritura.transaccion(async (tx) => {
          const p = await this.bloquearProducto(tx, productoId);
          const anterior = await tx.archivoImagen.findUnique({
            where: { claveCarga: datos.claveCarga },
          });
          if (anterior) {
            await this.escritura.comprobarSesion(tx, sesion, true);
            if (
              anterior.productoOrigenId !== productoId ||
              anterior.creadoPorId !== sesion.usuario.id ||
              anterior.solicitudHash !== hash
            )
              throw new ConflictException(
                'La clave de carga ya corresponde a otro archivo o administrador.',
              );
            const a = await this.bloquearArchivo(tx, anterior.id, productoId);
            return { archivo: a, ejecutar: false };
          }
          this.exigirEdicion(p, datos.version);
          const convertido = await tx.conversionCatalogo.findUnique({
            where: { id: 1 },
            select: { realizadaEn: true },
          });
          if (!convertido?.realizadaEn)
            throw new ConflictException(
              'Completa la conversión del catálogo antes de subir fotografías.',
            );
          if (
            !p.grupoModelo?.marca ||
            !p.grupoModelo.codigoModelo ||
            !p.grupoModelo.modelo ||
            !p.codigoColor ||
            !p.colorNombre ||
            !p.colorHexadecimal
          )
            throw new UnprocessableEntityException(
              'Completa grupo, marca y color antes de subir fotografías.',
            );
          await this.escritura.comprobarSesion(tx, sesion, true);
          const carpeta =
            p.carpetaImagenes ??
            'SOHO/productos/' +
              p.grupoModelo.slugCarpeta +
              '/' +
              p.codigoInterno +
              '-' +
              (IdentidadProducto.slug(p.colorNombre) ||
                p.codigoColor.toLowerCase());
          if (!p.carpetaImagenes)
            await tx.producto.update({
              where: { id: p.id },
              data: { carpetaImagenes: carpeta },
            });
          const id = randomUUID(),
            ahora = new Date();
          const archivo = await tx.archivoImagen.create({
            data: {
              id,
              productoOrigenId: productoId,
              proveedor: 'CLOUDINARY',
              estado: 'PENDIENTE',
              claveCarga: datos.claveCarga,
              solicitudHash: hash,
              hashContenido: foto.hash,
              cloudName: this.config.cloudName,
              publicId: (modo === 'fixed' ? carpeta + '/' : '') + 'soho-' + id,
              resourceType: 'image',
              deliveryType: 'upload',
              carpetaCloudinary: carpeta,
              nombreOriginal: foto.nombre,
              formato: foto.formato,
              ancho: foto.ancho,
              alto: foto.alto,
              bytes: foto.contenido.length,
              creadoPorId: sesion.usuario.id,
              creadoEn: ahora,
              tokenCarga: randomUUID(),
              bloqueoCargaHasta: new Date(ahora.getTime() + PLAZO_CARGA),
              intentosCarga: 1,
            },
          });
          return { archivo, ejecutar: true };
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        )
          throw new ConflictException(
            'La clave de carga ya está en uso. Consulta su resultado antes de reintentar.',
          );
        throw e;
      }
      if (!inicio.ejecutar) return DatosFotografia.archivo(inicio.archivo);
      try {
        const recurso = await this.cloudinary.subir(inicio.archivo, foto);
        await this.confirmar(
          inicio.archivo,
          inicio.archivo.tokenCarga!,
          recurso,
        );
      } catch {
        await this.incierta(inicio.archivo, inicio.archivo.tokenCarga!);
      }
      return DatosFotografia.archivo(
        await this.prisma.archivoImagen.findUniqueOrThrow({
          where: { id: inicio.archivo.id },
        }),
      );
    } finally {
      this.activas--;
    }
  }

  async confirmar(origen: ArchivoImagen, token: string, respuesta: unknown) {
    return this.escritura.transaccion(async (tx) => {
      await this.bloquearProducto(tx, origen.productoOrigenId);
      const a = await this.bloquearArchivo(
        tx,
        origen.id,
        origen.productoOrigenId,
      );
      if (a.estado === 'DISPONIBLE') return;
      if (
        !['PENDIENTE', 'CONCILIANDO'].includes(a.estado) ||
        a.tokenCarga !== token
      )
        return;
      const meta = this.cloudinary.verificar(a, respuesta);
      await tx.archivoImagen.update({
        where: { id: a.id },
        data: {
          ...meta,
          estado: 'DISPONIBLE',
          confirmadoEn: new Date(Math.max(Date.now(), a.creadoEn.getTime())),
          tokenCarga: null,
          bloqueoCargaHasta: null,
          proximaRevisionEn: null,
          ultimaIncidencia: null,
          limpiarDesde: new Date(Date.now() + PLAZO_HUERFANO),
        },
      });
    });
  }
  async incierta(origen: ArchivoImagen, token: string) {
    return this.escritura.transaccion(async (tx) => {
      await this.bloquearProducto(tx, origen.productoOrigenId);
      const a = await this.bloquearArchivo(
        tx,
        origen.id,
        origen.productoOrigenId,
      );
      if (
        !['PENDIENTE', 'CONCILIANDO'].includes(a.estado) ||
        a.tokenCarga !== token
      )
        return;
      await tx.archivoImagen.update({
        where: { id: a.id },
        data: {
          estado: 'CONCILIANDO',
          tokenCarga: null,
          bloqueoCargaHasta: null,
          proximaRevisionEn: new Date(
            Date.now() +
              Math.min(
                6 * 60 * 60 * 1000,
                60_000 * 2 ** Math.min(10, Math.max(0, a.intentosCarga - 1)),
              ),
          ),
          ultimaIncidencia: 'CARGA_PENDIENTE_DE_CONCILIACION',
        },
      });
    });
  }
}
