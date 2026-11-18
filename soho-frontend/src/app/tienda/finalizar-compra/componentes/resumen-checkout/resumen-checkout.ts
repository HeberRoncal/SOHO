import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { ArticuloPedido } from '../../../pedidos/modelos/articulo-pedido';
@Component({
  selector: 'app-resumen-checkout',
  imports: [RouterLink, Icono, PrecioProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resumen-checkout.html',
  styleUrl: './resumen-checkout.css',
})
export class ResumenCheckout {
  readonly articulos = input<readonly ArticuloPedido[]>([]);
  readonly subtotal = input(0);
  readonly costoEntrega = input<number | null>(null);
  readonly distrito = input('');
  readonly cupon = input('');
  readonly confirmado = input(false);
  readonly descuentoConfirmado = input<number | null>(null);
  readonly totalConfirmado = input<number | null>(null);
  protected readonly abierto = signal(false);
  protected readonly cantidad = computed(() =>
    this.articulos().reduce((s, a) => s + a.cantidad, 0),
  );
  protected readonly descuento = computed(() =>
    this.confirmado() && this.descuentoConfirmado() !== null ? this.descuentoConfirmado()! : 0,
  );
  protected readonly total = computed(() =>
    this.confirmado() && this.totalConfirmado() !== null
      ? this.totalConfirmado()
      : this.costoEntrega() === null
        ? null
        : (Math.round(this.subtotal() * 100) -
            Math.round(this.descuento() * 100) +
            Math.round((this.costoEntrega() ?? 0) * 100)) /
          100,
  );
}
