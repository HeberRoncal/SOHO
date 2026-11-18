import { ArticuloPedido } from '../../../tienda/pedidos/modelos/articulo-pedido';
import { PedidoAdmin } from '../../pedidos/modelos/pedido-admin';

export const ESTADOS_SOLICITUD = {
  evaluacion: 'En evaluación',
  retorno: 'Esperando retorno',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cerrada: 'Cerrada',
} as const;
export const MOTIVOS_SOLICITUD = {
  talla: 'La talla no le queda',
  color: 'Prefiere otro color',
  defecto: 'Producto con defecto',
  otro: 'Otro motivo',
} as const;
export type EstadoSolicitud = keyof typeof ESTADOS_SOLICITUD;
export type TipoSolicitud = 'cambio' | 'devolucion';
export type AccionSolicitud = 'aprobar' | 'rechazar' | 'recibir' | 'cerrar-cambio' | 'reembolso';
export const ACCIONES_SOLICITUD: Record<AccionSolicitud, string> = {
  aprobar: 'Aprobar solicitud',
  rechazar: 'Rechazar solicitud',
  recibir: 'Registrar retorno físico',
  'cerrar-cambio': 'Enviar cambio y cerrar',
  reembolso: 'Registrar reembolso',
};
export interface VarianteCambio {
  readonly sku: string;
  readonly productoId: string;
  readonly nombre: string;
  readonly color: string;
  readonly talla: string;
  readonly imagen: string;
}
export interface EvidenciaSolicitud {
  readonly nombre: string;
  readonly tipo: string;
  readonly bytes: number;
  readonly imagen: string;
}
export interface SolicitudAdmin {
  readonly identificador: string;
  readonly pedido: string;
  readonly cliente: PedidoAdmin['cliente'];
  readonly fecha: string;
  readonly tipo: TipoSolicitud;
  readonly estado: EstadoSolicitud;
  readonly articulo: ArticuloPedido;
  readonly cantidad: number;
  readonly unidades: readonly number[];
  readonly importeReferencia: number;
  readonly motivo: keyof typeof MOTIVOS_SOLICITUD;
  readonly descripcion: string;
  readonly variante?: VarianteCambio;
  readonly evidencias: readonly EvidenciaSolicitud[];
  readonly revision: number;
  readonly recepcion?: { readonly fecha: string; readonly condicion: 'bueno' | 'defecto' };
  readonly cierre?: { readonly fecha: string; readonly referencia: string };
  readonly eventos: readonly {
    readonly fecha: string;
    readonly titulo: string;
    readonly descripcion: string;
    readonly autor: string;
  }[];
  readonly notas: readonly {
    readonly fecha: string;
    readonly texto: string;
    readonly autor: string;
  }[];
}
export interface NuevaSolicitud {
  pedido: string;
  sku: string;
  tipo: TipoSolicitud;
  cantidad: number;
  motivo: string;
  descripcion: string;
  variante: string;
  confirmado: boolean;
  evidencias: readonly EvidenciaSolicitud[];
}
export interface DecisionSolicitud {
  accion: AccionSolicitud;
  revision: number;
  confirmado: boolean;
  motivo: string;
  condicion: '' | 'bueno' | 'defecto';
  referencia: string;
}
export const pedidoAdmiteSolicitud = (pedido: PedidoAdmin | undefined) =>
  pedido?.estadoPago === 'aprobado' && pedido.estadoEntrega === 'entregado';
export const solicitudAbierta = (s: SolicitudAdmin) => !['cerrada', 'rechazada'].includes(s.estado);
export function cantidadAtendida(
  solicitudes: readonly SolicitudAdmin[],
  pedido: string,
  sku: string,
) {
  return solicitudes
    .filter((s) => s.pedido === pedido && s.articulo.sku === sku && s.estado !== 'rechazada')
    .reduce((n, s) => n + s.cantidad, 0);
}
// Distribuye el descuento histórico por par en céntimos; la suma de todas las unidades reconcilia.
export function importeReferenciaSolicitud(
  pedido: PedidoAdmin,
  sku: string,
  cantidad: number,
  anteriores: number | readonly number[] = 0,
): number {
  const unidades = pedido.articulos.flatMap((a) =>
    Array.from({ length: a.cantidad }, () => ({
      sku: a.sku,
      bruto: Math.round(a.precioUnitario * 100),
      descuento: 0,
      resto: 0,
    })),
  );
  const bruto = unidades.reduce((n, u) => n + u.bruto, 0),
    descuento = Math.round(pedido.descuento * 100);
  if (!bruto) return 0;
  for (const u of unidades) {
    u.descuento = Math.floor((descuento * u.bruto) / bruto);
    u.resto = (descuento * u.bruto) % bruto;
  }
  const faltante = descuento - unidades.reduce((n, u) => n + u.descuento, 0);
  [...unidades]
    .sort((a, b) => b.resto - a.resto)
    .slice(0, faltante)
    .forEach((u) => u.descuento++);
  return (
    unidades
      .filter((u) => u.sku === sku)
      .filter((_, i) =>
        typeof anteriores === 'number'
          ? i >= anteriores && i < anteriores + cantidad
          : anteriores.includes(i),
      )
      .reduce((n, u) => n + u.bruto - u.descuento, 0) / 100
  );
}
export function erroresNuevaSolicitud(
  datos: NuevaSolicitud,
  pedido: PedidoAdmin | undefined,
  solicitudes: readonly SolicitudAdmin[],
  variantes: readonly (VarianteCambio & { disponible: number })[],
) {
  const errores: Record<string, string> = {};
  if (!pedidoAdmiteSolicitud(pedido))
    errores['pedido'] = 'Selecciona un pedido entregado con pago aprobado.';
  const articulo = pedido?.articulos.find((a) => a.sku === datos.sku);
  if (!articulo) errores['sku'] = 'Selecciona un producto de ese pedido.';
  const libres = (articulo?.cantidad ?? 0) - cantidadAtendida(solicitudes, datos.pedido, datos.sku);
  if (!Number.isInteger(datos.cantidad) || datos.cantidad < 1 || datos.cantidad > libres)
    errores['cantidad'] = 'La cantidad supera los pares del pedido que aún no tienen solicitud.';
  if (datos.tipo !== 'cambio' && datos.tipo !== 'devolucion')
    errores['tipo'] = 'Selecciona cambio o devolución.';
  if (!Object.hasOwn(MOTIVOS_SOLICITUD, datos.motivo))
    errores['motivo'] = 'Selecciona el motivo de la solicitud.';
  if (datos.descripcion.trim().length < 10 || datos.descripcion.trim().length > 1000)
    errores['descripcion'] = 'Describe el caso con entre 10 y 1000 caracteres.';
  if (
    datos.tipo === 'cambio' &&
    !variantes.some((v) => v.sku === datos.variante && v.disponible >= datos.cantidad)
  )
    errores['variante'] = 'Selecciona otra variante disponible del mismo modelo.';
  if (!datos.confirmado)
    errores['confirmado'] = 'Confirma que registrarás una solicitud de demostración.';
  if (
    datos.evidencias.length > 3 ||
    datos.evidencias.some(
      (e) =>
        !['image/jpeg', 'image/png', 'image/webp'].includes(e.tipo) ||
        e.bytes <= 0 ||
        e.bytes > 2 * 1024 * 1024 ||
        !e.imagen.startsWith(`data:${e.tipo};base64,`),
    )
  )
    errores['evidencias'] = 'Adjunta hasta 3 imágenes JPG, PNG o WEBP de máximo 2 MB cada una.';
  return errores;
}
