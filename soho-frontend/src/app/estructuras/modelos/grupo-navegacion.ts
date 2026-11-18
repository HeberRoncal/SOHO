import { EnlaceNavegacion } from './enlace-navegacion';

export interface GrupoNavegacion {
  readonly identificador: string;
  readonly nombre: string;
  readonly titulo?: string;
  readonly tituloEnlazado?: boolean;
  readonly enlaceDirecto?: boolean;
  readonly principal: EnlaceNavegacion;
  readonly enlaces: readonly EnlaceNavegacion[];
  readonly destacado: boolean;
}
