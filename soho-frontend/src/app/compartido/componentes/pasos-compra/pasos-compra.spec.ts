import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PasosCompra } from './pasos-compra';

describe('PasosCompra', () => {
  let componente: PasosCompra;
  let escenario: ComponentFixture<PasosCompra>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PasosCompra],
    }).compileComponents();

    escenario = TestBed.createComponent(PasosCompra);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
