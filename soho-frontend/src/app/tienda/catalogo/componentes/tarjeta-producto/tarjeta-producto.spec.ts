import { PRODUCTOS_CATALOGO_PRUEBA } from '../../pruebas/productos.fixtures';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TarjetaProducto } from './tarjeta-producto';
import { ALMACENAMIENTO_FAVORITOS } from '../../../../estructuras/servicios/presentacion-tienda';

describe('TarjetaProducto', () => {
  let componente: TarjetaProducto;
  let escenario: ComponentFixture<TarjetaProducto>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TarjetaProducto],
      providers: [provideRouter([]), { provide: ALMACENAMIENTO_FAVORITOS, useValue: null }],
    }).compileComponents();

    escenario = TestBed.createComponent(TarjetaProducto);
    componente = escenario.componentInstance;
    escenario.componentRef.setInput('producto', PRODUCTOS_CATALOGO_PRUEBA[0]);
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
  it('utiliza la galería general si el color no incluye fotos y muestra el color convertido', async () => {
    const p = PRODUCTOS_CATALOGO_PRUEBA[0];
    escenario.componentRef.setInput('producto', {
      ...p,
      otrosColores: [],
      colores: [{ ...p.colores[0], imagenes: [] }],
    });
    await escenario.whenStable();
    expect(escenario.nativeElement.querySelector('img').getAttribute('src')).toBe(p.imagenes[0]);
    expect(escenario.nativeElement.querySelector('h3').textContent).toContain(p.colores[0].nombre);
  });
  it('debe permitir guardar un producto en favoritos sin abrir su detalle', async () => {
    const boton = escenario.nativeElement.querySelector('.favorito') as HTMLButtonElement;
    boton.click();
    await escenario.whenStable();
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    boton.click();
    await escenario.whenStable();
    expect(boton.getAttribute('aria-pressed')).toBe('false');
  });
});
