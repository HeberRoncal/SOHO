import { Pedido } from './pedido';

export type ResultadoPedido =
  | { readonly correcto: true; readonly pedido: Pedido }
  | { readonly correcto: false; readonly mensaje: string; readonly codigo?: string };
