import type { FiltrosCatalogo, OrdenCatalogo } from './filtros-catalogo';
import type { Producto } from './producto';
import type { VarianteProducto } from './variante-producto';

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .trim();

export const varianteDisponible = (variante: VarianteProducto): boolean =>
  variante.habilitada && variante.existencias > variante.cantidadReservada;

export function coincideConFiltros(producto: Producto, filtros: FiltrosCatalogo): boolean {
  const busqueda = normalizar(filtros.busqueda ?? '');
  const marcas = [...(filtros.marcas ?? []), ...(filtros.marca ? [filtros.marca] : [])];
  const generos = filtros.generos ?? (filtros.genero ? [filtros.genero] : []);
  return (
    producto.publicado &&
    (!marcas.length || marcas.includes(producto.marca)) &&
    (!generos.length ||
      generos.some((genero) => producto.genero === genero || producto.genero === 'Unisex')) &&
    (!filtros.categorias?.length || filtros.categorias.includes(producto.categoria)) &&
    (filtros.precioMinimo === undefined || producto.precio >= filtros.precioMinimo) &&
    (filtros.precioMaximo === undefined || producto.precio <= filtros.precioMaximo) &&
    (!filtros.soloNovedades || producto.esNovedad) &&
    (!filtros.soloDestacados || producto.esDestacado) &&
    (!filtros.soloOfertas ||
      (producto.precioAnterior !== null && producto.precioAnterior > producto.precio)) &&
    (!busqueda || normalizar(producto.nombre + ' ' + producto.categoria).includes(busqueda)) &&
    ((!filtros.colores?.length && !filtros.tallas?.length) ||
      producto.variantes.some(
        (variante) =>
          varianteDisponible(variante) &&
          (!filtros.colores?.length || filtros.colores.includes(variante.codigoColor)) &&
          (!filtros.tallas?.length || filtros.tallas.includes(variante.talla)),
      ))
  );
}

export function consultarCatalogo(
  catalogo: readonly Producto[],
  filtros: FiltrosCatalogo = {},
  orden: OrdenCatalogo = 'relevancia',
): Producto[] {
  const productos = catalogo.filter((producto) => coincideConFiltros(producto, filtros));
  if (orden === 'precio-ascendente') productos.sort((a, b) => a.precio - b.precio);
  if (orden === 'precio-descendente') productos.sort((a, b) => b.precio - a.precio);
  if (orden === 'novedades') productos.sort((a, b) => Number(b.esNovedad) - Number(a.esNovedad));
  return productos;
}
