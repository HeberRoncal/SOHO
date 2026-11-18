import type { Prisma } from '../../generated/prisma/client.js';
import { INCLUIR_PEDIDO, respuestaPedido } from './respuesta-pedido.js';
import { EstadoReservasPedido } from '../reservas/estado-reservas-pedido.js';

export const INCLUIR_ADMIN = {
  ...INCLUIR_PEDIDO,
  cancelacion: {
    include: {
      registradaPor: { select: { id: true, nombres: true, apellidos: true } },
    },
  },
  envio: {
    include: {
      preparacionIniciadaPor: {
        select: { id: true, nombres: true, apellidos: true },
      },
      despachadoPor: { select: { id: true, nombres: true, apellidos: true } },
      entregaRegistradaPor: {
        select: { id: true, nombres: true, apellidos: true },
      },
    },
  },
  eventos: {
    orderBy: { secuencia: 'asc' as const },
    include: {
      responsable: { select: { id: true, nombres: true, apellidos: true } },
    },
  },
  pago: {
    include: {
      comprobantes: {
        orderBy: { version: 'desc' as const },
        include: {
          revisadoPor: { select: { nombres: true, apellidos: true } },
        },
      },
    },
  },
} as const satisfies Prisma.PedidoInclude;
export type PedidoAdmin = Prisma.PedidoGetPayload<{
  include: typeof INCLUIR_ADMIN;
}>;
export function respuestaAdmin(p: PedidoAdmin) {
  const activas = p.articulos.flatMap((a) =>
    a.reservas.filter((r) => r.estado === 'ACTIVA'),
  );
  const sumar = (politica?: 'LIBERAR' | 'PREGUNTAR') =>
    activas
      .filter((r) => !politica || r.accionCancelacion === politica)
      .reduce((n, r) => n + r.cantidad, 0);
  const vencidas = EstadoReservasPedido.vencidas(p);
  const diagnostico = EstadoReservasPedido.diagnosticar(p);
  const ultimaRecuperacion = [...p.eventos]
    .reverse()
    .find(
      (e) =>
        e.tipo === 'ENTREGA_CAMBIADA' &&
        e.visibilidad === 'INTERNA' &&
        e.titulo === EstadoReservasPedido.tituloRecuperacion &&
        e.actor === 'ADMIN',
    );
  const responsable = (
    u: { id: string; nombres: string; apellidos: string } | null,
  ) => (u ? { id: u.id, nombre: `${u.nombres} ${u.apellidos}` } : null);
  return {
    ...respuestaPedido(p),
    tipoCliente: p.usuarioId ? 'registrado' : 'invitado',
    recuperacionReservas: {
      puedeSolicitar: !diagnostico.motivoBloqueo,
      ultima: ultimaRecuperacion
        ? {
            versionPedido: ultimaRecuperacion.versionPedido,
            fecha: ultimaRecuperacion.fecha.toISOString(),
            motivo: ultimaRecuperacion.descripcion,
            responsable: responsable(ultimaRecuperacion.responsable),
          }
        : null,
    },
    vencimientoReservas: {
      unidadesLiberadas: vencidas
        .filter((r) => r.estado === 'LIBERADA')
        .reduce((s, r) => s + r.cantidad, 0),
      unidadesConservadas: vencidas
        .filter((r) => r.estado === 'ACTIVA')
        .reduce((s, r) => s + r.cantidad, 0),
    },
    clienteId: p.usuarioId ?? `invitado:${p.id}`,
    cancelacion: p.cancelacion
      ? {
          fecha: p.cancelacion.canceladaEn.toISOString(),
          motivo: p.cancelacion.motivo,
          registradaPor: responsable(p.cancelacion.registradaPor),
          estadoEntregaAnterior: p.cancelacion.estadoEntregaAnterior,
          estadoPagoAnterior: p.cancelacion.estadoPagoAnterior,
          versionPedido: p.cancelacion.versionPedido,
          decisionReservasConsultadas:
            p.cancelacion.decisionReservasConsultadas,
        }
      : null,
    reservasCancelacion: {
      unidadesLiberacionAutomatica: sumar('LIBERAR'),
      unidadesConsultables: sumar('PREGUNTAR'),
      unidadesRetenidas: p.estadoEntrega === 'CANCELADO' ? sumar() : 0,
      puedeLiberarRetenidas:
        p.estadoEntrega === 'CANCELADO' &&
        p.cancelacion?.decisionReservasConsultadas === 'CONSERVAR' &&
        activas.length > 0 &&
        activas.every((r) => r.accionCancelacion === 'PREGUNTAR') &&
        !p.envio?.despachadoEn,
    },
    responsablesEnvio: p.envio
      ? {
          preparacion: responsable(p.envio.preparacionIniciadaPor),
          despacho: responsable(p.envio.despachadoPor),
          entrega: responsable(p.envio.entregaRegistradaPor),
        }
      : null,
    eventosInternos: p.eventos
      .filter((e) => e.visibilidad === 'INTERNA')
      .map((e) => ({
        titulo: e.titulo,
        descripcion: e.descripcion,
        fecha: e.fecha.toISOString(),
        actor: e.actor,
        responsable: responsable(e.responsable),
      })),
    revisores:
      p.pago?.comprobantes.map((c) => ({
        id: c.id,
        nombre: c.revisadoPor
          ? `${c.revisadoPor.nombres} ${c.revisadoPor.apellidos}`
          : null,
      })) ?? [],
  };
}
