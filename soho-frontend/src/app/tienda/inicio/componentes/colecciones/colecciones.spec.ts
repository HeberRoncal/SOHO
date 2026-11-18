import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Colecciones } from './colecciones';

describe('Colecciones', () => {
  let componente: Colecciones;
  let escenario: ComponentFixture<Colecciones>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Colecciones],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(Colecciones);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
