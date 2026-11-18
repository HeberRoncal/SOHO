import type { CreatePedidoDto } from '../dto/create-pedido.dto.js';

export type PreparacionPedido = Pick<
  CreatePedidoDto,
  'contacto' | 'entrega' | 'facturacion' | 'articulos' | 'cotizacion'
>;
