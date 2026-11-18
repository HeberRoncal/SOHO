export interface CotizacionEntrega {
  readonly tarifaReal?: boolean;
  readonly distrito: string;
  readonly nombreDistrito: string;
  readonly costo: number;
  readonly plazo?: string | null;
}
