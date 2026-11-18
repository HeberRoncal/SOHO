import { ConsultaProductosService } from './consulta-productos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundException } from '@nestjs/common';
describe('Consulta de producto ausente', () => {
  it('no devuelve otro producto ni un registro de demostración', async () => {
    const prisma = {
      producto: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const service = new ConsultaProductosService(
      prisma as unknown as PrismaService,
    );
    await expect(service.detalle('uuid-ausente')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
