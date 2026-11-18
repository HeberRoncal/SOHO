import { ArchivoProductoController } from './archivo-producto.controller.js';
import type { ArchivoProductoService } from './archivo-producto.service.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ROLES } from '../../autenticacion/seguridad/auth.decoradores.js';

describe('Controlador de archivo y restauración', () => {
  const id = '113e4567-e89b-42d3-a456-426614174000';
  it('protege ambas rutas con el rol ADMIN', () => {
    expect(Reflect.getMetadata(ROLES, ArchivoProductoController)).toEqual([
      'ADMIN',
    ]);
  });
  describe.each(['archivar', 'restaurar'] as const)('%s', (accion) => {
    it('rechaza un código interno en lugar de UUID y filtros desconocidos', () => {
      const servicio = { archivar: vi.fn(), restaurar: vi.fn() };
      const c = new ArchivoProductoController(
        servicio as unknown as ArchivoProductoService,
      );
      expect(() => c[accion]('SHO-0001', {}, {} as PeticionAuth, {})).toThrow();
      expect(() =>
        c[accion](id, {}, {} as PeticionAuth, { confirmar: 'true' }),
      ).toThrow();
      expect(servicio[accion]).not.toHaveBeenCalled();
    });
    it('normaliza el UUID y toma la identidad del contexto autenticado', async () => {
      const servicio = { archivar: vi.fn(), restaurar: vi.fn() };
      const c = new ArchivoProductoController(
        servicio as unknown as ArchivoProductoService,
      );
      const req = { autenticacion: { sesionId: 'sesion' } } as PeticionAuth;
      const cuerpo = { claveSolicitud: id, version: 2 };
      await c[accion](id.toUpperCase(), cuerpo, req, {});
      expect(servicio[accion]).toHaveBeenCalledWith(
        id,
        cuerpo,
        req.autenticacion,
      );
    });
  });
});
