import { ZoomImagen } from './zoom-imagen';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GaleriaProducto } from '../../tienda/detalle-producto/componentes/galeria-producto/galeria-producto';

describe('Zoom de la imagen principal', () => {
  let vista: ComponentFixture<GaleriaProducto>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GaleriaProducto] }).compileComponents();
    vista = TestBed.createComponent(GaleriaProducto);
    vista.componentRef.setInput('imagenes', [
      '/imagenes/productos/af1.png',
      '/imagenes/productos/samba.png',
    ]);
    await vista.whenStable();
  });
  it('debe aplicarse únicamente a la imagen principal', () => {
    const imagenes = vista.debugElement.queryAll(By.directive(ZoomImagen));
    expect(imagenes).toHaveLength(1);
    expect(imagenes[0].nativeElement.classList.contains('principal')).toBe(true);
  });
  it('debe restablecer el zoom al cambiar fotografía y conjunto de imágenes', async () => {
    const imagen = vista.nativeElement.querySelector('.principal') as HTMLImageElement;
    imagen.style.transform = 'scale(2)';
    vista.nativeElement.querySelector('button[aria-label="Ver imagen 2"]').click();
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.principal').style.transform).toBe('');
    vista.nativeElement.querySelector('.principal').style.transform = 'scale(2)';
    vista.componentRef.setInput('imagenes', ['/imagenes/productos/samba_b.png']);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.principal').style.transform).toBe('');
  });
  it('debe limpiar la transformación al destruir la vista', () => {
    const imagen = vista.nativeElement.querySelector('.principal') as HTMLImageElement;
    imagen.style.transform = 'scale(2)';
    vista.destroy();
    expect(imagen.style.transform).toBe('');
  });
});
