import type { Prisma } from '../../generated/prisma/client.js';
import type { EntradaCorrespondencia } from './modelos-correspondencia/modelos-correspondencia.interface.js';

export class LecturaCatalogo {
  async leer(tx: Prisma.TransactionClient): Promise<EntradaCorrespondencia> {
    const productos = await tx.producto.findMany({
      include: {
        marca: true,
        categoria: true,
        imagenes: true,
        colores: {
          include: { imagenes: true, variantes: { include: { talla: true } } },
        },
      },
    });
    return JSON.parse(JSON.stringify({ version: 1, productos }));
  }
}
