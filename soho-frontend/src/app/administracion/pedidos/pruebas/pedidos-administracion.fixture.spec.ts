import { TestBed } from '@angular/core/testing';
import { PedidosAdministracionPrueba as PedidosAdministracion } from './pedidos-administracion.fixture';

describe('PedidosAdministracion', () => {
  let service: PedidosAdministracion;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PedidosAdministracion);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
  it('consulta los mismos snapshots del listado y no inventa pedidos desconocidos', () => {
    expect(service.obtener('SOHO-000128')).toBe(service.pedidos[0]);
    expect(service.obtener('DEM-99999')).toBeUndefined();
    expect(service.resumen).toEqual({ total: 12, pendientesPago: 2, porPreparar: 2 });
  });
});
