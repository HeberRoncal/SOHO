import { proveerCatalogoPrueba } from '../catalogo/pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Carrito } from './carrito';
import { Carrito as ServicioCarrito } from './servicios/carrito';
import { ALMACENAMIENTO_CARRITO } from './servicios/carrito-local';
import {
  ALMACENAMIENTO_FAVORITOS,
  PresentacionTienda,
} from '../../estructuras/servicios/presentacion-tienda';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Página del carrito', () => {
  let vista: ComponentFixture<Carrito>;
  let carrito: ServicioCarrito;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Carrito],
      providers: [
        provideRouter([]),
        { provide: ALMACENAMIENTO_CARRITO, useValue: null },
        { provide: ALMACENAMIENTO_FAVORITOS, useValue: null },
      ],
    }).compileComponents();
    carrito = TestBed.inject(ServicioCarrito);
    vista = TestBed.createComponent(Carrito);
    await vista.whenStable();
  });
  it('debe mostrar el estado vacío y un enlace al catálogo', () => {
    expect(vista.nativeElement.querySelector('#titulo-carrito-vacio').textContent).toContain(
      'Tu próximo par',
    );
    expect(vista.nativeElement.querySelector('.mensaje-vacio a').getAttribute('href')).toBe(
      '/zapatillas',
    );
    expect(vista.nativeElement.querySelector('app-resumen-compra')).toBeNull();
  });
  it('debe reflejar altas, cantidades y eliminaciones en el resumen', async () => {
    carrito.agregar('NK-AF107-BL-40', 1);
    await vista.whenStable();
    expect(vista.nativeElement.querySelectorAll('app-producto-carrito')).toHaveLength(1);
    vista.nativeElement
      .querySelector('app-producto-carrito button[aria-label^="Aumentar cantidad"]')
      .click();
    await vista.whenStable();
    expect(carrito.unidades()).toBe(2);
    expect(vista.nativeElement.querySelector('app-resumen-compra').textContent).toContain(
      '2 productos',
    );
    vista.nativeElement.querySelector('app-producto-carrito .eliminar').click();
    await vista.whenStable();
    expect(carrito.unidades()).toBe(0);
    expect(vista.nativeElement.querySelector('.mensaje-vacio')).not.toBeNull();
  });
  it('debe abrir Finalizar compra conservando los productos del carrito', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    carrito.agregar('NK-AF107-BL-40', 1);
    await vista.whenStable();
    vista.nativeElement.querySelector('app-resumen-compra button').click();
    expect(navegar).toHaveBeenCalledExactlyOnceWith(['/finalizar-compra']);
    expect(carrito.unidades()).toBe(1);
  });

  it('debe sincronizar los favoritos entre las variantes del mismo producto', async () => {
    carrito.agregar('NK-AF107-BL-40', 1);
    carrito.agregar('NK-AF107-BL-41', 1);
    await vista.whenStable();
    vista.nativeElement.querySelector('.favorito').click();
    await vista.whenStable();
    expect(TestBed.inject(PresentacionTienda).favoritos()).toEqual(['af1']);
    const botones = vista.nativeElement.querySelectorAll('.favorito');
    expect(
      [...botones].every((boton: Element) => boton.getAttribute('aria-pressed') === 'true'),
    ).toBe(true);
    expect(carrito.unidades()).toBe(2);
  });
});
