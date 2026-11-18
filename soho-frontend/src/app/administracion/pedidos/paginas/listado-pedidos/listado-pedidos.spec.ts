import { proveerAdministracionPrueba } from '../../pruebas/administracion.fixture';
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerAdministracionPrueba()] });
});
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListadoPedidos } from './listado-pedidos';
import { provideRouter } from '@angular/router';

describe('ListadoPedidos', () => {
  let component: ListadoPedidos;
  let fixture: ComponentFixture<ListadoPedidos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListadoPedidos],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ListadoPedidos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
