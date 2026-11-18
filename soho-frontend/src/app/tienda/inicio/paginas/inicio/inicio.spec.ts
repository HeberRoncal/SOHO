import { proveerCatalogoPrueba } from '../../../catalogo/pruebas/catalogo.fixture';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Inicio } from './inicio';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API. waaaaaaaaaaaa
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Inicio', () => {
  let componente: Inicio;
  let escenario: ComponentFixture<Inicio>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Inicio],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(Inicio);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
