import { proveerCoberturaPrueba } from '../../finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from '../../catalogo/pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeguimientoPedido } from './seguimiento-pedido';
import { provideRouter } from '@angular/router';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('SeguimientoPedido', () => {
  let componente: SeguimientoPedido;
  let escenario: ComponentFixture<SeguimientoPedido>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeguimientoPedido],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(SeguimientoPedido);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
