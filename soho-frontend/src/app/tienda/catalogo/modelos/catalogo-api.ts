import { Producto } from './producto';
import { Marca } from './marca';
export type EstadoConsulta<T> =
  { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; datos: T };

export interface ProductoApi {
  id: string;
  slug: string;
  nombre: string;
  marca: string;
  modelo: string;
  codigoModelo: string;
  descripcion: string;
  categoria: string;
  genero: Producto['genero'];
  precio: string;
  precioAnterior: string | null;
  esNovedad: boolean;
  esDestacado: boolean;
  imagenes: readonly string[];
  colores: Producto['colores'];
  otrosColores?: Producto['otrosColores'];
  variantes: {
    id: string;
    sku: string;
    codigoColor: string;
    talla: string;
    sistemaTallas: 'EU';
    habilitada: boolean;
    disponible: number;
  }[];
}
export interface PaginaApi {
  productos: ProductoApi[];
  paginacion: { pagina: number; limite: number; total: number; paginas: number };
}
export interface PaginaCatalogo extends Omit<PaginaApi, 'productos'> {
  productos: readonly Producto[];
}
export interface OpcionesCatalogo {
  marcas: readonly Marca[];
  categorias: readonly string[];
  colores: readonly { codigo: string; nombre: string; hexadecimal: string }[];
  tallas: readonly string[];
  precioMinimo: string;
  precioMaximo: string;
  secciones: Readonly<Record<string, readonly string[]>>;
}
