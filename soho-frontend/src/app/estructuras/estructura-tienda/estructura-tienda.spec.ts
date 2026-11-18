import { proveerCatalogoPrueba } from '../../tienda/catalogo/pruebas/catalogo.fixture';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EstructuraTienda } from './estructura-tienda';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('EstructuraTienda', () => {
  let componente: EstructuraTienda;
  let escenario: ComponentFixture<EstructuraTienda>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstructuraTienda],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    escenario = TestBed.createComponent(EstructuraTienda);
    componente = escenario.componentInstance;
    escenario.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/configuracion/tienda')
      .flush({ correo: null, whatsapp: null, horario: null });
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
