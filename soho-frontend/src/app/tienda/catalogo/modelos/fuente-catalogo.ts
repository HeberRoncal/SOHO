import { inject, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { CatalogoApi } from '../servicios/catalogo-api';
import { FiltrosCatalogo, OrdenCatalogo } from './filtros-catalogo';
import { OpcionesCatalogo, PaginaCatalogo } from './catalogo-api';
import { Producto } from './producto';
import type { Marca } from './marca';
import type { VarianteProducto } from './variante-producto';

export interface FuenteCatalogo {
  readonly productos: readonly Producto[];
  readonly marcas: readonly Marca[];
  consultar(filtros?: FiltrosCatalogo, orden?: OrdenCatalogo): Producto[];
  obtener(identificador: string): Producto | undefined;
  estaDisponible(variante: VarianteProducto): boolean;
  readonly opciones?: OpcionesCatalogo;
  consultarPagina?(
    filtros: FiltrosCatalogo,
    orden: OrdenCatalogo,
    pagina: number,
  ): Observable<PaginaCatalogo>;
  obtenerProducto?(slug: string): Observable<Producto | undefined>;
  cargarSkus?(skus: readonly string[]): void;
  cargarSlugs?(slugs: readonly string[]): void;
}
// La aplicación siempre utiliza la API. Las pruebas eligen su fixture explícitamente.
export const FUENTE_CATALOGO = new InjectionToken<FuenteCatalogo>('FUENTE_CATALOGO', {
  providedIn: 'root',
  factory: () => inject(CatalogoApi),
});
