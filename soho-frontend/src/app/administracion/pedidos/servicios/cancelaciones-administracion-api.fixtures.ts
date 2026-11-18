import { pedidoApi } from '../../../tienda/pedidos/servicios/pedidos-api.fixtures';

export function cancelacionApiFixture({
  cancelado = false,
  conservar = false,
  liberado = false,
  pago = 'APROBADO',
  version = cancelado ? (liberado ? 4 : 3) : 2,
  consultables = 2,
  automaticas = 0,
  responsable = 'admin',
}: {
  cancelado?: boolean;
  conservar?: boolean;
  liberado?: boolean;
  pago?: string;
  version?: number;
  consultables?: number;
  automaticas?: number;
  responsable?: string;
} = {}) {
  const p = pedidoApi();
  return {
    ...p,
    version,
    estadoEntrega: cancelado ? 'CANCELADO' : pago === 'APROBADO' ? 'CONFIRMADO' : 'PENDIENTE',
    envio: null,
    tipoCliente: 'registrado',
    clienteId: 'cliente',
    revisores: [],
    responsablesEnvio: null,
    pago: {
      ...p.pago,
      estado: cancelado && !['APROBADO', 'ANULADO'].includes(pago) ? 'ANULADO' : pago,
      version: cancelado && !['APROBADO', 'ANULADO'].includes(pago) ? 3 : 2,
      comprobantes: p.pago.comprobantes.map((c) => ({
        ...c,
        creadoEn: p.fecha,
        estadoRevision: pago === 'APROBADO' ? 'APROBADO' : 'PENDIENTE',
        montoInformado: null,
        motivo: null,
        solicitudCorreccion: null,
        revisadoEn: null,
      })),
    },
    cancelacion: cancelado
      ? {
          fecha: '2026-11-14T15:00:00.000Z',
          motivo: 'Cancelación solicitada por el cliente.',
          registradaPor: { id: 'admin', nombre: 'Sofía Admin' },
          estadoEntregaAnterior: pago === 'APROBADO' ? 'CONFIRMADO' : 'PENDIENTE',
          estadoPagoAnterior: pago,
          versionPedido: 3,
          decisionReservasConsultadas: consultables ? (conservar ? 'CONSERVAR' : 'LIBERAR') : null,
        }
      : null,
    reservasCancelacion: {
      unidadesLiberacionAutomatica: cancelado ? 0 : automaticas,
      unidadesConsultables: cancelado ? (conservar && !liberado ? consultables : 0) : consultables,
      unidadesRetenidas: cancelado && conservar && !liberado ? consultables : 0,
      puedeLiberarRetenidas: cancelado && conservar && !liberado && consultables > 0,
    },
    eventos: [],
    eventosInternos: liberado
      ? [
          {
            fecha: '2026-11-14T16:00:00.000Z',
            titulo: 'Reservas retenidas liberadas',
            descripcion: 'Se liberaron las reservas conservadas al cancelar el pedido.',
            actor: 'ADMIN',
            responsable: { id: responsable, nombre: 'Administrador' },
          },
        ]
      : [],
  };
}
