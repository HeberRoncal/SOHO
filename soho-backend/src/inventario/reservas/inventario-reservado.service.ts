import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class InventarioReservadoService {
  async bloquear(
    tx: Prisma.TransactionClient,
    variantesIds: readonly string[],
  ) {
    const ids = [...new Set(variantesIds)].sort();
    if (!ids.length)
      throw new ConflictException({
        codigo: 'INVENTARIO_INCONSISTENTE',
        message: 'El pedido no tiene artículos para revisar.',
      });
    // Creación, envío y liberación adquieren las variantes en el mismo orden.
    for (const id of ids)
      await tx.$queryRaw`SELECT id FROM variantes WHERE id = ${id} FOR UPDATE`;
    const variantes = await tx.variante.findMany({
      where: { id: { in: ids } },
    });
    const reservas = await tx.$queryRaw<
      Array<{ varianteId: string; cantidad: Prisma.Decimal }>
    >(
      Prisma.sql`SELECT a.variante_id AS varianteId, SUM(r.cantidad) AS cantidad FROM reservas_inventario r INNER JOIN pedido_articulos a ON a.id = r.pedido_articulo_id WHERE r.estado = 'ACTIVA' AND a.variante_id IN (${Prisma.join(ids)}) GROUP BY a.variante_id`,
    );
    const totales = new Map(
      reservas.map((r) => [r.varianteId, Number(r.cantidad)]),
    );
    if (
      variantes.length !== ids.length ||
      variantes.some((v) => v.cantidadReservada !== (totales.get(v.id) ?? 0))
    )
      throw new ConflictException({
        codigo: 'INVENTARIO_INCONSISTENTE',
        message:
          'Las reservas no coinciden con el contador del inventario. Revisa antes de continuar.',
      });
    // Una liberación no exige existencias >= reservado: no mueve stock físico.
    return variantes;
  }
}
