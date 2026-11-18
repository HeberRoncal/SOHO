import { TestBed } from '@angular/core/testing';
import { ResumenCompra } from './resumen-compra';

describe('Resumen de compra', () => {
  it('debe sumar la entrega una sola vez y mostrar Gratis para La Esperanza', async () => {
    const vista = TestBed.createComponent(ResumenCompra);
    vista.componentRef.setInput('subtotal', 529.9);
    vista.componentRef.setInput('costoEntrega', 6);
    vista.componentRef.setInput('distrito', 'Trujillo');
    vista.componentRef.setInput('mostrarAccion', false);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.envio').textContent).toContain('6.00');
    expect(vista.nativeElement.querySelector('.total').textContent).toContain('535.90');
    expect(vista.nativeElement.querySelector('.impuestos').textContent).toContain('81.75');
    expect(vista.nativeElement.querySelector('button')).toBeNull();
    vista.componentRef.setInput('costoEntrega', 0);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.envio').textContent).toContain('Gratis');
    expect(vista.nativeElement.querySelector('.total').textContent).toContain('529.90');
  });
  it('debe mostrar el subtotal y el envío por calcular sin presentarlo como gratuito', async () => {
    const vista = TestBed.createComponent(ResumenCompra);
    vista.componentRef.setInput('subtotal', 1059.8);
    vista.componentRef.setInput('cantidad', 2);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.cantidad').textContent).toContain('2 productos');
    expect(vista.nativeElement.querySelector('.envio').textContent).toContain('Por calcular');
    expect(vista.nativeElement.querySelector('.detalle-envio').textContent).toContain('distrito');
    let acciones = 0;
    vista.componentInstance.continuar.subscribe(() => acciones++);
    vista.nativeElement.querySelector('button').click();
    expect(acciones).toBe(1);
    vista.componentRef.setInput('deshabilitado', true);
    await vista.whenStable();
    vista.nativeElement.querySelector('button').click();
    expect(acciones).toBe(1);
  });
  it('debe desglosar el IGV que ya está incluido sin sumarlo nuevamente al importe', async () => {
    const vista = TestBed.createComponent(ResumenCompra);
    vista.componentRef.setInput('subtotal', 718);
    vista.componentRef.setInput('cantidad', 2);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.impuestos').textContent).toMatch(
      /IGV incluido\s+S\/\s*109\.53/,
    );
    expect(vista.nativeElement.querySelector('.total').textContent).toContain('718.00');
    vista.componentRef.setInput('subtotal', 359);
    vista.componentRef.setInput('cantidad', 1);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.cantidad').textContent).toContain('1 producto');
    expect(vista.nativeElement.querySelector('.impuestos').textContent).toContain('54.76');
    expect(vista.nativeElement.querySelector('.total').textContent).toContain('359.00');
    vista.componentRef.setInput('tasaIgv', 0);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.impuestos').textContent).toContain('0.00');
  });
});
