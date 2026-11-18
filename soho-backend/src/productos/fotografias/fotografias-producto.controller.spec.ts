import { FotografiasProductoController } from './fotografias-producto.controller.js';
import {
  ROLES,
  LIMITE_AUTH,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { ArchivosProductoService } from './archivos-producto.service.js';
import type { GaleriaProductoService } from './galeria-producto.service.js';
import type { CloudinaryService } from './cloudinary.service.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
describe('Rutas administrativas de fotografías', () => {
  it('exige ADMIN y aplica un límite propio a las cargas', () => {
    expect(Reflect.getMetadata(ROLES, FotografiasProductoController)).toEqual([
      'ADMIN',
    ]);
    expect(
      Reflect.getMetadata(
        LIMITE_AUTH,
        Object.getOwnPropertyDescriptor(
          FotografiasProductoController.prototype,
          'subir',
        )!.value as object,
      ),
    ).toBe('cargar-fotografia');
  });
  it('rechaza consultas adicionales e identificadores inválidos antes de consultar archivos', () => {
    const galeria = { consultar: vi.fn() },
      controller = new FotografiasProductoController(
        {} as ArchivosProductoService,
        galeria as unknown as GaleriaProductoService,
        {} as CloudinaryService,
      );
    expect(() =>
      controller.consultar('no-uuid', {} as PeticionAuth, {}),
    ).toThrow();
    expect(() =>
      controller.consultar(
        '113e4567-e89b-42d3-a456-426614174000',
        {} as PeticionAuth,
        { todos: 'true' },
      ),
    ).toThrow();
    expect(galeria.consultar).not.toHaveBeenCalled();
  });
});
