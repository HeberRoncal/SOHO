import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { ZoomImagen } from '../../../../compartido/directivas/zoom-imagen';

@Component({
  imports: [Icono, ZoomImagen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-visor-imagenes',
  styleUrl: './visor-imagenes.css',
  templateUrl: './visor-imagenes.html',
})
export class VisorImagenes {
  readonly abierto = input(false);
  readonly imagenes = input<readonly string[]>([]);
  readonly descripcion = input('Producto');
  readonly indice = model(0);
  readonly cerrado = output<void>();
  protected readonly aumentada = signal(false);
  protected readonly imagen = computed(() => this.imagenes()[this.indice()] ?? this.imagenes()[0]);
  private readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly miniaturas = viewChildren<ElementRef<HTMLButtonElement>>('miniatura');

  constructor() {
    effect(() => {
      this.abierto();
      this.imagenes();
      this.indice();
      this.aumentada.set(false);
    });
    effect(() => {
      const elemento = this.dialogo()?.nativeElement;
      if (!elemento) return;
      if (this.abierto() && !elemento.open) elemento.showModal();
      else if (!this.abierto() && elemento.open) elemento.close();
    });
    effect(() => {
      if (!this.abierto()) return;
      const seleccionada = this.miniaturas()[this.indice()]?.nativeElement;
      const lista = seleccionada?.parentElement;
      if (!seleccionada || !lista) return;
      const limite = lista.getBoundingClientRect();
      const posicion = seleccionada.getBoundingClientRect();
      if (posicion.left < limite.left) lista.scrollLeft -= limite.left - posicion.left;
      else if (posicion.right > limite.right) lista.scrollLeft += posicion.right - limite.right;
    });
    inject(DestroyRef).onDestroy(() => {
      const elemento = this.dialogo()?.nativeElement;
      if (elemento?.open) elemento.close();
    });
  }

  protected seleccionar(posicion: number) {
    if (posicion >= 0 && posicion < this.imagenes().length) this.indice.set(posicion);
  }
  protected avanzar(direccion: number) {
    const cantidad = this.imagenes().length;
    if (cantidad > 1) this.seleccionar((this.indice() + direccion + cantidad) % cantidad);
  }
  protected navegar(evento: KeyboardEvent) {
    if (evento.key === 'Tab') {
      const dialogo = this.dialogo()?.nativeElement;
      const botones = dialogo?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
      if (!dialogo || !botones?.length) return;
      const primero = botones[0];
      const ultimo = botones[botones.length - 1];
      const activo = dialogo.ownerDocument.activeElement;
      if (evento.shiftKey && activo === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
      return;
    }
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
    evento.preventDefault();
    this.avanzar(evento.key === 'ArrowRight' ? 1 : -1);
  }
  protected cerrar() {
    this.cerrado.emit();
  }
}
