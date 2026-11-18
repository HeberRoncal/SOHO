import { proveerCoberturaPrueba } from '../../finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from '../../catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { GESTOR_PEDIDOS, Pedidos } from './pedidos';
import { PedidosApi } from './pedidos-api';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('Pedidos', () => {
  let servicio: Pedidos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(Pedidos);
  });

  it('usa la API por defecto y comparte sus estados sin una fuente local alternativa', () => {
    const api = TestBed.inject(PedidosApi);
    expect(TestBed.inject(GESTOR_PEDIDOS)).toBe(api);
    expect(servicio.estadoListado).toBe(api.estadoListado);
    expect(servicio.envioPendiente).toBe(api.envioPendiente);
    expect(servicio.remoto).toBe(true);
  });
});
