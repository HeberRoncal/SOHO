import type { PedidoAdmin } from '../dto/respuesta-administracion.js';
import type { Prisma } from '../../generated/prisma/client.js';

type Articulo = PedidoAdmin['articulos'][number];
type Reserva = Articulo['reservas'][number];

export class EstadoReservasPedido {
  static readonly tituloRecuperacion = 'Incidencia de reserva resuelta';

  static async idsConVencimiento(tx: Prisma.TransactionClient) {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT p.id FROM pedidos p INNER JOIN pagos_pedido pg ON pg.pedido_id = p.id
      WHERE p.estado_entrega IN ('PENDIENTE','INCIDENCIA') AND pg.estado IN ('PENDIENTE','OBSERVADO')
      AND NOT EXISTS (SELECT 1 FROM cancelaciones_pedido c WHERE c.pedido_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM envios_pedido e WHERE e.pedido_id = p.id)
      AND EXISTS (SELECT 1 FROM pedido_articulos a INNER JOIN reservas_inventario r ON r.pedido_articulo_id = a.id
        WHERE a.pedido_id = p.id AND r.modo = 'TIEMPO' AND r.vencimiento_atendido_en IS NOT NULL
        AND ((r.estado = 'ACTIVA' AND r.accion_vencimiento = 'SOLO_ALERTAR') OR
          (r.estado = 'LIBERADA' AND r.accion_vencimiento = 'LIBERAR_Y_ALERTAR' AND r.cerrada_en = r.vencimiento_atendido_en))
        AND NOT EXISTS (SELECT 1 FROM reservas_inventario posterior WHERE posterior.pedido_articulo_id = a.id
          AND (posterior.creado_en > r.creado_en OR (posterior.creado_en = r.creado_en AND posterior.id > r.id))))`;
    return filas.map((f) => f.id);
  }

  static ultima(reservas: readonly Reserva[]) {
    return [...reservas].sort(
      (a, b) =>
        b.creadoEn.getTime() - a.creadoEn.getTime() || b.id.localeCompare(a.id),
    )[0];
  }

  static liberadaPorVencimiento(r: Reserva) {
    return (
      r.estado === 'LIBERADA' &&
      r.modo === 'TIEMPO' &&
      r.accionVencimiento === 'LIBERAR_Y_ALERTAR' &&
      !!r.venceEn &&
      !!r.vencimientoAtendidoEn &&
      !!r.cerradaEn &&
      r.vencimientoAtendidoEn >= r.venceEn &&
      r.cerradaEn.getTime() === r.vencimientoAtendidoEn.getTime()
    );
  }

  static vencidas(p: PedidoAdmin) {
    if (
      p.cancelacion ||
      p.envio ||
      !['PENDIENTE', 'INCIDENCIA'].includes(p.estadoEntrega) ||
      !['PENDIENTE', 'OBSERVADO'].includes(p.pago?.estado ?? '')
    )
      return [];
    return p.articulos.flatMap((a) => {
      const r = this.ultima(a.reservas);
      return r &&
        r.modo === 'TIEMPO' &&
        r.vencimientoAtendidoEn &&
        ((r.estado === 'ACTIVA' && r.accionVencimiento === 'SOLO_ALERTAR') ||
          this.liberadaPorVencimiento(r))
        ? [r]
        : [];
    });
  }

  static diagnosticar(p: PedidoAdmin, ahora = new Date()) {
    const recuperar: Array<{ articulo: Articulo; anterior: Reserva }> = [];
    const conservar: Articulo[] = [];
    const fallo = (motivoBloqueo: string) => ({
      recuperar,
      conservar,
      motivoBloqueo,
    });
    if (
      p.estadoEntrega !== 'INCIDENCIA' ||
      !['PENDIENTE', 'OBSERVADO'].includes(p.pago?.estado ?? '') ||
      p.cancelacion ||
      p.envio ||
      !p.articulos.length
    )
      return fallo(
        'El pedido no tiene una incidencia por vencimiento que pueda recuperarse.',
      );
    if (
      p.version >= 4294967295 ||
      p.creadoEn > ahora ||
      p.actualizadoEn > ahora
    )
      return fallo('La versión o las fechas del pedido requieren revisión.');
    for (const a of p.articulos) {
      if (
        a.reservas.some(
          (r) =>
            r.estado === 'CONSUMIDA' ||
            r.creadoEn > ahora ||
            (r.cerradaEn && r.cerradaEn > ahora),
        )
      )
        return fallo(
          'El historial de reservas no permite recuperar este pedido.',
        );
      const activas = a.reservas.filter((r) => r.estado === 'ACTIVA');
      if (activas.length) {
        const r = activas[0];
        if (
          activas.length !== 1 ||
          r.cantidad !== a.cantidad ||
          this.ultima(a.reservas)?.id !== r.id
        )
          return fallo(
            'Las reservas activas necesitan revisión antes de continuar.',
          );
        if (
          r.accionVencimiento === 'LIBERAR_Y_ALERTAR' &&
          r.venceEn &&
          r.venceEn <= ahora
        )
          return fallo(
            'Otra reserva acaba de vencer. Actualiza cuando se haya procesado su vencimiento.',
          );
        conservar.push(a);
        continue;
      }
      const r = this.ultima(a.reservas);
      if (
        !r ||
        r.cantidad !== a.cantidad ||
        !this.liberadaPorVencimiento(r) ||
        !r.horas ||
        r.horas > 999999 ||
        r.venceEn!.getTime() !== r.creadoEn.getTime() + r.horas * 3600000 ||
        !p.eventos.some(
          (e) =>
            e.tipo === 'RESERVA_VENCIDA' &&
            e.actor === 'SISTEMA' &&
            e.visibilidad === 'INTERNA' &&
            e.fecha.getTime() === r.vencimientoAtendidoEn!.getTime(),
        )
      )
        return fallo(
          'Hay artículos sin una liberación automática por vencimiento recuperable.',
        );
      recuperar.push({ articulo: a, anterior: r });
    }
    if (!recuperar.length)
      return fallo('El pedido ya no tiene reservas vencidas que recuperar.');
    return { recuperar, conservar, motivoBloqueo: null };
  }
}
