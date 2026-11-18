import { PagoAdmin } from '../pagos/modelos/pago-admin';
import { diaPedidoAdmin, fechaFiltroPedido } from '../pedidos/modelos/pedido-admin';
import {
  ProductoAdministracion,
  UMBRAL_STOCK_BAJO,
} from '../productos/modelos/producto-administracion';

export interface VentaDiaria {
  dia: string;
  importe: number;
  pedidos: number;
}
export function desplazarDia(dia: string, cantidad: number): string {
  const fecha = new Date(dia + 'T12:00:00Z');
  fecha.setUTCDate(fecha.getUTCDate() + cantidad);
  return fecha.toISOString().slice(0, 10);
}
export function errorPeriodo(desde: string, hasta: string, hoy: string): string {
  if (!fechaFiltroPedido(desde) || !fechaFiltroPedido(hasta))
    return 'Completa ambas fechas con días válidos.';
  if (desde > hasta) return 'La fecha inicial debe ser anterior o igual a la final.';
  if (hasta > hoy) return 'El período no puede incluir fechas futuras.';
  if ((Date.parse(hasta) - Date.parse(desde)) / 86400000 > 365)
    return 'Selecciona un período de hasta 366 días.';
  return '';
}
export function ventasDiarias(
  pagos: readonly PagoAdmin[],
  desde: string,
  hasta: string,
): VentaDiaria[] {
  if (errorPeriodo(desde, hasta, hasta)) return [];
  const dias = new Map<string, { centimos: number; pedidos: number }>();
  for (let dia = desde; dia <= hasta; dia = desplazarDia(dia, 1))
    dias.set(dia, { centimos: 0, pedidos: 0 });
  for (const pago of pagos) {
    if (pago.pedido.estadoPago !== 'aprobado') continue;
    const comprobante = pago.comprobantes.find((c) => c.estado === 'aprobado' && c.revisadoEn);
    if (!comprobante?.revisadoEn || !Number.isFinite(Date.parse(comprobante.revisadoEn))) continue;
    const punto = dias.get(diaPedidoAdmin(comprobante.revisadoEn));
    if (punto) {
      punto.centimos += Math.round(pago.pedido.total * 100);
      punto.pedidos++;
    }
  }
  return [...dias].map(([dia, p]) => ({ dia, importe: p.centimos / 100, pedidos: p.pedidos }));
}
export function alertasInventario(productos: readonly ProductoAdministracion[]) {
  return productos
    .filter((p) => p.estado !== 'archivado')
    .flatMap((producto) =>
      producto.variantes
        .filter((v) => v.habilitada && v.existencias - v.cantidadReservada <= UMBRAL_STOCK_BAJO)
        .map((variante) => ({
          producto,
          variante,
          disponible: Math.max(0, variante.existencias - variante.cantidadReservada),
          faltante: Math.max(0, variante.cantidadReservada - variante.existencias),
          color:
            producto.colores.find((c) => c.codigo === variante.codigoColor)?.nombre ??
            variante.codigoColor,
          imagen:
            producto.colores.find((c) => c.codigo === variante.codigoColor)?.imagenes[0] ??
            producto.imagenes[0],
        })),
    )
    .sort(
      (a, b) =>
        a.disponible - a.faltante - (b.disponible - b.faltante) ||
        a.variante.sku.localeCompare(b.variante.sku),
    );
}
