import { proveerCatalogoPrueba } from '../../pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { FiltrosCatalogo } from './filtros-catalogo';
// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('FiltrosCatalogo', () => {
  it('debe renderizar el componente', async () => {
    await TestBed.configureTestingModule({ imports: [FiltrosCatalogo] }).compileComponents();
    const escenario = TestBed.createComponent(FiltrosCatalogo);
    await escenario.whenStable();
    expect(escenario.componentInstance).toBeTruthy();
  });
});
