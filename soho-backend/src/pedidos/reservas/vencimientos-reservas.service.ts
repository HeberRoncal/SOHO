import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EscrituraPedidoService } from '../seguridad/escritura-pedido.service.js';
import { InventarioReservadoService } from '../../inventario/reservas/inventario-reservado.service.js';

@Injectable()
export class VencimientosReservasService {
  private readonly logger = new Logger(VencimientosReservasService.name);
  private cursor?: { venceEn: Date; id: string };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EscrituraPedidoService)
    private readonly escritura: EscrituraPedidoService,
    @Inject(InventarioReservadoService)
    private readonly inventario: InventarioReservadoService,
  ) {}

  async procesarLote() {
    const cursor = this.cursor;
    // Descubrir no bloquea reservas antes que pedidos. El cursor evita que un
    // pedido inconsistente impida atender el resto entre ejecuciones.
    const candidatas = await this.prisma.reservaInventario.findMany({
      where: {
        estado: 'ACTIVA',
        modo: 'TIEMPO',
        vencimientoAtendidoEn: null,
        venceEn: { lte: new Date() },
        ...(cursor
          ? {
              OR: [
                { venceEn: { gt: cursor.venceEn } },
                { venceEn: cursor.venceEn, id: { gt: cursor.id } },
              ],
            }
          : {}),
        articulo: {
          pedido: {
            estadoEntrega: { in: ['PENDIENTE', 'INCIDENCIA'] },
            pago: { estado: { in: ['PENDIENTE', 'OBSERVADO'] } },
            cancelacion: null,
            envio: null,
          },
        },
      },
      select: {
        id: true,
        venceEn: true,
        articulo: { select: { pedido: { select: { codigo: true } } } },
      },
      orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    const ultima = candidatas.at(-1);
    this.cursor = ultima
      ? { id: ultima.id, venceEn: ultima.venceEn! }
      : undefined;
    let atendidas = 0,
      fallidas = 0;
    for (const codigo of new Set(
      candidatas.map((r) => r.articulo.pedido.codigo),
    )) {
      try {
        atendidas += await this.procesarPedido(codigo);
      } catch {
        fallidas++;
        this.logger.error(
          `No se atendió el vencimiento de ${codigo}; se reintentará en otra pasada.`,
        );
      }
    }
    return { atendidas, fallidas };
  }

  procesarPedido(codigo: string): Promise<number> {
    return this.escritura.transaccion(async (tx) => {
      const p = await this.escritura.bloquear(tx, codigo);
      // Revalidar después del bloqueo compartido con pagos/cancelación/despacho.
      if (
        !['PENDIENTE', 'OBSERVADO'].includes(p.pago!.estado) ||
        !['PENDIENTE', 'INCIDENCIA'].includes(p.estadoEntrega) ||
        p.cancelacion ||
        p.envio ||
        p.articulos.some((a) =>
          a.reservas.some((r) => r.estado === 'CONSUMIDA'),
        )
      )
        return 0;
      const ahora = new Date();
      const vencidas = p.articulos.flatMap((a) =>
        a.reservas
          .filter(
            (r) =>
              r.estado === 'ACTIVA' &&
              r.modo === 'TIEMPO' &&
              r.venceEn &&
              r.venceEn <= ahora &&
              !r.vencimientoAtendidoEn,
          )
          .map((r) => ({ ...r, varianteId: a.varianteId, sku: a.sku })),
      );
      if (!vencidas.length) return 0;
      if (
        p.version >= 4294967295 ||
        p.creadoEn > ahora ||
        vencidas.some(
          (r) =>
            !['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'].includes(
              r.accionVencimiento ?? '',
            ),
        )
      )
        throw new ConflictException(
          'El pedido requiere revisión antes de atender sus vencimientos.',
        );
      await this.inventario.bloquear(
        tx,
        vencidas.map((r) => r.varianteId),
      );
      let secuencia = (p.eventos.at(-1)?.secuencia ?? 0) + 1;
      for (const r of vencidas) {
        const liberar = r.accionVencimiento === 'LIBERAR_Y_ALERTAR';
        const cambio = await tx.reservaInventario.updateMany({
          where: { id: r.id, estado: 'ACTIVA', vencimientoAtendidoEn: null },
          data: {
            vencimientoAtendidoEn: ahora,
            ...(liberar
              ? {
                  estado: 'LIBERADA',
                  cerradaEn: ahora,
                  motivoCierre: 'Vencimiento automático de reserva.',
                }
              : {}),
          },
        });
        if (cambio.count !== 1)
          throw new ConflictException(
            'La reserva cambió durante el vencimiento.',
          );
        if (liberar) {
          const saldo = await tx.variante.updateMany({
            where: { id: r.varianteId, cantidadReservada: { gte: r.cantidad } },
            data: { cantidadReservada: { decrement: r.cantidad } },
          });
          if (saldo.count !== 1)
            throw new ConflictException(
              'El inventario reservado requiere conciliación.',
            );
        }
        await tx.eventoPedido.create({
          data: {
            pedidoId: p.id,
            secuencia: secuencia++,
            versionPedido: p.version + 1,
            tipo: 'RESERVA_VENCIDA',
            actor: 'SISTEMA',
            visibilidad: 'INTERNA',
            fecha: ahora,
            titulo: liberar
              ? 'Reserva vencida y liberada automáticamente'
              : 'Reserva vencida y conservada',
            descripcion: `Reserva ${r.id} · SKU ${r.sku} · ${r.cantidad} unidades · vencimiento ${r.venceEn!.toISOString()} · configuración histórica ${r.configuracionVersion}. ${liberar ? 'Se liberó el inventario reservado; el pedido requiere resolver su incidencia antes de aprobar el pago.' : 'Se conserva el inventario reservado hasta una decisión sobre el pedido.'}`,
          },
        });
      }
      await tx.pedido.update({
        where: { id: p.id },
        data: {
          version: { increment: 1 },
          ...(vencidas.some((r) => r.accionVencimiento === 'LIBERAR_Y_ALERTAR')
            ? { estadoEntrega: 'INCIDENCIA' }
            : {}),
        },
      });
      return vencidas.length;
    });
  }
}
