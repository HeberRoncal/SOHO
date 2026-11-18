import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-precio-producto',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './precio-producto.html',
  styleUrl: './precio-producto.css',
})
export class PrecioProducto {
  readonly precio = input(0);
  readonly precioAnterior = input<number | null>(null);
  private readonly formato = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  });
  protected readonly importe = computed(() => this.formato.format(this.precio()));
  protected readonly anterior = computed(() =>
    this.precioAnterior() === null ? null : this.formato.format(this.precioAnterior()!),
  );
}
