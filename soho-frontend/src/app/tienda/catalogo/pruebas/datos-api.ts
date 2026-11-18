import { PRODUCTOS_CATALOGO_PRUEBA } from './productos.fixtures';
import { MARCAS_CATALOGO_PRUEBA } from './marcas.fixtures';
import { OpcionesCatalogo, ProductoApi } from '../modelos/catalogo-api';
import type { Producto } from '../modelos/producto';

export function productoApiPrueba(producto: Producto): ProductoApi {
  return {
    ...producto,
    id: producto.identificador,
    slug: producto.identificador,
    precio: producto.precio.toFixed(2),
    precioAnterior: producto.precioAnterior === null ? null : producto.precioAnterior.toFixed(2),
    variantes: producto.variantes.map((v) => ({
      id: v.sku,
      sku: v.sku,
      codigoColor: v.codigoColor,
      talla: v.talla,
      sistemaTallas: v.sistemaTallas,
      habilitada: v.habilitada,
      disponible: Math.max(0, v.existencias - v.cantidadReservada),
    })),
  };
}

export const PRODUCTO_API_PRUEBA: ProductoApi = {
  ...PRODUCTOS_CATALOGO_PRUEBA[0],
  id: 'uuid-af1',
  slug: 'af1',
  precio: '529.90',
  precioAnterior: null,
  variantes: PRODUCTOS_CATALOGO_PRUEBA[0].variantes.map((v) => ({
    id: v.sku,
    sku: v.sku,
    codigoColor: v.codigoColor,
    talla: v.talla,
    sistemaTallas: 'EU',
    habilitada: v.habilitada,
    disponible: Math.max(0, v.existencias - v.cantidadReservada),
  })),
};
export const OPCIONES_API_PRUEBA: OpcionesCatalogo = {
  marcas: MARCAS_CATALOGO_PRUEBA,
  categorias: ['Skate', 'Urbanas'],
  colores: [{ codigo: 'BL', nombre: 'Blanco', hexadecimal: '#FFFFFF' }],
  tallas: ['40', '41'],
  precioMinimo: '299.90',
  precioMaximo: '1049.90',
  secciones: { zapatillas: ['Skate', 'Urbanas'] },
};
export function paginaApi(pagina = 1, total = 1) {
  return {
    productos: total ? [PRODUCTO_API_PRUEBA] : [],
    paginacion: { pagina, limite: 12, total, paginas: Math.ceil(total / 12) },
  };
}
