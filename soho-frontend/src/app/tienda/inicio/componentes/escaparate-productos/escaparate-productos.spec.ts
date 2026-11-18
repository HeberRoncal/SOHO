import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EscaparateProductos } from './escaparate-productos';

describe('EscaparateProductos', () => {
  let componente: EscaparateProductos;
  let escenario: ComponentFixture<EscaparateProductos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EscaparateProductos],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(EscaparateProductos);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
