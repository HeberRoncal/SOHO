import { ConsultaClientesService } from './consulta-clientes.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { identidadCliente } from './dto/consulta-clientes.js';
import { NotFoundException } from '@nestjs/common';

describe('No sustituir identidad ausente por otro contacto', () => {
  it.each(['detalle', 'pedidos', 'direcciones'] as const)(
    'no consulta agregados de otra persona en %s',
    async (metodo) => {
      const tx = {
        usuario: { findFirst: vi.fn().mockResolvedValue(null) },
        pedido: { findMany: vi.fn(), aggregate: vi.fn() },
        $queryRaw: vi.fn(),
      };
      const prisma = {
        $transaction: vi.fn((f: (t: typeof tx) => unknown) => f(tx)),
      };
      const servicio = new ConsultaClientesService(
        prisma as unknown as PrismaService,
      );
      await expect(
        servicio[metodo](
          identidadCliente('abcdef01-1234-4321-8123-123456789abc'),
          { pagina: 1, limite: 20 },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.pedido.aggregate).not.toHaveBeenCalled();
      expect(tx.pedido.findMany).not.toHaveBeenCalled();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
    },
  );
});
