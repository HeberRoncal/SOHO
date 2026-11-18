import { PublicadosProductoController } from './publicados-producto.controller.js';
import type { PublicadosProductoService } from './publicados-producto.service.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ROLES } from '../../autenticacion/seguridad/auth.decoradores.js';

describe('PublicadosProductoController', () => {
  const id = '113e4567-e89b-42d3-a456-426614174000';
  it('exige ADMIN', () => {
    expect(Reflect.getMetadata(ROLES, PublicadosProductoController)).toEqual([
      'ADMIN',
    ]);
  });
  it('valida UUID y filtros antes de llamar al servicio', () => {
    const s = { actualizar: vi.fn() },
      c = new PublicadosProductoController(
        s as unknown as PublicadosProductoService,
      );
    expect(() =>
      c.actualizar('SHO-0001', {}, {} as PeticionAuth, {}),
    ).toThrow();
    expect(() =>
      c.actualizar(id, {}, {} as PeticionAuth, { confirmar: 'true' }),
    ).toThrow();
    expect(s.actualizar).not.toHaveBeenCalled();
  });
  it('normaliza el identificador y utiliza el contexto del servidor', async () => {
    const s = { actualizar: vi.fn() },
      c = new PublicadosProductoController(
        s as unknown as PublicadosProductoService,
      );
    const req = { autenticacion: { sesionId: 'sesion' } } as PeticionAuth;
    await c.actualizar(id.toUpperCase(), {}, req, {});
    expect(s.actualizar).toHaveBeenCalledWith(id, {}, req.autenticacion);
  });
});
