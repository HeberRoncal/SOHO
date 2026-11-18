import type { Prisma } from '../../generated/prisma/client.js';

export const INCLUIR_RECEPCION = {
  instruccion: true,
  comprobantes: { orderBy: { version: 'asc' } },
  pedido: { select: { codigo: true } },
} as const satisfies Prisma.RecepcionCompraInclude;

export type RecepcionCompra = Prisma.RecepcionCompraGetPayload<{
  include: typeof INCLUIR_RECEPCION;
}>;
