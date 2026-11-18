import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EstadoPedido } from './estado-pedido';

describe('EstadoPedido', () => {
  let componente: EstadoPedido;
  let escenario: ComponentFixture<EstadoPedido>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstadoPedido],
    }).compileComponents();

    escenario = TestBed.createComponent(EstadoPedido);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
