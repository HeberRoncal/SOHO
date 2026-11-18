import { BorradoresProductoController } from './borradores-producto.controller.js';
import type { BorradoresProductoService } from './borradores-producto.service.js';
import { ROLES } from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
describe('Rutas de borradores', () => {
  const servicio = {
    crear: vi.fn(),
    actualizar: vi.fn(),
    consultarOperacion: vi.fn(),
  };
  const controller = new BorradoresProductoController(
    servicio as unknown as BorradoresProductoService,
  );
  const req = { autenticacion: { sesionId: 'sesion' } } as PeticionAuth;
  beforeEach(() => vi.clearAllMocks());
  it('exige ADMIN en todas sus operaciones', () => {
    expect(Reflect.getMetadata(ROLES, BorradoresProductoController)).toEqual([
      'ADMIN',
    ]);
  });
  it('rechaza consultas extra e identificadores inválidos antes de escribir', () => {
    expect(() => controller.crear({}, req, { confirmar: 'true' })).toThrow();
    expect(() => controller.actualizar('SHO-0001', {}, req, {})).toThrow();
    expect(() => controller.operacion('no-uuid', req, {})).toThrow();
    expect(servicio.crear).not.toHaveBeenCalled();
    expect(servicio.actualizar).not.toHaveBeenCalled();
  });
  it('utiliza la sesión del servidor y el UUID de producto', async () => {
    const id = '113e4567-e89b-42d3-a456-426614174000',
      body = { nombre: 'Nuevo' };
    await controller.actualizar(id, body, req, {});
    expect(servicio.actualizar).toHaveBeenCalledWith(
      id,
      body,
      req.autenticacion,
    );
  });
});
