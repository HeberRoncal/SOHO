export type MetodoPago = 'Yape' | 'Plin';

export interface ComprobantePago {
  readonly nombreArchivo: string;
  readonly tipoArchivo: string;
  readonly tamanoBytes: number;
  readonly vistaPrevia: string;
  readonly numeroOperacion?: string;
}

export const FORMATOS_COMPROBANTE = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAXIMO_COMPROBANTE = 5 * 1024 * 1024;
