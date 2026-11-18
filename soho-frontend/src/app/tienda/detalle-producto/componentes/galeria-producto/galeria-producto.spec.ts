import { TestBed } from '@angular/core/testing';
import { GaleriaProducto } from './galeria-producto';
describe('Galería de producto', () => {
  it('debe volver a la primera fotografía al recibir las imágenes de otro color', async () => {
    await TestBed.configureTestingModule({ imports: [GaleriaProducto] }).compileComponents();
    const escenario = TestBed.createComponent(GaleriaProducto);
    escenario.componentRef.setInput('imagenes', [
      '/imagenes/productos/samba.png',
      '/imagenes/productos/samba_b.png',
    ]);
    await escenario.whenStable();
    escenario.nativeElement.querySelector('button[aria-label="Ver imagen 2"]').click();
    await escenario.whenStable();
    expect(escenario.nativeElement.querySelector('.principal').getAttribute('src')).toContain(
      'samba_b.png',
    );
    escenario.componentRef.setInput('imagenes', ['/imagenes/productos/af1.png']);
    await escenario.whenStable();
    expect(escenario.nativeElement.querySelector('.principal').getAttribute('src')).toContain(
      'af1.png',
    );
  });
});
