import type { CreatePedidoDto } from './create-pedido.dto.js';
export class CorregirComprobanteDto {
  versionPedido: number;
  versionPago: number;
  comprobanteId: string;
  comprobante: CreatePedidoDto['comprobante'];
}
