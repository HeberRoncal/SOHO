import { ArchivoProductoService } from './archivo-producto.service.js';
import type { ArchivosProductoService } from '../fotografias/archivos-producto.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';

describe('Archivo y restauración transaccionales', () => {
  const id = '113e4567-e89b-42d3-a456-426614174000';
  const datos = { claveSolicitud: id, version: 1 };
  const sesion = { usuario: { id: 'admin' } } as ContextoAuth;
  function preparar(estado = 'BORRADOR', version = 1) {
    const tx = {
      operacionProducto: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const archivos = {
      bloquearProducto: vi.fn().mockResolvedValue({ estado, version }),
      escritura: {
        transaccion: vi.fn((f: (tx: unknown) => unknown) => f(tx)),
        comprobarSesion: vi.fn().mockResolvedValue(undefined),
      },
    };
    return {
      tx,
      archivos,
      service: new ArchivoProductoService(
        archivos as unknown as ArchivosProductoService,
      ),
    };
  }
  describe.each([
    ['archivar', 'ARCHIVAR'],
    ['restaurar', 'RESTAURAR'],
  ] as const)('%s', (accion, tipo) => {
    it('rechaza datos inválidos sin abrir la transacción', async () => {
      const { archivos, service } = preparar();
      await expect(
        service[accion](id, { version: 1 }, sesion),
      ).rejects.toThrow();
      expect(archivos.escritura.transaccion).not.toHaveBeenCalled();
    });
    it('reautoriza después del bloqueo y antes de recuperar una respuesta', async () => {
      const { archivos, tx, service } = preparar();
      archivos.escritura.comprobarSesion.mockRejectedValueOnce(
        new Error('Revocada'),
      );
      await expect(service[accion](id, datos, sesion)).rejects.toThrow(
        'Revocada',
      );
      expect(archivos.bloquearProducto).toHaveBeenCalled();
      expect(tx.operacionProducto.findUnique).not.toHaveBeenCalled();
    });
    it('recupera la respuesta original aunque la versión y el estado actuales hayan cambiado', async () => {
      const { tx, service } = preparar('PUBLICADO', 20);
      const respuesta = { confirmado: true };
      tx.operacionProducto.findUnique.mockResolvedValueOnce({
        tipo,
        productoId: id,
        usuarioResponsableId: sesion.usuario.id,
        solicitudHash: IdentidadProducto.huella({ tipo, id, datos }),
        respuesta,
      });
      await expect(service[accion](id, datos, sesion)).resolves.toEqual(
        respuesta,
      );
    });
    it.each(['usuarioResponsableId', 'solicitudHash', 'productoId', 'tipo'])(
      'no recupera una clave incompatible por %s',
      async (campo) => {
        const { tx, service } = preparar();
        tx.operacionProducto.findUnique.mockResolvedValueOnce({
          tipo,
          productoId: id,
          usuarioResponsableId: sesion.usuario.id,
          solicitudHash: IdentidadProducto.huella({ tipo, id, datos }),
          respuesta: {},
          [campo]: 'otro',
        });
        await expect(service[accion](id, datos, sesion)).rejects.toMatchObject({
          response: { codigo: 'CLAVE_PRODUCTO_EN_USO' },
        });
      },
    );
    it('rechaza una versión obsoleta en un estado que admite la operación', async () => {
      const { service } = preparar(
        tipo === 'ARCHIVAR' ? 'PUBLICADO' : 'ARCHIVADO',
        2,
      );
      await expect(service[accion](id, datos, sesion)).rejects.toMatchObject({
        response: { codigo: 'PRODUCTO_CAMBIADO' },
      });
    });
    it('rechaza una transición que ya no es válida', async () => {
      const { service } = preparar(
        tipo === 'ARCHIVAR' ? 'ARCHIVADO' : 'BORRADOR',
      );
      await expect(service[accion](id, datos, sesion)).rejects.toMatchObject({
        response: { codigo: 'ESTADO_PRODUCTO_INCOMPATIBLE' },
      });
    });
  });
});
