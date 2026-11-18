import { proveerCoberturaPrueba } from '../../../finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from '../../../catalogo/pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MiCuenta } from './mi-cuenta';
import { provideRouter } from '@angular/router';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('MiCuenta', () => {
  let component: MiCuenta;
  let fixture: ComponentFixture<MiCuenta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiCuenta],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MiCuenta);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
