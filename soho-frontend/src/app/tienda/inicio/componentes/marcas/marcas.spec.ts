import { proveerCatalogoPrueba } from '../../../catalogo/pruebas/catalogo.fixture';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Marcas } from './marcas';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Marcas', () => {
  let componente: Marcas;
  let escenario: ComponentFixture<Marcas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Marcas],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(Marcas);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
