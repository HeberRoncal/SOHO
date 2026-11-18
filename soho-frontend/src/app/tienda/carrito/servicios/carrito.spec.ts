import { proveerCatalogoPrueba } from '../../catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { Carrito, GESTOR_CARRITO } from './carrito';
import { ALMACENAMIENTO_CARRITO, CarritoLocal } from './carrito-local';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Acceso al carrito desde las vistas', () => {
  it('debe compartir el estado de la fuente inyectada sin crear otro inventario', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ALMACENAMIENTO_CARRITO, useValue: null }],
    });
    const carrito = TestBed.inject(Carrito);
    const fuente = TestBed.inject(CarritoLocal);
    expect(TestBed.inject(GESTOR_CARRITO)).toBe(fuente);
    carrito.agregar('NK-AF107-BL-40', 2);
    expect(carrito.lineas).toBe(fuente.lineas);
    expect(carrito.unidades()).toBe(2);
    carrito.cambiarCantidad('NK-AF107-BL-40', 1);
    expect(fuente.unidades()).toBe(1);
    carrito.eliminar('NK-AF107-BL-40');
    expect(fuente.lineas()).toEqual([]);
  });
});
