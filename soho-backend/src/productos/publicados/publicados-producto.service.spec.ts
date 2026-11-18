import { PublicadosProductoService } from './publicados-producto.service.js';
import type { ArchivosProductoService } from '../fotografias/archivos-producto.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';

describe('PublicadosProductoService', () => {
  const id = '113e4567-e89b-42d3-a456-426614174000';
  const datos = { claveSolicitud: id, version: 1, nombre: 'Nombre' };
  const sesion = { usuario: { id: 'admin' } } as ContextoAuth;
  function preparar(estado = 'PUBLICADO', version = 1) {
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
      s: new PublicadosProductoService(
        archivos as unknown as ArchivosProductoService,
      ),
    };
  }
  it('valida el cuerpo antes de abrir una transacción', async () => {
    const { s, archivos } = preparar();
    await expect(s.actualizar(id, { version: 1 }, sesion)).rejects.toThrow();
    expect(archivos.escritura.transaccion).not.toHaveBeenCalled();
  });
  it('reautoriza después del bloqueo antes de recuperar una respuesta', async () => {
    const { s, archivos, tx } = preparar();
    archivos.escritura.comprobarSesion.mockRejectedValueOnce(
      new Error('Revocada'),
    );
    await expect(s.actualizar(id, datos, sesion)).rejects.toThrow('Revocada');
    expect(tx.operacionProducto.findUnique).not.toHaveBeenCalled();
  });
  it('recupera una operación confirmada aunque después se archivó el producto', async () => {
    const { s, tx } = preparar('ARCHIVADO', 10);
    tx.operacionProducto.findUnique.mockResolvedValueOnce({
      productoId: id,
      usuarioResponsableId: 'admin',
      tipo: 'ACTUALIZAR',
      solicitudHash: IdentidadProducto.huella({
        tipo: 'ACTUALIZAR',
        contexto: 'publicado',
        id,
        datos,
      }),
      respuesta: { recuperada: true },
    });
    await expect(s.actualizar(id, datos, sesion)).resolves.toEqual({
      recuperada: true,
    });
  });
  it('no confunde una edición de borrador con otra de publicado', async () => {
    const { s, tx } = preparar();
    tx.operacionProducto.findUnique.mockResolvedValueOnce({
      productoId: id,
      usuarioResponsableId: 'admin',
      tipo: 'ACTUALIZAR',
      solicitudHash: IdentidadProducto.huella({
        tipo: 'ACTUALIZAR',
        id,
        datos,
      }),
      respuesta: {},
    });
    await expect(s.actualizar(id, datos, sesion)).rejects.toMatchObject({
      response: { codigo: 'CLAVE_PRODUCTO_EN_USO' },
    });
  });
  it.each(['BORRADOR', 'ARCHIVADO'])(
    'no edita el estado %s con la ruta de publicados',
    async (estado) => {
      await expect(
        preparar(estado).s.actualizar(id, datos, sesion),
      ).rejects.toMatchObject({
        response: { codigo: 'ESTADO_PRODUCTO_INCOMPATIBLE' },
      });
    },
  );
  it('rechaza una versión obsoleta', async () => {
    await expect(
      preparar('PUBLICADO', 2).s.actualizar(id, datos, sesion),
    ).rejects.toMatchObject({ response: { codigo: 'PRODUCTO_CAMBIADO' } });
  });
});
