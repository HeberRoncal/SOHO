import { PublicacionProductoService } from './publicacion-producto.service.js';
import type { ArchivosProductoService } from '../fotografias/archivos-producto.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
describe('Servicio de publicación', () => {
  it('rechaza un cuerpo inválido antes de abrir una transacción', async () => {
    const archivos = { escritura: { transaccion: vi.fn() } },
      s = new PublicacionProductoService(
        archivos as unknown as ArchivosProductoService,
      );
    await expect(
      s.publicar('id', { version: 1 }, {} as ContextoAuth),
    ).rejects.toThrow();
    expect(archivos.escritura.transaccion).not.toHaveBeenCalled();
  });
  it('revalida la sesión antes de recuperar una operación confirmada', async () => {
    const tx = { operacionProducto: { findUnique: vi.fn() } },
      archivos = {
        bloquearProducto: vi.fn().mockResolvedValue({}),
        escritura: {
          transaccion: (f: (tx: unknown) => unknown) => f(tx),
          comprobarSesion: vi.fn().mockRejectedValue(new Error('Revocada')),
        },
      },
      s = new PublicacionProductoService(
        archivos as unknown as ArchivosProductoService,
      );
    await expect(
      s.publicar(
        'id',
        { claveSolicitud: '113e4567-e89b-42d3-a456-426614174000', version: 1 },
        {} as ContextoAuth,
      ),
    ).rejects.toThrow('Revocada');
    expect(tx.operacionProducto.findUnique).not.toHaveBeenCalled();
  });
});
