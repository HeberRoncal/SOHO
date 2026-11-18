export interface ZonaEntrega {
  readonly codigo: string;
  readonly nombre: string;
  readonly tarifa: number | null;
  readonly plazo?: string | null;
  readonly habilitada: boolean;
}
