import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ResumenCheckout } from './resumen-checkout';

describe('Resumen de compra sin promociones locales', () => {
  const crear = () => {
    TestBed.configureTestingModule({ imports: [ResumenCheckout], providers: [provideRouter([])] });
    const f = TestBed.createComponent(ResumenCheckout);
    f.componentRef.setInput('articulos', [
      {
        sku: 'TEST-BL-40',
        nombre: 'Producto de prueba',
        color: 'Blanco',
        talla: '40',
        cantidad: 2,
        precioUnitario: 99.99,
        importe: 199.98,
      },
    ]);
    f.componentRef.setInput('subtotal', 199.98);
    return f;
  };
  const texto = (f: ReturnType<typeof crear>, selector: string) =>
    (f.nativeElement as HTMLElement).querySelector(selector)?.textContent?.replace(/\s/g, '');

  it('un código ilustrativo no aplica descuentos ni muestra controles de cupón en el checkout', () => {
    const f = crear();
    f.componentRef.setInput('costoEntrega', 6);
    f.componentRef.setInput('cupon', 'DEMO10');
    f.detectChanges();
    expect(texto(f, '.total app-precio-producto')).toBe('S/205.98');
    expect(f.nativeElement.querySelector('.descuento')).toBeNull();
    expect(f.nativeElement.querySelector('.cupon-aplicado')).toBeNull();
    expect(f.nativeElement.querySelector('form, input, details.cupon')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Prototipo');
  });
  it('conserva el descuento y total históricos de la API sin deducir un porcentaje del código', () => {
    const f = crear();
    f.componentRef.setInput('confirmado', true);
    f.componentRef.setInput('costoEntrega', 6);
    f.componentRef.setInput('cupon', 'DEMO10');
    f.componentRef.setInput('descuentoConfirmado', 7.25);
    f.componentRef.setInput('totalConfirmado', 198.73);
    f.detectChanges();
    expect(texto(f, '.descuento dt')).toBe('Descuento');
    expect(texto(f, '.descuento app-precio-producto')).toBe('S/7.25');
    expect(texto(f, '.total app-precio-producto')).toBe('S/198.73');
    expect(f.nativeElement.querySelector('.cupon-aplicado')?.textContent).toContain('DEMO10');
    expect(f.nativeElement.querySelector('.cupon-aplicado button')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('10%');
    f.componentRef.setInput('subtotal', 999);
    f.detectChanges();
    expect(texto(f, '.total app-precio-producto')).toBe('S/198.73');
  });
  it('muestra un total confirmado de cero y un descuento histórico sin código', () => {
    const f = crear();
    f.componentRef.setInput('confirmado', true);
    f.componentRef.setInput('costoEntrega', 0);
    f.componentRef.setInput('descuentoConfirmado', 199.98);
    f.componentRef.setInput('totalConfirmado', 0);
    f.detectChanges();
    expect(texto(f, '.descuento app-precio-producto')).toBe('S/199.98');
    expect(texto(f, '.total app-precio-producto')).toBe('S/0.00');
    expect(f.nativeElement.querySelector('.cupon-aplicado')).toBeNull();
  });
  it('mantiene el total pendiente hasta conocer el envío y acepta la tarifa gratuita confirmada', () => {
    const f = crear();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.total app-precio-producto')).toBeNull();
    expect(f.nativeElement.textContent).toContain('Total pendiente de envío');
    f.componentRef.setInput('costoEntrega', 0);
    f.detectChanges();
    expect(texto(f, '.total app-precio-producto')).toBe('S/199.98');
    expect(f.nativeElement.textContent).toContain('Gratis');
    expect(f.nativeElement.textContent).not.toContain('Tarifa de ejemplo');
  });
});
