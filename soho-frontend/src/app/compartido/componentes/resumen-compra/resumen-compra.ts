import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PrecioProducto } from '../precio-producto/precio-producto';
import { Icono } from '../icono/icono';

@Component({
  imports: [PrecioProducto, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-resumen-compra',
  styleUrl: './resumen-compra.css',
  templateUrl: './resumen-compra.html',
})
export class ResumenCompra {
  readonly subtotal = input(0);
  readonly tasaIgv = input(18);
  readonly cantidad = input(0);
  readonly costoEntrega = input<number | null>(null);
  readonly distrito = input('');
  readonly mostrarAccion = input(true);
  readonly deshabilitado = input(false);
  readonly aviso = input('');
  readonly continuar = output<void>();
  protected readonly total = computed(
    () => (Math.round(this.subtotal() * 100) + Math.round((this.costoEntrega() ?? 0) * 100)) / 100,
  );
  private readonly formato = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  });
  protected readonly igvIncluido = computed(() => {
    const centavos = Math.round(this.total() * 100);
    const impuesto = Math.round((centavos * this.tasaIgv()) / (100 + this.tasaIgv())) / 100;
    return this.formato.format(impuesto);
  });
}
