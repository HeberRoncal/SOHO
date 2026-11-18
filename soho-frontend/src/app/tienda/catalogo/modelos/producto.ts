import { ColorProducto } from './color-producto';
import { VarianteProducto } from './variante-producto';
export type GeneroProducto = 'Hombre' | 'Mujer' | 'Unisex';
export interface Producto {
  readonly identificador: string;
  readonly nombre: string;
  readonly marca: string;
  readonly modelo: string;
  readonly codigoModelo: string;
  readonly descripcion: string;
  readonly categoria: string;
  readonly genero: GeneroProducto;
  readonly precio: number;
  readonly precioAnterior: number | null;
  readonly esNovedad: boolean;
  readonly imagenes: readonly string[];
  readonly colores: readonly ColorProducto[];
  readonly otrosColores?: readonly {
    slug: string;
    codigo: string;
    nombre: string;
    hexadecimal: string;
    imagen?: string | null;
  }[];
  readonly variantes: readonly VarianteProducto[];
  readonly publicado: boolean;
}
