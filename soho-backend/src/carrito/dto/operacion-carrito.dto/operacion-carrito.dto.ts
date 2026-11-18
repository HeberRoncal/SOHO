export class OperacionCarritoDto {
  clave: string;
  version: number;
  tipo: 'GUARDAR' | 'COMBINAR';
  articulos: Array<{ sku: string; cantidad: number }>;
}
