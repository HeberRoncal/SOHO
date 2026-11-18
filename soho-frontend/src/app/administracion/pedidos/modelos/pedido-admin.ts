import { ArticuloPedido } from '../../../tienda/pedidos/modelos/articulo-pedido';
import { EnvioPedido } from '../../../tienda/pedidos/modelos/pedido';
import { normalizarBusquedaAdmin } from '../../productos/modelos/producto-administracion';

export const ESTADOS_PAGO_ADMIN = {
  pendiente: 'Pendiente de revisión',
  observado: 'Comprobante observado',
  aprobado: 'Pago aprobado',
  rechazado: 'Pago rechazado',
  anulado: 'Pago anulado',
} as const;
export const ESTADOS_ENTREGA_ADMIN = {
  pendiente: 'Esperando validación del pago',
  confirmado: 'Confirmado',
  'en-preparacion': 'En preparación',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  incidencia: 'Incidencia de stock',
} as const;
export type EstadoPagoAdmin = keyof typeof ESTADOS_PAGO_ADMIN;
export type EstadoEntregaAdmin = keyof typeof ESTADOS_ENTREGA_ADMIN;
export interface PedidoAdmin {
  readonly recuperacionReservas?: {
    readonly puedeSolicitar: boolean;
    readonly ultima: {
      readonly versionPedido: number;
      readonly fecha: string;
      readonly motivo: string;
      readonly responsable: { readonly id: string; readonly nombre: string };
    } | null;
  };
  readonly vencimientoReservas?: {
    readonly unidadesLiberadas: number;
    readonly unidadesConservadas: number;
  };
  readonly reservasCancelacion?: {
    readonly unidadesLiberacionAutomatica: number;
    readonly unidadesConsultables: number;
    readonly unidadesRetenidas: number;
    readonly puedeLiberarRetenidas: boolean;
  };
  readonly datosEnvio?: EnvioPedido | null;
  readonly responsablesEnvio?: {
    readonly preparacion: { readonly id: string; readonly nombre: string } | null;
    readonly despacho: { readonly id: string; readonly nombre: string } | null;
    readonly entrega: { readonly id: string; readonly nombre: string } | null;
  } | null;
  readonly remoto?: boolean;
  readonly version?: number;
  readonly versionPago?: number;
  readonly codigo: string;
  readonly fecha: string;
  readonly cliente: {
    readonly identificador: string;
    readonly nombre: string;
    readonly correo: string;
    readonly celular: string;
    readonly tipo: 'invitado' | 'registrado';
  };
  readonly direccion: {
    readonly linea: string;
    readonly distrito: string;
    readonly referencia: string;
  };
  readonly articulos: readonly ArticuloPedido[];
  readonly subtotal: number;
  readonly envio: number;
  readonly descuento: number;
  readonly total: number;
  readonly cupon?: string;
  readonly metodoPago: 'Yape' | 'Plin';
  readonly estadoPago: EstadoPagoAdmin;
  readonly estadoEntrega: EstadoEntregaAdmin;
  readonly operacion?: string;
  readonly comprobante?: string;
  readonly observacion?: string;
  readonly cancelacion?: {
    readonly motivo: string;
    readonly fecha: string;
    readonly autor: string;
    readonly estadoEntregaAnterior: EstadoEntregaAdmin;
    readonly estadoPagoAnterior: EstadoPagoAdmin;
    readonly responsableId?: string;
    readonly versionPedido?: number;
    readonly decisionReservasConsultadas?: 'LIBERAR' | 'CONSERVAR' | null;
  };
  readonly seguimiento?: { readonly empresa: string; readonly codigo: string };
  readonly eventos: readonly {
    readonly responsable?: { readonly id: string; readonly nombre: string } | null;
    readonly interna?: boolean;
    readonly fecha: string;
    readonly titulo: string;
    readonly descripcion: string;
  }[];
}
export interface FiltrosPedidosAdmin {
  busqueda: string;
  pago: EstadoPagoAdmin | '';
  entrega: EstadoEntregaAdmin | 'por-preparar' | '';
  cliente: '' | 'invitado' | 'registrado';
  desde: string;
  hasta: string;
  reserva?: '' | 'vencida';
}
export type OrdenPedidosAdmin = 'recientes' | 'antiguos' | 'total-mayor' | 'total-menor';
export const FILTROS_PEDIDOS_VACIOS: FiltrosPedidosAdmin = {
  busqueda: '',
  pago: '',
  entrega: '',
  cliente: '',
  desde: '',
  hasta: '',
  reserva: '',
};
export const diaPedidoAdmin = (fecha: string) =>
  new Date(Date.parse(fecha) - 5 * 3600000).toISOString().slice(0, 10);
export function fechaFiltroPedido(valor: string | null): string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return '';
  const fecha = new Date(valor + 'T00:00:00Z');
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
    ? valor
    : '';
}
export function coincidePedidoAdmin(pedido: PedidoAdmin, filtros: FiltrosPedidosAdmin): boolean {
  const busqueda = normalizarBusquedaAdmin(filtros.busqueda),
    dia = diaPedidoAdmin(pedido.fecha);
  return (
    (!busqueda ||
      normalizarBusquedaAdmin(
        [pedido.codigo, pedido.cliente.nombre, pedido.cliente.correo].join(' '),
      ).includes(busqueda)) &&
    (!filtros.pago || pedido.estadoPago === filtros.pago) &&
    (!filtros.entrega ||
      (filtros.entrega === 'por-preparar'
        ? pedido.estadoPago === 'aprobado' &&
          ['confirmado', 'en-preparacion'].includes(pedido.estadoEntrega)
        : pedido.estadoEntrega === filtros.entrega)) &&
    (!filtros.cliente || filtros.cliente === pedido.cliente.tipo) &&
    (!filtros.reserva ||
      !!(
        pedido.vencimientoReservas &&
        pedido.vencimientoReservas.unidadesLiberadas +
          pedido.vencimientoReservas.unidadesConservadas
      )) &&
    (!filtros.desde || dia >= filtros.desde) &&
    (!filtros.hasta || dia <= filtros.hasta)
  );
}
export function ordenarPedidosAdmin(
  pedidos: readonly PedidoAdmin[],
  orden: OrdenPedidosAdmin,
): PedidoAdmin[] {
  return [...pedidos].sort((a, b) =>
    orden === 'antiguos'
      ? a.fecha.localeCompare(b.fecha)
      : orden === 'total-mayor'
        ? b.total - a.total || b.fecha.localeCompare(a.fecha)
        : orden === 'total-menor'
          ? a.total - b.total || b.fecha.localeCompare(a.fecha)
          : b.fecha.localeCompare(a.fecha),
  );
}
