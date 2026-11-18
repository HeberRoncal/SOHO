import { DatosEntrega } from '../../finalizar-compra/modelos/datos-entrega';
import { CotizacionEntrega } from '../../finalizar-compra/modelos/cotizacion-entrega';
import { ArticuloPedido } from './articulo-pedido';
import { ComprobantePago, MetodoPago } from './comprobante-pago';

export type EstadoPago = 'pendiente' | 'observado' | 'aprobado' | 'rechazado' | 'anulado';
export type EstadoPreparacion =
  | 'pendiente'
  | 'confirmado'
  | 'en-preparacion'
  | 'incidencia'
  | 'enviado'
  | 'entregado'
  | 'cancelado';

export interface EnvioPedido {
  readonly transportista: string | null;
  readonly referenciaSeguimiento: string | null;
  readonly preparacionIniciadaEn: string;
  readonly despachadoEn: string | null;
  readonly entregadoEn: string | null;
}

export interface Pedido {
  readonly cancelacion?: { readonly fecha: string } | null;
  readonly envio?: EnvioPedido | null;
  readonly versionPago?: number;
  readonly clienteId?: string;
  readonly version?: number;
  readonly observacionPago?: string | null;
  readonly codigo: string;
  readonly fecha: string;
  readonly datos: DatosEntrega;
  readonly entrega: CotizacionEntrega;
  readonly articulos: readonly ArticuloPedido[];
  readonly subtotal: number;
  readonly total: number;
  readonly cupon?: string;
  readonly descuento?: number;
  readonly metodoPago: MetodoPago;
  readonly comprobante: Omit<ComprobantePago, 'vistaPrevia'> & { readonly id?: string };
  readonly estadoPago: EstadoPago;
  readonly estadoPreparacion: EstadoPreparacion;
}

export function estadoPedido(p: Pedido): string {
  if (p.estadoPreparacion === 'cancelado') return 'Cancelado';
  if (p.estadoPago === 'anulado') return 'Pago anulado';
  if (p.estadoPago === 'observado') return 'Comprobante observado';
  if (p.estadoPago === 'rechazado') return 'Comprobante rechazado';
  if (p.estadoPreparacion === 'incidencia') return 'Incidencia en la entrega';
  if (p.estadoPreparacion === 'entregado') return 'Entregado';
  if (p.estadoPreparacion === 'enviado') return 'Enviado';
  if (p.estadoPreparacion === 'en-preparacion') return 'En preparación';
  if (p.estadoPreparacion === 'confirmado') return 'Pedido confirmado';
  return p.estadoPago === 'aprobado' ? 'Pago aprobado' : 'Pago en revisión';
}
