import { Params } from '@angular/router';

export interface EnlaceNavegacion {
  readonly texto: string;
  readonly ruta: string;
  readonly parametros: Params;
  readonly fragmento?: string;
}
