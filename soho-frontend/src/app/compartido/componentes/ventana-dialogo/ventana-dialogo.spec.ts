import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VentanaDialogo } from './ventana-dialogo';

describe('VentanaDialogo', () => {
  let componente: VentanaDialogo;
  let escenario: ComponentFixture<VentanaDialogo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentanaDialogo],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(VentanaDialogo);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
