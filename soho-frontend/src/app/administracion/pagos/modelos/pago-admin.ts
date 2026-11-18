import { EstadoPagoAdmin, PedidoAdmin } from '../../pedidos/modelos/pedido-admin';
import { normalizarBusquedaAdmin } from '../../productos/modelos/producto-administracion';

export type EstadoListadoPagos = EstadoPagoAdmin;
export type AccionPagoAdmin = 'aprobado' | 'observado' | 'rechazado';
export const ESTADOS_LISTADO_PAGOS = [
  ['pendiente', 'Pendientes'],
  ['observado', 'Observados'],
  ['aprobado', 'Aprobados'],
  ['rechazado', 'Rechazados'],
  ['anulado', 'Anulados'],
] as const;
export const MOTIVOS_REVISION_PAGO = [
  {
    codigo: 'ilegible',
    nombre: 'Imagen ilegible o incompleta',
    mensaje:
      'Adjunta una captura completa y legible donde se vean el monto, la fecha y la operación.',
  },
  {
    codigo: 'monto',
    nombre: 'El monto no coincide',
    mensaje:
      'El monto del comprobante no coincide con el total del pedido. Revisa la operación y adjunta el comprobante correcto.',
  },
  {
    codigo: 'ingreso',
    nombre: 'No se encontró el ingreso',
    mensaje:
      'No ubicamos el ingreso indicado. Revisa los datos de la operación y el destino de la transferencia.',
  },
  {
    codigo: 'datos',
    nombre: 'Los datos no corresponden',
    mensaje:
      'Los datos del comprobante no corresponden a este pedido. Revisa la operación y adjunta el comprobante correcto.',
  },
  { codigo: 'otro', nombre: 'Otro motivo', mensaje: '' },
] as const;
export interface ComprobanteAdmin {
  readonly id: string;
  readonly nombre: string;
  readonly fecha: string;
  readonly estado: EstadoPagoAdmin;
  readonly monto: number | null;
  readonly operacion?: string;
  readonly corregido?: boolean;
  readonly motivo?: string;
  readonly mensaje?: string;
  readonly solicitud?: 'legible' | 'corregido';
  readonly revisadoEn?: string;
  readonly revisadoPor?: string;
}
export interface RegistroPagoAdmin {
  readonly codigo: string;
  readonly comprobantes: readonly ComprobanteAdmin[];
  readonly modificado: boolean;
  readonly eventos: PedidoAdmin['eventos'];
}
export interface PagoAdmin {
  readonly pedido: PedidoAdmin;
  readonly comprobantes: readonly ComprobanteAdmin[];
}
export interface ResumenAdmin {
  reservasVencidas?: readonly PedidoAdmin[];
  reservasVencidasTotal?: number;
  pendientes: readonly PagoAdmin[];
  observados: readonly PagoAdmin[];
  porPreparar: readonly PedidoAdmin[];
  incidencias: readonly PedidoAdmin[];
  recientes: readonly PedidoAdmin[];
  conteos: Record<string, number>;
  porPrepararTotal: number;
  incidenciasTotal: number;
  importePendiente: number;
  ventas: readonly { dia: string; importe: number; pedidos: number }[];
}
export interface DecisionPagoAdmin {
  versionPedido?: number;
  versionPago?: number;
  accion: AccionPagoAdmin;
  comprobanteId: string;
  confirmado: boolean;
  motivo: string;
  mensaje: string;
  solicitud: 'legible' | 'corregido';
}
export function puedeRevisarPago(pago: PagoAdmin, comprobanteId: string): boolean {
  return (
    pago.pedido.estadoPago === 'pendiente' &&
    pago.pedido.estadoEntrega !== 'cancelado' &&
    pago.comprobantes[0]?.id === comprobanteId &&
    pago.comprobantes[0]?.estado === 'pendiente'
  );
}
export function errorDecisionPago(
  pago: PagoAdmin | undefined,
  decision: DecisionPagoAdmin,
): string {
  if (!pago || !puedeRevisarPago(pago, decision.comprobanteId))
    return 'El comprobante ya no está pendiente o no es el más reciente. Revisa el estado actual.';
  if (!['aprobado', 'observado', 'rechazado'].includes(decision.accion))
    return 'Selecciona una acción válida.';
  if (decision.accion === 'aprobado' && pago.pedido.vencimientoReservas?.unidadesLiberadas)
    return 'La reserva venció y fue liberada. Resuelve la incidencia de inventario antes de aprobar el pago.';
  if (decision.accion === 'aprobado')
    return decision.confirmado ? '' : 'Confirma la verificación del ingreso para continuar.';
  if (!MOTIVOS_REVISION_PAGO.some((m) => m.codigo === decision.motivo))
    return 'Selecciona un motivo.';
  if (decision.mensaje.trim().length < 10 || decision.mensaje.trim().length > 500)
    return 'Escribe un mensaje de entre 10 y 500 caracteres.';
  if (decision.accion === 'observado' && !['legible', 'corregido'].includes(decision.solicitud))
    return 'Selecciona el comprobante que se solicita.';
  if (decision.accion === 'rechazado' && !decision.confirmado)
    return 'Confirma el rechazo para continuar.';
  return '';
}
export function coincidePagoAdmin(pago: PagoAdmin, busqueda: string, metodo: string): boolean {
  const texto = normalizarBusquedaAdmin(busqueda);
  return (
    (!metodo || pago.pedido.metodoPago === metodo) &&
    (!texto ||
      normalizarBusquedaAdmin(
        [
          pago.pedido.codigo,
          pago.pedido.cliente.nombre,
          pago.pedido.cliente.correo,
          pago.comprobantes[0]?.operacion ?? '',
        ].join(' '),
      ).includes(texto))
  );
}
