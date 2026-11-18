import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Campana } from './campana';

describe('Campana', () => {
  let componente: Campana;
  let escenario: ComponentFixture<Campana>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Campana],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(Campana);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
