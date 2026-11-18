export interface CambioZonaEntrega {
  codigo: string;
  tarifa: string | null;
  plazo: string | null;
  habilitada: boolean;
}

export class ActualizarCoberturaDto {
  version: string;
  zonas: CambioZonaEntrega[];
}
