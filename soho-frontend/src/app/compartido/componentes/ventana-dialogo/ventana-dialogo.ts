import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Icono } from '../icono/icono';
@Component({
  selector: 'app-ventana-dialogo',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventana-dialogo.html',
  styleUrl: './ventana-dialogo.css',
})
export class VentanaDialogo {
  readonly abierto = input(false);
  readonly titulo = input('Información');
  readonly lateral = input(false);
  readonly identificador = input<string | null>(null);
  readonly cerrado = output<void>();
  private readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('dialogo');
  constructor() {
    effect(() => {
      const elemento = this.dialogo()?.nativeElement;
      if (!elemento) return;
      if (this.abierto() && !elemento.open) elemento.showModal();
      else if (!this.abierto() && elemento.open) elemento.close();
    });
  }
  protected cerrar() {
    this.cerrado.emit();
  }
  protected cerrarExterior(evento: MouseEvent) {
    const elemento = this.dialogo()?.nativeElement;
    if (!elemento || evento.target !== elemento) return;
    const limites = elemento.getBoundingClientRect();
    if (
      evento.clientX < limites.left ||
      evento.clientX > limites.right ||
      evento.clientY < limites.top ||
      evento.clientY > limites.bottom
    )
      this.cerrar();
  }
}
