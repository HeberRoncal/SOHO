import { Injectable, type Provider } from '@angular/core';
import { FUENTE_CATALOGO, type FuenteCatalogo } from '../modelos/fuente-catalogo';
import { consultarCatalogo, varianteDisponible } from '../modelos/consulta-catalogo';
import type { FiltrosCatalogo, OrdenCatalogo } from '../modelos/filtros-catalogo';
import type { VarianteProducto } from '../modelos/variante-producto';
import { PRODUCTOS_CATALOGO_PRUEBA } from './productos.fixtures';
import { MARCAS_CATALOGO_PRUEBA } from './marcas.fixtures';

// Fuente controlada para probar vistas aisladas. Nunca se proporciona en app.config.
@Injectable({ providedIn: 'root' })
export class CatalogoPrueba implements FuenteCatalogo {
  readonly marcas = MARCAS_CATALOGO_PRUEBA;
  readonly productos = PRODUCTOS_CATALOGO_PRUEBA;
  consultar(filtros: FiltrosCatalogo = {}, orden: OrdenCatalogo = 'relevancia') {
    return consultarCatalogo(this.productos, filtros, orden);
  }
  obtener(identificador: string) {
    return this.productos.find((p) => p.identificador === identificador && p.publicado);
  }
  estaDisponible(variante: VarianteProducto) {
    return varianteDisponible(variante);
  }
}

export const proveerCatalogoPrueba = (): Provider => ({
  provide: FUENTE_CATALOGO,
  useExisting: CatalogoPrueba,
});
