import { proveerCoberturaPrueba } from '../../../finalizar-compra/pruebas/cobertura.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DireccionesCuenta } from './direcciones-cuenta';

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('DireccionesCuenta', () => {
  let component: DireccionesCuenta;
  let fixture: ComponentFixture<DireccionesCuenta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DireccionesCuenta],
    }).compileComponents();

    fixture = TestBed.createComponent(DireccionesCuenta);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
