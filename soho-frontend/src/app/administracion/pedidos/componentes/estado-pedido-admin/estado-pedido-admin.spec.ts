import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EstadoPedidoAdmin } from './estado-pedido-admin';

describe('EstadoPedidoAdmin', () => {
  let component: EstadoPedidoAdmin;
  let fixture: ComponentFixture<EstadoPedidoAdmin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstadoPedidoAdmin],
    }).compileComponents();

    fixture = TestBed.createComponent(EstadoPedidoAdmin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
