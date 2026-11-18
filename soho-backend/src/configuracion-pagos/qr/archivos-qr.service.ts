import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type ArchivoQrPago } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import { CloudinaryService } from '../../productos/fotografias/cloudinary.service.js';
import {
  ConfiguracionCloudinary,
  PLAZO_CARGA,
  PLAZO_HUERFANO,
} from '../../productos/fotografias/configuracion-cloudinary.js';
import type { FotografiaRecibida } from '../../productos/fotografias/preparar-fotografia.service.js';
import { DatosPagos } from '../dto/datos-pagos.js';
import { PrepararQrService } from './preparar-qr.service.js';

@Injectable()
export class ArchivosQrService {
  private activas = 0;
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Inject(EscrituraAutorizadaService)
    readonly escritura: EscrituraAutorizadaService,
    @Inject(CloudinaryService) readonly cloudinary: CloudinaryService,
    @Inject(ConfiguracionCloudinary) readonly config: ConfiguracionCloudinary,
    @Inject(PrepararQrService) private readonly preparar: PrepararQrService,
  ) {}
  async bloquear(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM archivos_qr_pago WHERE id=${id} FOR UPDATE`;
    const a = await tx.archivoQrPago.findUnique({
      where: { id },
      include: { _count: { select: { metodos: true } } },
    });
    if (!a) throw new NotFoundException('QR no encontrado.');
    return a;
  }
  consultar(clave: string, sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const a = await tx.archivoQrPago.findUnique({
        where: { claveCarga: clave },
      });
      if (!a || a.creadoPorId !== sesion.usuario.id)
        throw new NotFoundException('Carga no encontrada.');
      return a;
    });
  }
  async subir(
    cuerpo: unknown,
    fichero: FotografiaRecibida | undefined,
    sesion: ContextoAuth,
  ) {
    const d = DatosPagos.carga(cuerpo);
    if (this.activas >= 2)
      throw new ServiceUnavailableException(
        'Hay cargas QR en proceso. Conserva la clave para reintentar.',
      );
    this.activas++;
    try {
      const foto = await this.preparar.preparar(fichero),
        hash = DatosPagos.huella({
          contexto: 'qr-pago-v1',
          metodo: d.metodo,
          nombre: foto.nombre,
          original: foto.hashOriginal,
          preparado: foto.hash,
        });
      const previa = await this.prisma.archivoQrPago.findUnique({
        where: { claveCarga: d.claveCarga },
      });
      const modo = previa ? null : await this.cloudinary.modoCarpetas();
      let inicio: { archivo: ArchivoQrPago; ejecutar: boolean };
      try {
        inicio = await this.escritura.transaccion(async (tx) => {
          // Misma fila que publicación: serializa claves nuevas y sus referencias.
          await tx.$queryRaw`SELECT id FROM configuracion_pagos WHERE id=1 FOR UPDATE`;
          if (!(await tx.configuracionPagos.findUnique({ where: { id: 1 } })))
            throw new ServiceUnavailableException(
              'La configuración de pagos no está disponible.',
            );
          const anterior = await tx.archivoQrPago.findUnique({
            where: { claveCarga: d.claveCarga },
          });
          if (anterior) {
            const a = await this.bloquear(tx, anterior.id);
            await this.escritura.comprobarSesion(tx, sesion, true);
            if (a.creadoPorId !== sesion.usuario.id || a.solicitudHash !== hash)
              throw new ConflictException(
                'La clave ya corresponde a otro archivo, método o administrador.',
              );
            return { archivo: a, ejecutar: false };
          }
          await this.escritura.comprobarSesion(tx, sesion, true);
          const id = randomUUID(),
            ahora = new Date(),
            carpeta = 'SOHO/pagos/' + d.metodo.toLowerCase() + '/' + id;
          const archivo = await tx.archivoQrPago.create({
            data: {
              id,
              metodo: d.metodo,
              claveCarga: d.claveCarga,
              solicitudHash: hash,
              hashContenido: foto.hash,
              cloudName: this.config.cloudName,
              publicId:
                (modo === 'fixed' ? carpeta + '/' : '') + 'soho-qr-' + id,
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
            'La clave de carga está en uso. Consulta su resultado.',
          );
        throw e;
      }
      if (inicio.ejecutar) {
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
      }
      return DatosPagos.archivo(await this.consultar(d.claveCarga, sesion));
    } finally {
      this.activas--;
    }
  }
  confirmar(origen: ArchivoQrPago, token: string, respuesta: unknown) {
    return this.escritura.transaccion(async (tx) => {
      const a = await this.bloquear(tx, origen.id);
      if (
        !['PENDIENTE', 'CONCILIANDO'].includes(a.estado) ||
        a.tokenCarga !== token
      )
        return;
      const meta = this.cloudinary.verificar(a, respuesta);
      await tx.archivoQrPago.update({
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
  incierta(origen: ArchivoQrPago, token: string) {
    return this.escritura.transaccion(async (tx) => {
      const a = await this.bloquear(tx, origen.id);
      if (
        !['PENDIENTE', 'CONCILIANDO'].includes(a.estado) ||
        a.tokenCarga !== token
      )
        return;
      await tx.archivoQrPago.update({
        where: { id: a.id },
        data: {
          estado: 'PENDIENTE',
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
