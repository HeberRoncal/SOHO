export interface ArticuloPedido {
  readonly sku: string;
  readonly nombre: string;
  readonly marca?: string;
  readonly color: string;
  readonly talla: string;
  readonly imagen: string;
  readonly cantidad: number;
  readonly precioUnitario: number;
  readonly importe: number;
}
