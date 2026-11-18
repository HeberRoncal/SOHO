import type { CrearDireccionDto } from './crear-direccion.dto.js';

export class ActualizarDireccionDto implements Partial<CrearDireccionDto> {
  etiqueta?: string;
  destinatario?: string;
  celular?: string;
  distrito?: string;
  direccion?: string;
  referencia?: string;
  predeterminada?: boolean;
}
