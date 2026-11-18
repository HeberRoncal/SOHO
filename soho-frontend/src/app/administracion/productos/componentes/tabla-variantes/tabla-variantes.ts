import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ColorProducto } from '../../../../tienda/catalogo/modelos/color-producto';
import { VarianteProducto } from '../../../../tienda/catalogo/modelos/variante-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tabla-variantes',
  styleUrl: './tabla-variantes.css',
  templateUrl: './tabla-variantes.html',
})
export class TablaVariantes {
  readonly variantes = input<readonly VarianteProducto[]>([]);
  readonly colores = input<readonly ColorProducto[]>([]);
  readonly guardadas = input<readonly VarianteProducto[]>([]);
  readonly bloqueado = input(false);
  readonly cambio = output<readonly VarianteProducto[]>();
  readonly movimiento = output<string>();
  protected readonly filtro = signal('');
  protected readonly textosStock = signal<Readonly<Record<string, string>>>({});
  private readonly skusGuardados = computed(() => new Set(this.guardadas().map((v) => v.sku)));
  protected readonly filas = computed(() =>
    this.variantes().filter((v) => {
      const f = this.filtro();
      return f === 'habilitadas'
        ? v.habilitada
        : f === 'deshabilitadas'
          ? !v.habilitada
          : f === 'agotadas'
            ? v.habilitada && this.disponible(v) === 0
            : f === 'bajo'
              ? v.habilitada && this.disponible(v) > 0 && this.disponible(v) <= 2
              : true;
    }),
  );
  protected nueva(v: VarianteProducto) {
    return !this.skusGuardados().has(v.sku);
  }
  protected color(codigo: string) {
    return this.colores().find((c) => c.codigo === codigo)?.nombre ?? codigo;
  }
  protected disponible(v: VarianteProducto) {
    return v.habilitada && Number.isFinite(v.existencias)
      ? Math.max(0, v.existencias - v.cantidadReservada)
      : 0;
  }
  protected invalidarStock(v: VarianteProducto) {
    return !Number.isInteger(v.existencias) || v.existencias < 0 || v.existencias > 99999;
  }
  protected stock(v: VarianteProducto, evento: Event) {
    if (!this.nueva(v) || this.bloqueado()) return;
    const texto = (evento.target as HTMLInputElement).value;
    this.textosStock.update((t) => ({ ...t, [v.sku]: texto }));
    const existencias = texto === '' ? 0 : /^\d+$/.test(texto) ? Number(texto) : NaN;
    this.cambio.emit(
      this.variantes().map((actual) =>
        actual.sku === v.sku ? { ...actual, existencias } : actual,
      ),
    );
  }
  protected habilitar(v: VarianteProducto, evento: Event) {
    if (!this.bloqueado())
      this.cambio.emit(
        this.variantes().map((actual) =>
          actual.sku === v.sku
            ? { ...actual, habilitada: (evento.target as HTMLInputElement).checked }
            : actual,
        ),
      );
  }
  protected quitar(v: VarianteProducto) {
    if (this.nueva(v) && !this.bloqueado()) {
      this.textosStock.update((t) => {
        const siguientes = { ...t };
        delete siguientes[v.sku];
        return siguientes;
      });
      this.cambio.emit(this.variantes().filter((actual) => actual.sku !== v.sku));
    }
  }
  protected filtrar(evento: Event) {
    this.filtro.set((evento.target as HTMLSelectElement).value);
  }
}
