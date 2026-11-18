import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DireccionesService } from './direcciones.service.js';

describe('Conflictos al escribir direcciones', () => {
  const error = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('SQL privado', {
      code,
      clientVersion: '7.10.1',
    });
  it('reintenta una transacción abortada por conflicto y devuelve su resultado confirmado', async () => {
    const transaccion = vi
      .fn()
      .mockRejectedValueOnce(error('P2034'))
      .mockResolvedValue({ direcciones: [] });
    const servicio = new DireccionesService({
      $transaction: transaccion,
    } as unknown as PrismaService);
    await expect(servicio.eliminar('usuario', 'direccion')).resolves.toEqual({
      direcciones: [],
    });
    expect(transaccion).toHaveBeenCalledTimes(2);
  });
  it('limita los reintentos de conflictos persistentes', async () => {
    const transaccion = vi.fn().mockRejectedValue(error('P2034'));
    const servicio = new DireccionesService({
      $transaction: transaccion,
    } as unknown as PrismaService);
    await expect(
      servicio.eliminar('usuario', 'direccion'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaccion).toHaveBeenCalledTimes(3);
  });
  it('no repite una escritura con duplicado y oculta el detalle SQL', async () => {
    const transaccion = vi.fn().mockRejectedValue(error('P2002'));
    const servicio = new DireccionesService({
      $transaction: transaccion,
    } as unknown as PrismaService);
    await expect(servicio.eliminar('usuario', 'direccion')).rejects.toThrow(
      'La agenda cambió',
    );
    expect(transaccion).toHaveBeenCalledTimes(1);
  });
});
