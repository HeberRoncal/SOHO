import { AdministracionProductosController } from './administracion-productos.controller.js';
import { ROLES } from '../autenticacion/seguridad/auth.decoradores.js';
import { ConsultaProductosService } from './consulta-productos.service.js';
describe('Protección del controlador de consulta', () => {
  it('exige ADMIN para todas sus consultas', () => {
    expect(
      Reflect.getMetadata(ROLES, AdministracionProductosController),
    ).toEqual(['ADMIN']);
  });
  it('rechaza parámetros desconocidos antes de consultar el inventario global', () => {
    const service = { resumen: vi.fn() };
    const controller = new AdministracionProductosController(
      service as unknown as ConsultaProductosService,
    );
    expect(() => controller.resumen({ pagina: '1' })).toThrow();
    expect(service.resumen).not.toHaveBeenCalled();
  });
});
