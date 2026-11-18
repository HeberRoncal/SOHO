export const SISTEMA_TALLAS = 'EU' as const;

export interface VarianteProducto {
  readonly identificador: string;
  readonly sku: string;
  readonly codigoColor: string;
  readonly talla: string;
  readonly sistemaTallas: typeof SISTEMA_TALLAS;
  readonly existencias: number;
  readonly cantidadReservada: number;
  readonly habilitada: boolean;
}
