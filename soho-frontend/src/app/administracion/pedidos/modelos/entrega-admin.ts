import { EstadoEntregaAdmin, PedidoAdmin } from './pedido-admin';

export const PASOS_ENTREGA_ADMIN = [
  { estado: 'confirmado', nombre: 'Confirmado', icono: 'verificar' },
  { estado: 'en-preparacion', nombre: 'En preparación', icono: 'paquete' },
  { estado: 'enviado', nombre: 'Enviado', icono: 'camion' },
  { estado: 'entregado', nombre: 'Entregado', icono: 'casa' },
] as const;
export const ACCIONES_ENTREGA_ADMIN = [
  {
    accion: 'preparar',
    origen: 'confirmado',
    destino: 'en-preparacion',
    titulo: 'Iniciar preparación',
    boton: 'Iniciar preparación',
    evento: 'En preparación',
  },
  {
    accion: 'enviar',
    origen: 'en-preparacion',
    destino: 'enviado',
    titulo: 'Registrar envío',
    boton: 'Registrar envío',
    evento: 'Enviado',
  },
  {
    accion: 'entregar',
    origen: 'enviado',
    destino: 'entregado',
    titulo: 'Marcar como entregado',
    boton: 'Marcar como entregado',
    evento: 'Entregado',
  },
] as const;
export type AccionEntregaAdmin = (typeof ACCIONES_ENTREGA_ADMIN)[number]['accion'];
export interface CambioEntregaAdmin {
  versionPedido?: number;
  accion: AccionEntregaAdmin;
  estadoEsperado: EstadoEntregaAdmin;
  empresa: string;
  seguimiento: string;
  nota: string;
  confirmado: boolean;
}
export interface RegistroEntregaAdmin {
  readonly codigo: string;
  readonly estado: EstadoEntregaAdmin;
  readonly seguimiento?: PedidoAdmin['seguimiento'];
  readonly eventos: PedidoAdmin['eventos'];
}
export function accionEntregaDisponible(pedido: PedidoAdmin) {
  return pedido.estadoPago === 'aprobado'
    ? ACCIONES_ENTREGA_ADMIN.find((a) => a.origen === pedido.estadoEntrega)
    : undefined;
}
export function erroresCambioEntrega(
  pedido: PedidoAdmin | undefined,
  cambio: CambioEntregaAdmin,
): Record<string, string> {
  if (!pedido) return { estado: 'El pedido ya no está disponible.' };
  if (pedido.estadoPago !== 'aprobado')
    return { estado: 'El pago debe estar aprobado antes de preparar o enviar.' };
  const accion = accionEntregaDisponible(pedido);
  if (!accion || accion.accion !== cambio.accion || pedido.estadoEntrega !== cambio.estadoEsperado)
    return {
      estado:
        'El estado del pedido cambió o no permite esta acción. Cierra la ventana y revisa el estado actual.',
    };
  const errores: Record<string, string> = {};
  if (cambio.accion === 'enviar') {
    if (
      Array.from(cambio.empresa.trim()).length < 2 ||
      Array.from(cambio.empresa.trim()).length > 80 ||
      /[\p{Cc}\p{Cf}]/u.test(cambio.empresa)
    )
      errores['empresa'] = 'Indica un transportista de entre 2 y 80 caracteres.';
    if (
      Array.from(cambio.seguimiento.trim()).length < 3 ||
      Array.from(cambio.seguimiento.trim()).length > 80 ||
      /[\p{Cc}\p{Cf}]/u.test(cambio.seguimiento)
    )
      errores['seguimiento'] = 'Indica un código o referencia de entre 3 y 80 caracteres.';
  }
  if (
    Array.from(cambio.nota.trim()).length > 300 ||
    /[\p{Cc}\p{Cf}]/u.test(cambio.nota.replace(/[\r\n]/g, ''))
  )
    errores['nota'] = 'La nota admite hasta 300 caracteres, sin caracteres de control.';
  if (cambio.accion === 'entregar') {
    if (!pedido.seguimiento?.empresa.trim() || !pedido.seguimiento.codigo.trim())
      errores['estado'] = 'El pedido necesita datos de envío antes de registrar la entrega.';
    if (!cambio.confirmado)
      errores['confirmado'] = 'Confirma que el pedido fue entregado para continuar.';
  }
  return errores;
}
