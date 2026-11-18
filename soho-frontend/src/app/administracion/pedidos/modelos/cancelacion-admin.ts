import { EstadoEntregaAdmin, EstadoPagoAdmin, PedidoAdmin } from './pedido-admin';

export interface SolicitudCancelacionAdmin {
  versionPedido?: number;
  versionPago?: number;
  decisionReservasConsultadas?: 'LIBERAR' | 'CONSERVAR';
  motivo: string;
  confirmado: boolean;
  estadoEntregaEsperado: EstadoEntregaAdmin;
  estadoPagoEsperado: EstadoPagoAdmin;
}
export function puedeCancelarPedido(pedido: PedidoAdmin): boolean {
  return (
    ['pendiente', 'confirmado', 'en-preparacion', 'incidencia'].includes(pedido.estadoEntrega) &&
    !pedido.cancelacion &&
    !pedido.datosEnvio?.despachadoEn &&
    (!pedido.remoto || !!pedido.reservasCancelacion)
  );
}
export function erroresCancelacionPedido(
  pedido: PedidoAdmin | undefined,
  solicitud: SolicitudCancelacionAdmin,
): Record<string, string> {
  if (!pedido) return { estado: 'El pedido ya no está disponible.' };
  if (
    !puedeCancelarPedido(pedido) ||
    pedido.estadoEntrega !== solicitud.estadoEntregaEsperado ||
    pedido.estadoPago !== solicitud.estadoPagoEsperado
  )
    return {
      estado:
        'El estado del pedido cambió o ya no admite cancelación antes del envío. Cierra la ventana y revisa el pedido.',
    };
  const errores: Record<string, string> = {};
  const motivo = solicitud.motivo.trim();
  if (
    [...motivo].length < 10 ||
    [...motivo].length > 300 ||
    /[\p{Cc}\p{Cf}]/u.test(motivo.replace(/[\r\n]/g, ''))
  )
    errores['motivo'] = 'Escribe un motivo de entre 10 y 300 caracteres.';
  if (solicitud.confirmado !== true)
    errores['confirmado'] = 'Confirma la cancelación para continuar.';
  if (pedido.remoto) {
    const consultar = (pedido.reservasCancelacion?.unidadesConsultables ?? 0) > 0;
    if (
      consultar
        ? !['LIBERAR', 'CONSERVAR'].includes(solicitud.decisionReservasConsultadas ?? '')
        : solicitud.decisionReservasConsultadas !== undefined
    )
      errores['decisionReservasConsultadas'] = consultar
        ? 'Elige si se liberan o conservan las reservas consultadas.'
        : 'La política de reservas cambió. Actualiza el pedido.';
  }
  return errores;
}
