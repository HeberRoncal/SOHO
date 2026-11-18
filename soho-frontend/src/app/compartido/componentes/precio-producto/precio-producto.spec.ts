import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrecioProducto } from './precio-producto';

describe('PrecioProducto', () => {
  let componente: PrecioProducto;
  let escenario: ComponentFixture<PrecioProducto>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrecioProducto],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(PrecioProducto);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
