import { Component, forwardRef, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MovimientoInventario } from './movimiento-inventario';
import { MovimientoInventarioReal } from './movimiento-inventario-real';
@Component({
  selector: 'app-movimiento-inventario-real',
  template: '',
  providers: [
    { provide: MovimientoInventarioReal, useExisting: forwardRef(() => MovimientoPrueba) },
  ],
})
class MovimientoPrueba {
  readonly abierto = input(false);
  readonly skuInicial = input('');
  readonly productoId = input('');
  readonly cerrado = output<void>();
  readonly registrado = output<unknown>();
  puedeSalir = vi.fn<() => boolean | Promise<boolean>>(() => true);
}
describe('Entrada al movimiento real de inventario', () => {
  it('conserva selección, cierre y protección de cambios del diálogo real', async () => {
    TestBed.configureTestingModule({ imports: [MovimientoInventario] });
    TestBed.overrideComponent(MovimientoInventario, {
      remove: { imports: [MovimientoInventarioReal] },
      add: { imports: [MovimientoPrueba] },
    });
    const f = TestBed.createComponent(MovimientoInventario);
    f.componentRef.setInput('abierto', true);
    f.componentRef.setInput('skuInicial', 'SKU-REAL');
    f.componentRef.setInput('productoId', 'producto-real');
    f.detectChanges();
    const editor = f.debugElement.query(By.directive(MovimientoPrueba))
      .componentInstance as MovimientoPrueba;
    expect([editor.abierto(), editor.skuInicial(), editor.productoId()]).toEqual([
      true,
      'SKU-REAL',
      'producto-real',
    ]);
    const cerrado = vi.fn();
    f.componentInstance.cerrado.subscribe(cerrado);
    editor.cerrado.emit();
    expect(cerrado).toHaveBeenCalledOnce();
    editor.puedeSalir.mockResolvedValue(false);
    expect(await f.componentInstance.puedeSalir()).toBe(false);
  });
});
