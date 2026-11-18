import { inject, InjectionToken } from '@angular/core';
import { ProductosAdministracionApi } from './productos-administracion-api';
import type { FuenteProductosAdministracion } from '../modelos/fuente-productos-administracion';

export type ProductosAdministracion = FuenteProductosAdministracion;
export const ProductosAdministracion = new InjectionToken<FuenteProductosAdministracion>(
  'PRODUCTOS_ADMINISTRACION',
  { providedIn: 'root', factory: () => inject(ProductosAdministracionApi) },
);
