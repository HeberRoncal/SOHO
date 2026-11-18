import { proveerAdministracionPrueba } from '../../pruebas/administracion.fixture';
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerAdministracionPrueba()] });
});
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetallePedido } from './detalle-pedido';
import { provideRouter } from '@angular/router';

describe('DetallePedido', () => {
  let component: DetallePedido;
  let fixture: ComponentFixture<DetallePedido>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetallePedido],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DetallePedido);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
