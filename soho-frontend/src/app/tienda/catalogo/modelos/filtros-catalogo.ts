import { GeneroProducto } from './producto';

export interface FiltrosCatalogo {
  readonly busqueda?: string;
  readonly marca?: string;
  readonly marcas?: readonly string[];
  readonly genero?: GeneroProducto;
  readonly generos?: readonly GeneroProducto[];
  readonly categorias?: readonly string[];
  readonly colores?: readonly string[];
  readonly tallas?: readonly string[];
  readonly precioMinimo?: number;
  readonly precioMaximo?: number;
  readonly soloNovedades?: boolean;
  readonly soloDestacados?: boolean;
  readonly soloOfertas?: boolean;
}

export type OrdenCatalogo = 'relevancia' | 'precio-ascendente' | 'precio-descendente' | 'novedades';
