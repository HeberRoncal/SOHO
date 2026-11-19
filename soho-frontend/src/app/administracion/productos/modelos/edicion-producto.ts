import { GeneroProducto } from '../../../tienda/catalogo/modelos/producto';
import { EdicionVariantes, validarVariantes } from './edicion-variantes';
import {
  EstadoProductoAdmin,
  ProductoAdministracion,
  normalizarBusquedaAdmin,
} from './producto-administracion';

export interface EdicionProducto {
  nombre: string;
  marca: string;
  categoria: string;
  genero: GeneroProducto;
  modelo: string;
  codigoModelo: string;
  descripcion: string;
  precio: string;
  precioAnterior: string;
  esNovedad: boolean;
  imagenes: readonly string[];
}
export type ErroresProducto = Partial<Record<keyof EdicionProducto | 'variantes', string>>;
export const EDICION_PRODUCTO_VACIA: EdicionProducto = {
  nombre: '',
  marca: '',
  categoria: '',
  genero: 'Unisex',
  modelo: '',
  codigoModelo: '',
  descripcion: '',
  precio: '',
  precioAnterior: '',
  esNovedad: false,
  imagenes: [],
};
export function editarDatosProducto(p: ProductoAdministracion): EdicionProducto {
  return {
    nombre: p.nombre,
    marca: p.marca,
    categoria: p.categoria,
    genero: p.genero,
    modelo: p.modelo,
    codigoModelo: p.codigoModelo,
    descripcion: p.descripcion,
    precio: p.precio !== null && p.precio > 0 ? p.precio.toFixed(2) : '',
    precioAnterior: p.precioAnterior === null ? '' : p.precioAnterior.toFixed(2),
    esNovedad: p.esNovedad,
    imagenes: [...p.imagenes],
  };
}
export function importeProducto(valor: string): number | null {
  const texto = valor.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const importe = Number(texto);
  return Number.isFinite(importe) && importe > 0 && importe <= 999999.99 ? importe : null;
}
export function validarEdicionProducto(
  datos: EdicionProducto,
  estado: EstadoProductoAdmin,
  productos: readonly ProductoAdministracion[],
  original?: ProductoAdministracion,
  edicionVariantes?: EdicionVariantes,
  codigoInterno = original?.codigoInterno ?? '',
): ErroresProducto {
  const errores: ErroresProducto = {};
  const otros = productos.filter((p) => p.identificador !== original?.identificador);
  if (!datos.nombre.trim()) errores.nombre = 'Ingresa el nombre del producto.';
  else if (datos.nombre.trim().length > 120) errores.nombre = 'Usa como máximo 120 caracteres.';
  else if (
    otros.some((p) => normalizarBusquedaAdmin(p.nombre) === normalizarBusquedaAdmin(datos.nombre))
  )
    errores.nombre = 'Ya existe un producto con este nombre.';
  if (
    datos.codigoModelo.trim() &&
    otros.some(
      (p) =>
        normalizarBusquedaAdmin(p.codigoModelo) === normalizarBusquedaAdmin(datos.codigoModelo),
    )
  )
    errores.codigoModelo = 'Este código de modelo ya pertenece a otro producto.';
  if (datos.codigoModelo.length > 60) errores.codigoModelo = 'Usa como máximo 60 caracteres.';
  if (datos.modelo.length > 100) errores.modelo = 'Usa como máximo 100 caracteres.';
  if (datos.descripcion.length > 600) errores.descripcion = 'Usa como máximo 600 caracteres.';
  const precio = importeProducto(datos.precio);
  if (datos.precio.trim() && precio === null)
    errores.precio =
      'Ingresa un precio mayor que cero, con hasta dos decimales (máximo S/ 999,999.99).';
  if (datos.precioAnterior.trim()) {
    const anterior = importeProducto(datos.precioAnterior);
    if (anterior === null || precio === null || anterior <= precio)
      errores.precioAnterior = 'El precio anterior debe ser mayor que el precio de venta.';
  }
  if (datos.imagenes.length > 10) errores.imagenes = 'Puedes guardar hasta 10 fotografías generales.';
  if (estado === 'publicado') {
    if (!datos.marca.trim()) errores.marca = 'Selecciona la marca.';
    if (!datos.categoria.trim()) errores.categoria = 'Selecciona la categoría.';
    if (!datos.modelo.trim()) errores.modelo = 'Ingresa el modelo.';
    if (!datos.codigoModelo.trim()) errores.codigoModelo = 'Ingresa el código de modelo.';
    if (!precio) errores.precio = 'Ingresa un precio de venta válido para publicar.';
    if (!datos.imagenes.length)
      errores.imagenes = 'Agrega al menos una fotografía general para publicar.';
    if (!(edicionVariantes?.variantes ?? original?.variantes)?.some((v) => v.habilitada))
      errores.variantes =
        'Para publicar necesitas al menos una variante activa. Puedes guardar el producto como borrador.';
  }
  if (edicionVariantes) {
    const error = validarVariantes(edicionVariantes, codigoInterno, productos, original);
    if (error) errores.variantes = error;
  }
  return errores;
}
