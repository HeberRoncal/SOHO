import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Portada } from './portada';

describe('Portada', () => {
  let componente: Portada;
  let escenario: ComponentFixture<Portada>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Portada],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(Portada);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
