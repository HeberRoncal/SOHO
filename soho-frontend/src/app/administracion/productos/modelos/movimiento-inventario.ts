import { VarianteProducto } from '../../../tienda/catalogo/modelos/variante-producto';
import { EdicionVariantes } from './edicion-variantes';

export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste';
export interface DatosMovimiento {
  sku: string;
  tipo: TipoMovimiento;
  sentido: 'sumar' | 'restar';
  cantidad: string;
  motivo: string;
  referencia: string;
}
export const MOVIMIENTO_VACIO: DatosMovimiento = {
  sku: '',
  tipo: 'entrada',
  sentido: 'sumar',
  cantidad: '',
  motivo: '',
  referencia: '',
};
export interface MovimientoInventario {
  readonly identificador: string;
  readonly fecha: string;
  readonly administrador: string;
  readonly productoId: string;
  readonly producto: string;
  readonly sku: string;
  readonly color: string;
  readonly talla: string;
  readonly tipo: TipoMovimiento;
  readonly cantidad: number;
  readonly saldoAnterior: number;
  readonly saldo: number;
  readonly reservado: number;
  readonly disponible: number;
  readonly motivo: string;
  readonly referencia: string;
  readonly origen: 'manual' | 'stock-inicial' | 'envio-pedido';
  readonly pedido?: string | null;
}
export function evaluarMovimiento(datos: DatosMovimiento, variante?: VarianteProducto) {
  const errores: Partial<Record<keyof DatosMovimiento, string>> = {};
  if (!variante) errores.sku = 'Selecciona un SKU disponible para consultar.';
  if (
    !['entrada', 'salida', 'ajuste'].includes(datos.tipo) ||
    !['sumar', 'restar'].includes(datos.sentido)
  )
    errores.tipo = 'Selecciona un tipo y un sentido de movimiento válidos.';
  const cantidad = /^\d+$/.test(datos.cantidad.trim()) ? Number(datos.cantidad.trim()) : NaN;
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 99999)
    errores.cantidad = 'Ingresa una cantidad entera de 1 a 99,999.';
  const delta =
    datos.tipo === 'salida' || (datos.tipo === 'ajuste' && datos.sentido === 'restar')
      ? -cantidad
      : cantidad;
  const saldo = variante && !errores.cantidad ? variante.existencias + delta : null;
  if (saldo !== null && saldo < 0)
    errores.cantidad = `El stock físico no puede quedar negativo. Actualmente hay ${variante!.existencias} unidades.`;
  if (saldo !== null && saldo > 99999)
    errores.cantidad = 'El saldo físico no puede superar 99,999 unidades.';
  if (!datos.motivo.trim()) errores.motivo = 'Indica el motivo del movimiento.';
  else if (datos.motivo.trim().length > 160)
    errores.motivo = 'Usa como máximo 160 caracteres para el motivo.';
  if (datos.referencia.trim().length > 80)
    errores.referencia = 'Usa como máximo 80 caracteres para la referencia.';
  const disponible =
    saldo === null
      ? null
      : variante?.habilitada
        ? Math.max(0, saldo - variante.cantidadReservada)
        : 0;
  return {
    errores,
    delta,
    saldo,
    disponible,
    bajoReservas: saldo !== null && saldo >= 0 && saldo < (variante?.cantidadReservada ?? 0),
  };
}
// Solo actualiza saldos guardados; conserva habilitación y variantes nuevas pendientes del formulario.
export function sincronizarSaldos(
  edicion: EdicionVariantes,
  guardadas: readonly VarianteProducto[],
): EdicionVariantes {
  return {
    colores: edicion.colores,
    variantes: edicion.variantes.map((v) => {
      const actual = guardadas.find((g) => g.sku === v.sku);
      return actual
        ? { ...v, existencias: actual.existencias, cantidadReservada: actual.cantidadReservada }
        : v;
    }),
  };
}
export const diaMovimiento = (fecha: string) =>
  new Date(Date.parse(fecha) - 5 * 3600000).toISOString().slice(0, 10);
