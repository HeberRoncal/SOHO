import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ArchivoQrPago } from '../../generated/prisma/client.js';
import { ArchivosQrService } from './archivos-qr.service.js';
import {
  ConfiguracionCloudinary,
  PLAZO_CARGA,
} from '../../productos/fotografias/configuracion-cloudinary.js';

@Injectable()
export class MantenimientoQrService {
  private readonly logger = new Logger(MantenimientoQrService.name);
  private detenido = false;
  constructor(
    @Inject(ArchivosQrService)
    private readonly archivos: ArchivosQrService,
    @Inject(ConfiguracionCloudinary)
    private readonly config: ConfiguracionCloudinary,
  ) {}
  detener() {
    this.detenido = true;
  }

  async conciliar(origen: ArchivoQrPago): Promise<boolean> {
    const reclamada = await this.archivos.escritura.transaccion(async (tx) => {
      const a = await this.archivos.bloquear(tx, origen.id),
        ahora = new Date();
      if (
        a.proveedor !== 'CLOUDINARY' ||
        a.cloudName !== this.config.cloudName ||
        !['PENDIENTE', 'CONCILIANDO'].includes(a.estado) ||
        (a.bloqueoCargaHasta && a.bloqueoCargaHasta > ahora) ||
        (a.proximaRevisionEn && a.proximaRevisionEn > ahora)
      )
        return null;
      return tx.archivoQrPago.update({
        where: { id: a.id },
        data: {
          estado: 'CONCILIANDO',
          intentosCarga: Math.min(4294967295, a.intentosCarga + 1),
          tokenCarga: randomUUID(),
          bloqueoCargaHasta: new Date(ahora.getTime() + PLAZO_CARGA),
          proximaRevisionEn: null,
        },
      });
    });
    if (!reclamada) return false;
    try {
      const recurso = await this.archivos.cloudinary.buscar(reclamada);
      if (recurso) {
        await this.archivos.confirmar(
          reclamada,
          reclamada.tokenCarga!,
          recurso,
        );
        return true;
      }
    } catch {
      /* El resultado externo sigue incierto; nunca repetir el POST. */
    }
    await this.archivos.incierta(reclamada, reclamada.tokenCarga!);
    return false;
  }

  async limpiar(origen: ArchivoQrPago): Promise<boolean> {
    const reclamada = await this.archivos.escritura.transaccion(async (tx) => {
      const a = await this.archivos.bloquear(tx, origen.id),
        ahora = new Date();
      if (
        a.proveedor !== 'CLOUDINARY' ||
        a.cloudName !== this.config.cloudName ||
        !a.assetId ||
        !a.confirmadoEn ||
        a._count.metodos
      )
        return null;
      if (a.estado === 'DISPONIBLE') {
        if (!a.limpiarDesde || a.limpiarDesde > ahora) return null;
      } else if (
        a.estado !== 'ELIMINANDO' ||
        !a.bloqueoLimpiezaHasta ||
        a.bloqueoLimpiezaHasta > ahora
      )
        return null;
      return tx.archivoQrPago.update({
        where: { id: a.id },
        data: {
          estado: 'ELIMINANDO',
          tokenLimpieza: randomUUID(),
          bloqueoLimpiezaHasta: new Date(ahora.getTime() + PLAZO_CARGA),
          intentosLimpieza: Math.min(4294967295, a.intentosLimpieza + 1),
        },
      });
    });
    if (!reclamada) return false;
    try {
      await this.archivos.cloudinary.eliminar(reclamada);
      return await this.archivos.escritura.transaccion(async (tx) => {
        const actual = await this.archivos.bloquear(tx, reclamada.id);
        if (
          actual.estado !== 'ELIMINANDO' ||
          actual.tokenLimpieza !== reclamada.tokenLimpieza ||
          actual._count.metodos
        )
          return false;
        await tx.archivoQrPago.update({
          where: { id: actual.id },
          data: {
            estado: 'ELIMINADO',
            eliminadoEn: new Date(
              Math.max(Date.now(), actual.confirmadoEn!.getTime()),
            ),
            tokenLimpieza: null,
            bloqueoLimpiezaHasta: null,
            ultimaIncidencia: null,
            proximaRevisionEn: null,
          },
        });
        return true;
      });
    } catch {
      await this.archivos.escritura.transaccion(async (tx) => {
        const actual = await this.archivos.bloquear(tx, reclamada.id);
        if (
          actual.estado === 'ELIMINANDO' &&
          actual.tokenLimpieza === reclamada.tokenLimpieza
        )
          await tx.archivoQrPago.update({
            where: { id: actual.id },
            data: {
              bloqueoLimpiezaHasta: new Date(
                Date.now() +
                  Math.min(
                    6 * 60 * 60 * 1000,
                    PLAZO_CARGA *
                      2 **
                        Math.min(10, Math.max(0, actual.intentosLimpieza - 1)),
                  ),
              ),
              ultimaIncidencia: 'ELIMINACION_PENDIENTE_DE_CONFIRMACION',
            },
          });
      });
      return false;
    }
  }

  async procesarLote() {
    if (!this.config.habilitada || this.detenido)
      return { conciliadas: 0, retiradas: 0, pendientes: 0, fallidas: 0 };
    const ahora = new Date(),
      candidatas = await this.archivos.prisma.archivoQrPago.findMany({
        where: {
          proveedor: 'CLOUDINARY',
          cloudName: this.config.cloudName,
          metodos: { none: {} },
          OR: [
            {
              estado: { in: ['PENDIENTE', 'CONCILIANDO'] },
              AND: [
                {
                  OR: [
                    { bloqueoCargaHasta: null },
                    { bloqueoCargaHasta: { lte: ahora } },
                  ],
                },
                {
                  OR: [
                    { proximaRevisionEn: null },
                    { proximaRevisionEn: { lte: ahora } },
                  ],
                },
              ],
            },
            { estado: 'DISPONIBLE', limpiarDesde: { lte: ahora } },
            { estado: 'ELIMINANDO', bloqueoLimpiezaHasta: { lte: ahora } },
          ],
        },
        orderBy: [{ actualizadoEn: 'asc' }, { id: 'asc' }],
        take: 10,
      });
    let conciliadas = 0,
      retiradas = 0,
      pendientes = 0,
      fallidas = 0;
    for (const a of candidatas) {
      if (this.detenido) break;
      try {
        if (['PENDIENTE', 'CONCILIANDO'].includes(a.estado)) {
          if (await this.conciliar(a)) conciliadas++;
          else pendientes++;
        } else if (await this.limpiar(a)) retiradas++;
        else pendientes++;
      } catch {
        fallidas++;
        this.logger.error(
          'No se pudo completar una operación de QR de pago; se revisará más adelante.',
        );
      }
    }
    return { conciliadas, retiradas, pendientes, fallidas };
  }
}
