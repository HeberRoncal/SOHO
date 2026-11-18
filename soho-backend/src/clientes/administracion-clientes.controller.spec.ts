import { AdministracionClientesController } from './administracion-clientes.controller.js';
import { ConsultaClientesService } from './consulta-clientes.service.js';
import { ROLES } from '../autenticacion/seguridad/auth.decoradores.js';

describe('Protección de consulta de Clientes', () => {
  it('reserva todas las rutas a ADMIN', () => {
    expect(
      Reflect.getMetadata(ROLES, AdministracionClientesController),
    ).toEqual(['ADMIN']);
  });
  it('rechaza filtros e identidad antes de acceder a datos', () => {
    const servicio = {
      detalle: vi.fn(),
      pedidos: vi.fn(),
      direcciones: vi.fn(),
      listar: vi.fn(),
    };
    const controlador = new AdministracionClientesController(
      servicio as unknown as ConsultaClientesService,
    );
    expect(() => controlador.listar({ limite: '0' })).toThrow();
    expect(() =>
      controlador.detalle('invitado:correo@prueba.test', {}),
    ).toThrow();
    expect(() => controlador.pedidos('CLI-1', {})).toThrow();
    expect(() => controlador.direcciones('CLI-1', {})).toThrow();
    expect(
      Object.values(servicio).every((f) => f.mock.calls.length === 0),
    ).toBe(true);
  });
});
