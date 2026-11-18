import { Prisma } from '../generated/prisma/client.js';

export class ConflictoTransaccion {
  static reintentable(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    if (error.code !== 'P2010') return false;
    // El adaptador MariaDB conserva el deadlock 1213 dentro de P2010 para SQL
    // directo. MySQL abortó esa transacción; se puede repetir completa.
    const adaptador = error.meta?.driverAdapterError;
    if (!adaptador || typeof adaptador !== 'object' || !('cause' in adaptador))
      return false;
    const causa = adaptador.cause;
    return (
      !!causa &&
      typeof causa === 'object' &&
      'kind' in causa &&
      causa.kind === 'TransactionWriteConflict' &&
      'originalCode' in causa &&
      causa.originalCode === '1213'
    );
  }
}
