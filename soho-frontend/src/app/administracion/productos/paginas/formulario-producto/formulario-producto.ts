import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { EditorProducto } from './editor-producto';
@Component({
  selector: 'app-formulario-producto',
  imports: [EditorProducto],
  template: '<app-editor-producto />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormularioProducto {
  private readonly editor = viewChild(EditorProducto);
  puedeSalir(): boolean | Promise<boolean> {
    return this.editor()?.puedeSalir() ?? true;
  }
}
