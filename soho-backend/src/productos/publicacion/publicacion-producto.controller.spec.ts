import { PublicacionProductoController } from './publicacion-producto.controller.js';
import type { PublicacionProductoService } from './publicacion-producto.service.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ROLES } from '../../autenticacion/seguridad/auth.decoradores.js';
describe('Controlador de publicación', () => {
  it('exige ADMIN en la acción', () => {
    expect(Reflect.getMetadata(ROLES, PublicacionProductoController)).toEqual([
      'ADMIN',
    ]);
  });
  it('rechaza identificadores y consultas extra antes de invocar el servicio', () => {
    const servicio = { publicar: vi.fn() },
      c = new PublicacionProductoController(
        servicio as unknown as PublicacionProductoService,
      );
    expect(() => c.publicar('SHO-0001', {}, {} as PeticionAuth, {})).toThrow();
    expect(() =>
      c.publicar(
        '113e4567-e89b-42d3-a456-426614174000',
        {},
        {} as PeticionAuth,
        { confirmar: 'true' },
      ),
    ).toThrow();
    expect(servicio.publicar).not.toHaveBeenCalled();
  });
  it('usa el contexto de autenticación del servidor', async () => {
    const servicio = { publicar: vi.fn() },
      c = new PublicacionProductoController(
        servicio as unknown as PublicacionProductoService,
      ),
      id = '113e4567-e89b-42d3-a456-426614174000',
      req = { autenticacion: { sesionId: 'sesion' } } as PeticionAuth;
    await c.publicar(id, {}, req, {});
    expect(servicio.publicar).toHaveBeenCalledWith(id, {}, req.autenticacion);
  });
});
