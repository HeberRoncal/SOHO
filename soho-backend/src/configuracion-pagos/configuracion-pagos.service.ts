import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import { ConfiguracionCloudinary } from '../productos/fotografias/configuracion-cloudinary.js';
import { DatosPagos } from './dto/datos-pagos.js';

@Injectable()
export class ConfiguracionPagosService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
    @Inject(ConfiguracionCloudinary)
    private readonly cloudinary: ConfiguracionCloudinary,
  ) {}
  async leer(tx: Prisma.TransactionClient) {
    const c = await tx.configuracionPagos.findUnique({
      where: { id: 1 },
      include: {
        versionActual: {
          include: {
            responsable: {
              select: { id: true, nombres: true, apellidos: true },
            },
            metodos: { include: { archivoQr: true } },
          },
        },
      },
    });
    if (!c)
      throw new ServiceUnavailableException(
        'La configuración de pagos no está disponible.',
      );
    if (
      c.versionActual &&
      (c.versionActual.metodos.length !== 2 ||
        new Set(c.versionActual.metodos.map((m) => m.metodo)).size !== 2)
    )
      throw new ServiceUnavailableException(
        'La publicación de pagos requiere revisión.',
      );
    return c;
  }
  private async respuesta(tx: Prisma.TransactionClient) {
    const c = await this.leer(tx),
      v = c.versionActual;
    return {
      configuracion: {
        version: v?.numero ?? 0,
        actualizadoEn: v?.creadoEn.toISOString() ?? null,
        actualizadoPor: v
          ? {
              id: v.responsable.id,
              nombre: v.responsable.nombres + ' ' + v.responsable.apellidos,
            }
          : null,
        metodos: (['YAPE', 'PLIN'] as const).map((metodo) => {
          const m = v?.metodos.find((m) => m.metodo === metodo);
          return {
            metodo,
            activo: m?.activo ?? false,
            celular: m?.celular ?? null,
            titular: m?.titular ?? null,
            qr: m?.archivoQr ? DatosPagos.archivo(m.archivoQr) : null,
          };
        }),
      },
    };
  }
  consultar(sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM configuracion_pagos WHERE id=1 FOR UPDATE`;
      await this.escritura.comprobarSesion(tx, sesion, true);
      return {
        ...(await this.respuesta(tx)),
        capacidades: {
          cargarQr: this.cloudinary.habilitada,
          maximoBytes: DatosPagos.maximoBytes,
          formatos: ['image/png', 'image/jpeg', 'image/webp'],
          maximoLado: 4096,
        },
      };
    });
  }
  recuperar(clave: string, sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const op = await tx.versionConfiguracionPagos.findUnique({
        where: { claveSolicitud: DatosPagos.uuid(clave) },
      });
      if (!op || op.responsableId !== sesion.usuario.id)
        throw new NotFoundException('Operación no encontrada.');
      return op.respuesta;
    });
  }
  actualizar(cuerpo: unknown, sesion: ContextoAuth) {
    const d = DatosPagos.guardar(cuerpo),
      hash = DatosPagos.huella({ contexto: 'configuracion-pagos-v1', ...d });
    return this.escritura.transaccion(async (tx) => {
      await tx.$queryRaw`SELECT id FROM configuracion_pagos WHERE id=1 FOR UPDATE`;
      const anterior = await tx.versionConfiguracionPagos.findUnique({
        where: { claveSolicitud: d.claveSolicitud },
      });
      if (anterior) {
        await this.escritura.comprobarSesion(tx, sesion, true);
        if (
          anterior.responsableId !== sesion.usuario.id ||
          anterior.solicitudHash !== hash
        )
          throw new ConflictException(
            'La clave ya corresponde a otro contenido o administrador.',
          );
        return anterior.respuesta;
      }
      const c = await this.leer(tx),
        numero = c.versionActual?.numero ?? 0;
      if (numero !== d.versionEsperada)
        throw new ConflictException(
          'La configuración cambió. Actualiza antes de publicar.',
        );
      for (const metodo of d.metodos) {
        const vigente = c.versionActual?.metodos.find(
          (m) => m.metodo === metodo.metodo,
        );
        if (
          vigente?.activo &&
          (vigente.celular !== metodo.celular ||
            vigente.titular !== metodo.titular ||
            vigente.archivoQrId !== metodo.qrId)
        )
          throw new ConflictException(
            'Desactiva primero este método de pago antes de cambiar su celular, titular o QR.',
          );
      }
      const ids = d.metodos.flatMap((m) => (m.qrId ? [m.qrId] : [])).sort();
      for (const id of ids) {
        await tx.$queryRaw`SELECT id FROM archivos_qr_pago WHERE id=${id} FOR UPDATE`;
        const a = await tx.archivoQrPago.findUnique({
          where: { id },
          include: { _count: { select: { metodos: true } } },
        });
        const m = d.metodos.find((m) => m.qrId === id)!;
        if (
          !a ||
          a.estado !== 'DISPONIBLE' ||
          a.metodo !== m.metodo ||
          !a.confirmadoEn ||
          !a.assetId ||
          (a.creadoPorId !== sesion.usuario.id && a._count.metodos === 0)
        )
          throw new UnprocessableEntityException(
            'El QR debe estar disponible, corresponder al método y ser una carga propia o ya publicada.',
          );
      }
      await this.escritura.comprobarSesion(tx, sesion, true);
      const v = await tx.versionConfiguracionPagos.create({
        data: {
          numero: numero + 1,
          configuracionId: 1,
          claveSolicitud: d.claveSolicitud,
          solicitudHash: hash,
          responsableId: sesion.usuario.id,
          respuesta: {},
          metodos: {
            create: d.metodos.map((m) => ({
              metodo: m.metodo,
              activo: m.activo,
              celular: m.celular,
              titular: m.titular,
              archivoQrId: m.qrId,
            })),
          },
        },
      });
      await tx.configuracionPagos.update({
        where: { id: 1 },
        data: { versionActualId: v.id },
      });
      const respuesta = { ...(await this.respuesta(tx)), modificada: true };
      await tx.versionConfiguracionPagos.update({
        where: { id: v.id },
        data: { respuesta: respuesta as Prisma.InputJsonValue },
      });
      return respuesta;
    });
  }
}
