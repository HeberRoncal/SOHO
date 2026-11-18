import { FiltrosCatalogo } from './filtros-catalogo';

export interface SeccionCatalogo {
  readonly ruta: string;
  readonly titulo: string;
  readonly filtros: Pick<FiltrosCatalogo, 'genero' | 'soloNovedades' | 'soloOfertas'>;
}
