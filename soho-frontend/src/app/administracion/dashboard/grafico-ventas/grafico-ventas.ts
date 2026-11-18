import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { VentaDiaria } from '../resumen-dashboard';

@Component({
  selector: 'app-grafico-ventas',
  imports: [DatePipe, CurrencyPipe],
  templateUrl: './grafico-ventas.html',
  styleUrl: './grafico-ventas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'cerrarFuera($event)', '(window:resize)': 'ocultar()' },
})
export class GraficoVentas {
  private static secuencia = 0;
  readonly tooltipId = 'ventas-dia-' + ++GraficoVentas.secuencia;
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cambios = inject(ChangeDetectorRef);
  private readonly tooltip = viewChild<ElementRef<HTMLElement>>('tooltip');
  private cierre: ReturnType<typeof setTimeout> | undefined;
  readonly serie = input.required<readonly VentaDiaria[]>();
  readonly abierto = signal(false);
  readonly posicion = signal({ izquierda: 0, arriba: 0 });
  private readonly elegido = signal('');
  readonly maximo = computed(() =>
    Math.max(500, Math.ceil(Math.max(0, ...this.serie().map((p) => p.importe)) / 500) * 500),
  );
  readonly escalas = computed(() => [
    this.maximo(),
    this.maximo() * 0.75,
    this.maximo() * 0.5,
    this.maximo() * 0.25,
    0,
  ]);
  readonly activo = computed(
    () =>
      this.serie().find((p) => p.dia === this.elegido()) ??
      [...this.serie()].reverse().find((p) => p.pedidos > 0) ??
      this.serie().at(-1),
  );
  readonly paso = computed(() => Math.max(1, Math.ceil(this.serie().length / 6)));
  readonly hayVentas = computed(() => this.serie().some((p) => p.pedidos > 0));
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelarCierre());
  }
  cancelarCierre() {
    clearTimeout(this.cierre);
  }
  entrar(dia: string, barra: HTMLButtonElement, evento: PointerEvent) {
    if (evento.pointerType !== 'touch') this.mostrar(dia, barra);
  }
  mostrar(dia: string, barra: HTMLButtonElement) {
    this.cancelarCierre();
    this.elegido.set(dia);
    this.abierto.set(true);
    this.cambios.detectChanges();
    const caja = this.tooltip()?.nativeElement;
    if (!caja) return;
    const r = barra.getBoundingClientRect(),
      host = this.elemento.nativeElement.getBoundingClientRect();
    const limiteSuperior = Math.max(
      8,
      document.querySelector('.barra-superior')?.getBoundingClientRect().bottom ?? 8,
    );
    const izquierda = Math.max(
      8,
      Math.min(
        r.left + r.width / 2 - caja.offsetWidth / 2,
        window.innerWidth - caja.offsetWidth - 8,
      ),
    );
    const arriba = Math.max(limiteSuperior + 8, r.top - caja.offsetHeight - 8);
    this.posicion.set({ izquierda: izquierda - host.left, arriba: arriba - host.top });
    this.cambios.detectChanges();
  }
  salir() {
    this.cancelarCierre();
    this.cierre = setTimeout(() => {
      if (!this.elemento.nativeElement.querySelector('.barra:focus')) this.ocultar();
    }, 100);
  }
  ocultar() {
    this.cancelarCierre();
    this.abierto.set(false);
  }
  desplazar() {
    const barra = this.elemento.nativeElement.querySelector<HTMLButtonElement>('.barra:focus');
    if (this.abierto() && barra && this.activo()) {
      const r = barra.getBoundingClientRect(),
        contenedor = barra.parentElement!.parentElement!.getBoundingClientRect();
      if (r.right > contenedor.left && r.left < contenedor.right) {
        this.mostrar(this.activo()!.dia, barra);
        return;
      }
    }
    this.ocultar();
  }
  cerrarFuera(evento: PointerEvent) {
    const destino = evento.target;
    if (
      !(destino instanceof Element) ||
      !this.elemento.nativeElement.contains(destino) ||
      (!destino.closest('.barra') && !this.tooltip()?.nativeElement.contains(destino))
    )
      this.ocultar();
  }
  teclado(evento: KeyboardEvent, indice: number) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      this.ocultar();
      return;
    }
    const ultimo = this.serie().length - 1;
    const nuevo =
      evento.key === 'ArrowRight'
        ? Math.min(ultimo, indice + 1)
        : evento.key === 'ArrowLeft'
          ? Math.max(0, indice - 1)
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? ultimo
              : null;
    if (nuevo === null) return;
    evento.preventDefault();
    const botones = (
      evento.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLButtonElement>('button');
    const barra = botones?.[nuevo];
    if (barra) {
      barra.focus();
      this.mostrar(this.serie()[nuevo].dia, barra);
    }
  }
  escala(n: number) {
    return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(n);
  }
}
