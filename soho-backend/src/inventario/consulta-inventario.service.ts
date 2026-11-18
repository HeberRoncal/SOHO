import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { ConsultaVariantes } from './dto/consulta-variantes.js';
import { escaparLike } from '../productos/dto/consulta-productos.js';
import {
  RespuestaInventario,
  SELECT_VARIANTE_INVENTARIO,
} from './dto/respuesta-inventario.js';

@Injectable()
export class ConsultaInventarioService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
  ) {}
  async listar(
    q: ReturnType<typeof ConsultaVariantes.leer>,
    sesion: ContextoAuth,
  ) {
    const texto = escaparLike(q.busqueda);
    const where: Prisma.VarianteWhereInput = {
      ...(q.sku ? { sku: q.sku } : {}),
      ...(q.producto
        ? {
            OR: [
              { productoId: q.producto },
              { productoId: null, productoColor: { productoId: q.producto } },
            ],
          }
        : {}),
      ...(texto
        ? {
            AND: [
              {
                OR: [
                  { sku: { contains: texto } },
                  { producto: { nombre: { contains: texto } } },
                  { producto: { codigoInterno: { contains: texto } } },
                  {
                    productoColor: {
                      producto: { nombre: { contains: texto } },
                    },
                  },
                  {
                    productoColor: {
                      producto: { codigoInterno: { contains: texto } },
                    },
                  },
                  { productoColor: { nombre: { contains: texto } } },
                ],
              },
            ],
          }
        : {}),
    };
    return this.prisma.$transaction(
      async (tx) => {
        await this.escritura.comprobarSesion(tx, sesion, true);
        const total = await tx.variante.count({ where });
        const variantes = await tx.variante.findMany({
          where,
          select: SELECT_VARIANTE_INVENTARIO,
          orderBy: [{ sku: 'asc' }, { id: 'asc' }],
          skip: (q.pagina - 1) * q.limite,
          take: q.limite,
        });
        return {
          variantes: variantes.map((v) => RespuestaInventario.variante(v)),
          paginacion: {
            pagina: q.pagina,
            limite: q.limite,
            total,
            paginas: Math.ceil(total / q.limite),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async detalle(id: string, sesion: ContextoAuth) {
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.comprobarSesion(tx, sesion, true);
      const v = await tx.variante.findUnique({
        where: { id },
        select: SELECT_VARIANTE_INVENTARIO,
      });
      if (!v) throw new NotFoundException('Variante no encontrada.');
      return { variante: RespuestaInventario.variante(v) };
    });
  }
}
