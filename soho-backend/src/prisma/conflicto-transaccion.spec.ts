import { ConflictoTransaccion } from './conflicto-transaccion.js';
import { Prisma } from '../generated/prisma/client.js';
import { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import type { PrismaService } from './prisma.service.js';
import { crearConfiguracionAuth } from '../autenticacion/seguridad/configuracion-auth.js';

describe('ConflictoTransaccion', () => {
  const error = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('Error sintético', {
      code,
      clientVersion: '7.10.1',
      meta,
    });
  const deadlock = () =>
    error('P2010', {
      driverAdapterError: {
        cause: { kind: 'TransactionWriteConflict', originalCode: '1213' },
      },
    });
  it('reconoce el conflicto estándar y el deadlock SQL observado del adaptador', () => {
    expect(ConflictoTransaccion.reintentable(error('P2034'))).toBe(true);
    expect(ConflictoTransaccion.reintentable(deadlock())).toBe(true);
  });
  it.each([
    undefined,
    Error('Deadlock'),
    { code: 'P2034' },
    error('P2010'),
    error('P2002'),
    error('P2010', {
      driverAdapterError: { cause: { kind: 'mysql', originalCode: '1205' } },
    }),
    error('P2010', {
      driverAdapterError: {
        cause: { kind: 'TransactionWriteConflict', originalCode: '9999' },
      },
    }),
  ])('no repite errores ambiguos ni timeouts %j', (e) => {
    expect(ConflictoTransaccion.reintentable(e)).toBe(false);
  });
  it('reintenta la transacción SQL completa y conserva el resultado posterior', async () => {
    const prisma = {
        $transaction: vi
          .fn()
          .mockRejectedValueOnce(deadlock())
          .mockResolvedValue({ confirmado: true }),
      },
      servicio = new EscrituraAutorizadaService(
        prisma as unknown as PrismaService,
        crearConfiguracionAuth({}),
      );
    expect(
      await servicio.transaccion(async () => ({ confirmado: true })),
    ).toEqual({ confirmado: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
  it('mantiene el límite de tres intentos ante conflictos persistentes', async () => {
    const prisma = { $transaction: vi.fn().mockRejectedValue(deadlock()) },
      servicio = new EscrituraAutorizadaService(
        prisma as unknown as PrismaService,
        crearConfiguracionAuth({}),
      );
    await expect(servicio.transaccion(async () => null)).rejects.toMatchObject({
      code: 'P2010',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
