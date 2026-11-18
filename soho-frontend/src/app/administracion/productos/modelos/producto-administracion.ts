import { Producto } from '../../../tienda/catalogo/modelos/producto';
export type EstadoProductoAdmin = 'publicado' | 'borrador' | 'archivado';
export type DisponibilidadAdmin = '' | 'disponible' | 'bajo' | 'agotado';
export type OrdenProductosAdmin =
  'catalogo' | 'nombre' | 'precio-ascendente' | 'precio-descendente' | 'stock';
export interface ProductoAdministracion extends Omit<Producto, 'publicado' | 'precio'> {
  readonly precio: number | null;
  readonly slug?: string;
  readonly codigoInterno: string;
  readonly estado: EstadoProductoAdmin;
}
export interface FiltrosProductosAdmin {
  readonly busqueda: string;
  readonly marca: string;
  readonly categoria: string;
  readonly estado: EstadoProductoAdmin | '';
  readonly disponibilidad: DisponibilidadAdmin;
}
export const FILTROS_ADMIN_INICIALES: FiltrosProductosAdmin = {
  busqueda: '',
  marca: '',
  categoria: '',
  estado: '',
  disponibilidad: '',
};
export const UMBRAL_STOCK_BAJO = 2;
export function resumenInventario(producto: Pick<ProductoAdministracion, 'variantes'>) {
  const activas = producto.variantes.filter((v) => v.habilitada);
  const disponibles = activas.map((v) => Math.max(0, v.existencias - v.cantidadReservada));
  return {
    fisico: producto.variantes.reduce((n, v) => n + v.existencias, 0),
    reservado: producto.variantes.reduce((n, v) => n + v.cantidadReservada, 0),
    disponible: disponibles.reduce((n, v) => n + v, 0),
    bajo: disponibles.filter((n) => n > 0 && n <= UMBRAL_STOCK_BAJO).length,
    agotadas: disponibles.filter((n) => n === 0).length,
    activas: activas.length,
  };
}
export const normalizarBusquedaAdmin = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .trim();
export function coincideProductoAdmin(
  producto: ProductoAdministracion,
  filtros: FiltrosProductosAdmin,
): boolean {
  const busqueda = normalizarBusquedaAdmin(filtros.busqueda);
  const inventario = resumenInventario(producto);
  return (
    (!busqueda ||
      normalizarBusquedaAdmin(
        [
          producto.nombre,
          producto.marca,
          producto.codigoInterno,
          producto.codigoModelo,
          ...producto.variantes.map((v) => v.sku),
        ].join(' '),
      ).includes(busqueda)) &&
    (!filtros.marca || producto.marca === filtros.marca) &&
    (!filtros.categoria || producto.categoria === filtros.categoria) &&
    (filtros.estado ? producto.estado === filtros.estado : producto.estado !== 'archivado') &&
    (filtros.disponibilidad === 'disponible'
      ? inventario.disponible > 0
      : filtros.disponibilidad === 'agotado'
        ? inventario.disponible === 0
        : filtros.disponibilidad === 'bajo'
          ? inventario.bajo > 0 || inventario.agotadas > 0
          : true)
  );
}
