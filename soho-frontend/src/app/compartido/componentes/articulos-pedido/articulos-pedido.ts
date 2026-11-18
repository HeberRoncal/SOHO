import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ArticuloPedido } from '../../../tienda/pedidos/modelos/articulo-pedido';
import { PrecioProducto } from '../precio-producto/precio-producto';

@Component({
  imports: [PrecioProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-articulos-pedido',
  styleUrl: './articulos-pedido.css',
  templateUrl: './articulos-pedido.html',
})
export class ArticulosPedido {
  readonly articulos = input<readonly ArticuloPedido[]>([]);
  readonly mostrarDetalle = input(false);
}
