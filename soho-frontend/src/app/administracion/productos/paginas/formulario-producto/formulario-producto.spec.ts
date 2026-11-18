import { Component, forwardRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormularioProducto } from './formulario-producto';
import { EditorProducto } from './editor-producto';
@Component({
  selector: 'app-editor-producto',
  template: '',
  providers: [{ provide: EditorProducto, useExisting: forwardRef(() => EditorPrueba) }],
})
class EditorPrueba {
  puedeSalir = vi.fn<() => boolean | Promise<boolean>>(() => true);
}
describe('Entrada al editor real de productos', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FormularioProducto] });
    TestBed.overrideComponent(FormularioProducto, {
      remove: { imports: [EditorProducto] },
      add: { imports: [EditorPrueba] },
    });
  });
  it('monta el editor sin crear un formulario de demostración', () => {
    const f = TestBed.createComponent(FormularioProducto);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-editor-producto')).toHaveLength(1);
    expect(f.nativeElement.querySelector('form')).toBeNull();
    expect(f.componentInstance.puedeSalir()).toBe(true);
  });
  it('conserva la protección de cambios al delegar la salida al editor', async () => {
    const f = TestBed.createComponent(FormularioProducto);
    f.detectChanges();
    const editor = f.debugElement.query(By.directive(EditorPrueba))
      .componentInstance as EditorPrueba;
    editor.puedeSalir.mockResolvedValue(false);
    expect(await f.componentInstance.puedeSalir()).toBe(false);
    expect(editor.puedeSalir).toHaveBeenCalledOnce();
  });
});
