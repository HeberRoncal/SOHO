import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ArchivosProductoService } from './archivos-producto.service.js';
import { DatosFotografia } from './datos-fotografia.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';
import {
  SELECT_PRODUCTO_ADMIN,
  productoAdmin,
} from '../dto/respuesta-productos.js';
import { PLAZO_HUERFANO } from './configuracion-cloudinary.js';
import { BloqueoProductoPublicable } from '../publicacion/bloqueo-producto-publicable.js';
import {
  INCLUIR_PUBLICACION,
  RequisitosPublicacion,
} from '../publicacion/requisitos-publicacion.js';

const copia = (valor: unknown) =>
  JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonObject;

@Injectable()
export class GaleriaProductoService {
  constructor(
    @Inject(ArchivosProductoService)
    private readonly archivos: ArchivosProductoService,
  ) {}

  consultar(id: string, sesion: ContextoAuth) {
    return this.archivos.escritura.transaccion(async (tx) => {
      const p = await this.archivos.bloquearProducto(tx, id);
      await this.archivos.escritura.comprobarSesion(tx, sesion, true);
      const galeria = await tx.imagenProducto.findMany({
        where: { productoId: id },
        orderBy: { orden: 'asc' },
        include: { archivo: true },
      });
      const archivos = await tx.archivoImagen.findMany({
        where: { productoOrigenId: id, estado: { not: 'ELIMINADO' } },
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        take: 50,
      });
      return {
        productoId: id,
        version: p.version,
        galeria: galeria.map((i) => ({
          archivoId: i.archivoId,
          textoAlternativo: i.textoAlternativo,
          orden: i.orden,
          ruta: i.ruta,
          archivo: i.archivo ? DatosFotografia.archivo(i.archivo) : null,
        })),
        archivos: archivos.map((a) => DatosFotografia.archivo(a)),
        limiteArchivos: 50,
      };
    });
  }

  async actualizar(
    id: string,
    cuerpo: unknown,
    sesion: ContextoAuth,
  ): Promise<Prisma.JsonValue> {
    const datos = DatosFotografia.galeria(cuerpo),
      hash = IdentidadProducto.huella({
        tipo: 'ACTUALIZAR_GALERIA',
        id,
        datos,
      });
    try {
      return await this.archivos.escritura.transaccion(async (tx) => {
        const p = await this.archivos.bloquearProducto(tx, id);
        const anterior = await tx.operacionProducto.findUnique({
          where: { claveSolicitud: datos.claveSolicitud },
        });
        if (anterior) {
          await this.archivos.escritura.comprobarSesion(tx, sesion, true);
          if (
            anterior.usuarioResponsableId !== sesion.usuario.id ||
            anterior.solicitudHash !== hash ||
            anterior.productoId !== id ||
            anterior.tipo !== 'ACTUALIZAR_GALERIA'
          )
            throw new ConflictException(
              'La clave de solicitud ya corresponde a otra operación.',
            );
          return anterior.respuesta;
        }
        this.archivos.exigirEdicion(p, datos.version);
        const publicable =
          p.estado === 'PUBLICADO'
            ? await BloqueoProductoPublicable.bloquear(
                tx,
                p,
                this.archivos,
                p.categoriaId,
                datos.imagenes.map((i) => i.archivoId),
              )
            : null;
        const actuales =
          publicable?.producto.imagenes ??
          (await tx.imagenProducto.findMany({
            where: { productoId: id },
            orderBy: { orden: 'asc' },
          }));
        const ids = [
          ...new Set([
            ...actuales.flatMap((i) => (i.archivoId ? [i.archivoId] : [])),
            ...datos.imagenes.map((i) => i.archivoId),
          ]),
        ].sort();
        const bloqueados =
          publicable?.archivos ??
          new Map<
            string,
            Awaited<ReturnType<ArchivosProductoService['bloquearArchivo']>>
          >();
        for (const archivoId of publicable ? [] : ids)
          bloqueados.set(
            archivoId,
            await this.archivos.bloquearArchivo(tx, archivoId, id),
          );
        for (const i of datos.imagenes) {
          const a = bloqueados.get(i.archivoId)!;
          if (a.estado !== 'DISPONIBLE' || !a.urlEntrega)
            throw new ConflictException(
              'Solo se pueden asociar fotografías disponibles del producto.',
            );
        }
        if (datos.imagenes.length && (!p.grupoModeloId || !p.codigoColor))
          throw new UnprocessableEntityException(
            'Completa la identidad del producto antes de guardar su galería.',
          );
        await this.archivos.escritura.comprobarSesion(tx, sesion, true);
        const antes = {
          producto: productoAdmin(
            await tx.producto.findUniqueOrThrow({
              where: { id },
              select: SELECT_PRODUCTO_ADMIN,
            }),
          ),
          galeria: actuales.map((i) => ({
            archivoId: i.archivoId,
            textoAlternativo: i.textoAlternativo,
            orden: i.orden,
            ruta: i.ruta,
          })),
        };
        await tx.imagenProducto.deleteMany({ where: { productoId: id } });
        for (const [orden, i] of datos.imagenes.entries()) {
          const a = bloqueados.get(i.archivoId)!;
          await tx.imagenProducto.create({
            data: {
              productoId: id,
              archivoId: a.id,
              ruta: a.urlEntrega!,
              orden,
              textoAlternativo: i.textoAlternativo,
            },
          });
          if (a.proveedor === 'CLOUDINARY')
            await tx.archivoImagen.update({
              where: { id: a.id },
              data: { limpiarDesde: null },
            });
        }
        const incluidos = new Set(datos.imagenes.map((i) => i.archivoId));
        for (const a of bloqueados.values())
          if (
            a.proveedor === 'CLOUDINARY' &&
            !incluidos.has(a.id) &&
            a.estado === 'DISPONIBLE'
          )
            await tx.archivoImagen.update({
              where: { id: a.id },
              data: { limpiarDesde: new Date(Date.now() + PLAZO_HUERFANO) },
            });
        if (publicable)
          RequisitosPublicacion.comprobar(
            await tx.producto.findUniqueOrThrow({
              where: { id },
              include: INCLUIR_PUBLICACION,
            }),
          );
        await tx.producto.update({
          where: { id },
          data: {
            version: { increment: 1 },
            actualizadoPorId: sesion.usuario.id,
          },
        });
        const despues = {
          producto: productoAdmin(
            await tx.producto.findUniqueOrThrow({
              where: { id },
              select: SELECT_PRODUCTO_ADMIN,
            }),
          ),
          galeria: datos.imagenes.map((i, orden) => ({
            ...i,
            orden,
            ruta: bloqueados.get(i.archivoId)!.urlEntrega,
          })),
        };
        const respuesta = copia({
          ...despues,
          operacion: {
            claveSolicitud: datos.claveSolicitud,
            tipo: 'ACTUALIZAR_GALERIA',
            versionAnterior: p.version,
            versionPosterior: p.version + 1,
          },
        });
        await tx.operacionProducto.create({
          data: {
            claveSolicitud: datos.claveSolicitud,
            solicitudHash: hash,
            productoId: id,
            usuarioResponsableId: sesion.usuario.id,
            tipo: 'ACTUALIZAR_GALERIA',
            versionAnterior: p.version,
            versionPosterior: p.version + 1,
            antes: copia(antes),
            despues: copia(despues),
            respuesta,
          },
        });
        return respuesta as Prisma.JsonObject;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException(
          'La clave de solicitud ya está en uso. Consulta la operación antes de reintentar.',
        );
      throw e;
    }
  }
}
