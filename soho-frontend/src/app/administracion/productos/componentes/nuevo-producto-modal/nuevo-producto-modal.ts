import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { EditorProducto } from '../../paginas/formulario-producto/editor-producto';

@Component({
  selector: 'app-nuevo-producto-modal',
  imports: [VentanaDialogo, EditorProducto],
  templateUrl: './nuevo-producto-modal.html',
  styleUrl: './nuevo-producto-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuevoProductoModal {
  readonly volver = input('/admin/productos');
  readonly cancelado = output<void>();
  private readonly editor = viewChild(EditorProducto);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focoAnterior = inject(DOCUMENT).activeElement;
  private cerrando = false;

  puedeSalir(): boolean | Promise<boolean> {
    return this.editor()?.puedeSalir() ?? true;
  }

  protected async cerrar() {
    if (this.cerrando) return;
    this.cerrando = true;
    try {
      if (await this.puedeSalir()) this.cancelado.emit();
    } finally {
      this.cerrando = false;
    }
  }

  ngOnDestroy() {
    this.elemento.nativeElement.querySelector<HTMLDialogElement>('dialog[open]')?.close();
    if (this.focoAnterior instanceof HTMLElement && this.focoAnterior.isConnected)
      this.focoAnterior.focus({ preventScroll: true });
  }
}
