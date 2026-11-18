import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';

@Component({
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-filtro-precio',
  styleUrl: './filtro-precio.css',
  templateUrl: './filtro-precio.html',
})
export class FiltroPrecio {
  readonly identificador = input('precio');
  readonly limiteInferior = input(0);
  readonly limiteSuperior = input(100);
  readonly minimo = input<number>();
  readonly maximo = input<number>();
  readonly minimoCambiado = output<number | undefined>();
  readonly maximoCambiado = output<number | undefined>();

  // Los importes de una URL conservan su valor aunque estén fuera del catálogo actual.
  protected readonly inferior = computed(() =>
    Math.min(this.limiteInferior(), this.minimo() ?? Infinity, this.maximo() ?? Infinity),
  );
  protected readonly superior = computed(() =>
    Math.max(this.limiteSuperior(), this.minimo() ?? 0, this.maximo() ?? 0),
  );
  protected readonly valores = linkedSignal(() => ({
    minimo: this.minimo() ?? this.inferior(),
    maximo: this.maximo() ?? this.superior(),
  }));
  protected readonly porcentajeMinimo = computed(() => this.porcentaje(this.valores().minimo));
  protected readonly porcentajeMaximo = computed(() => this.porcentaje(this.valores().maximo));
  private readonly formato = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

  protected formatear(valor: number) {
    return 'S/ ' + this.formato.format(valor);
  }
  protected deslizar(campo: 'minimo' | 'maximo', entrada: HTMLInputElement) {
    const valor = entrada.valueAsNumber;
    if (!Number.isFinite(valor)) return;
    const ajustado =
      campo === 'minimo'
        ? Math.min(valor, this.valores().maximo)
        : Math.max(valor, this.valores().minimo);
    this.valores.update((actuales) => ({ ...actuales, [campo]: ajustado }));
    entrada.value = String(ajustado);
  }
  protected confirmar(campo: 'minimo' | 'maximo') {
    this.emitir(campo, this.valores()[campo]);
  }
  protected escribir(campo: 'minimo' | 'maximo', entrada: HTMLInputElement) {
    if (!entrada.validity.valid) {
      entrada.reportValidity();
      entrada.value = String(this.valores()[campo]);
      return;
    }
    const valor = entrada.value.trim() === '' ? undefined : entrada.valueAsNumber;
    if (valor !== undefined && !Number.isFinite(valor)) return;
    const mostrado = valor ?? (campo === 'minimo' ? this.inferior() : this.superior());
    this.valores.update((actuales) => ({ ...actuales, [campo]: mostrado }));
    entrada.value = String(mostrado);
    this.emitir(campo, valor);
  }
  private emitir(campo: 'minimo' | 'maximo', valor: number | undefined) {
    if (campo === 'minimo') this.minimoCambiado.emit(valor);
    else this.maximoCambiado.emit(valor);
  }
  private porcentaje(valor: number) {
    const amplitud = this.superior() - this.inferior();
    return amplitud > 0 ? ((valor - this.inferior()) / amplitud) * 100 : 0;
  }
}
