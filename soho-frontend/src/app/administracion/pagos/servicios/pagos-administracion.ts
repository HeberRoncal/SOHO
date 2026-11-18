import { InjectionToken, inject } from '@angular/core';
import { PagosAdministracionApi } from './pagos-administracion-api';
import type { FuentePagosAdministracion } from '../modelos/fuente-pagos-administracion';

export type PagosAdministracion = FuentePagosAdministracion;
export const PagosAdministracion = new InjectionToken<FuentePagosAdministracion>(
  'PAGOS_ADMINISTRACION',
  { providedIn: 'root', factory: () => inject(PagosAdministracionApi) },
);
