import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ArticulosPedido } from './articulos-pedido';

describe('ArticulosPedido', () => {
  let componente: ArticulosPedido;
  let escenario: ComponentFixture<ArticulosPedido>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticulosPedido],
    }).compileComponents();

    escenario = TestBed.createComponent(ArticulosPedido);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
