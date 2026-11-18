import { PRODUCTOS_DEMOSTRACION } from './catalogo-posventa-demo';
import { Producto } from '../../../tienda/catalogo/modelos/producto';
import {
  EstadoProductoAdmin,
  ProductoAdministracion,
} from '../../productos/modelos/producto-administracion';
// Copias exclusivas de la interfaz administrativa: nunca modifican catálogo, carrito o pedidos.
const base = PRODUCTOS_DEMOSTRACION[0];
const dunk: Producto = {
  ...base,
  identificador: 'dunk',
  nombre: 'Nike Dunk Low Retro',
  modelo: 'Dunk Low Retro',
  codigoModelo: 'DUNKLOW',
  descripcion: 'Silueta de básquet de los 80 con capellada de cuero en dos tonos y suela de goma.',
  precio: 549,
  imagenes: ['/imagenes/productos/dunk.png'],
  colores: [
    {
      codigo: 'BN',
      nombre: 'Blanco/Negro',
      hexadecimal: '#f2f2f0',
      imagenes: ['/imagenes/productos/dunk.png'],
    },
  ],
  variantes: ['38', '39', '40', '41', '42', '43', '44'].map((talla, i) => ({
    identificador: 'NK-DUNKLOW-BN-' + talla,
    sku: 'NK-DUNKLOW-BN-' + talla,
    codigoColor: 'BN',
    talla,
    sistemaTallas: 'EU',
    existencias: [4, 5, 0, 1, 3, 2, 5][i],
    cantidadReservada: talla === '42' ? 1 : 0,
    habilitada: true,
  })),
};
const estados: Readonly<Record<string, EstadoProductoAdmin>> = {
  ub5: 'borrador',
  ub1: 'archivado',
  suedexl: 'borrador',
};
export const PRODUCTOS_POSVENTA_DEMO: readonly ProductoAdministracion[] = Object.freeze(
  [dunk, ...PRODUCTOS_DEMOSTRACION].map((producto, i) =>
    Object.freeze({
      ...producto,
      codigoInterno: 'SHO-' + String(i + 1).padStart(4, '0'),
      estado: estados[producto.identificador] ?? 'publicado',
      variantes: Object.freeze(
        producto.variantes.map((v) =>
          Object.freeze({
            ...v,
            existencias:
              producto.identificador === 'nb990v5'
                ? 0
                : producto.identificador === 'af1' && v.talla === '41'
                  ? 2
                  : v.existencias,
            cantidadReservada:
              producto.identificador === 'samba' && v.codigoColor === 'NG' && v.talla === '42'
                ? 1
                : v.cantidadReservada,
          }),
        ),
      ),
    }),
  ),
);
