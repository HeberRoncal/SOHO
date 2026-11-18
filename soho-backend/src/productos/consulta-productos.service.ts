import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type EstadoProducto,
  type TipoMovimientoInventario,
  type OrigenMovimientoInventario,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  escaparLike,
  type ConsultaProductos,
  type ConsultaMovimientos,
} from './dto/consulta-productos.js';
import {
  CAPACIDADES_PRODUCTOS,
  SELECT_PRODUCTO_ADMIN,
  productoAdmin,
  paginacion,
} from './dto/respuesta-productos.js';

// Restar UNSIGNED en SQL puede desbordar cuando hay faltantes físicos.
const DISPONIBLE = Prisma.sql`GREATEST(0, CAST(v.existencias AS SIGNED) - CAST(v.cantidad_reservada AS SIGNED))`;
const SALDOS = Prisma.sql`LEFT JOIN (
  SELECT COALESCE(v.producto_id,c.producto_id) AS producto_id,
    SUM(CASE WHEN v.habilitada THEN ${DISPONIBLE} ELSE 0 END) AS disponible,
    SUM(CASE WHEN v.habilitada AND ${DISPONIBLE} = 0 THEN 1 ELSE 0 END) AS agotadas,
    SUM(CASE WHEN v.habilitada AND ${DISPONIBLE} BETWEEN 1 AND 2 THEN 1 ELSE 0 END) AS bajo
  FROM variantes v INNER JOIN producto_colores c ON v.producto_color_id = c.id GROUP BY COALESCE(v.producto_id,c.producto_id)
) i ON i.producto_id = p.id`;
const ESTADOS = {
  publicado: 'PUBLICADO',
  borrador: 'BORRADOR',
  archivado: 'ARCHIVADO',
} as const;

function condicion(q: ConsultaProductos) {
  const partes: Prisma.Sql[] = [
    q.estado
      ? Prisma.sql`p.estado = ${ESTADOS[q.estado]}`
      : Prisma.sql`p.estado <> 'ARCHIVADO'`,
  ];
  if (q.marca) partes.push(Prisma.sql`m.slug = ${q.marca}`);
  if (q.categoria) partes.push(Prisma.sql`cat.slug = ${q.categoria}`);
  if (q.busqueda) {
    const t = '%' + escaparLike(q.busqueda) + '%';
    partes.push(Prisma.sql`(p.nombre LIKE ${t} OR COALESCE(g.modelo,p.modelo) LIKE ${t} OR p.codigo_interno LIKE ${t} OR COALESCE(g.codigo_modelo,p.codigo_modelo) LIKE ${t}
      OR m.nombre LIKE ${t} OR EXISTS (SELECT 1 FROM producto_colores bc INNER JOIN variantes bv ON bv.producto_color_id = bc.id WHERE COALESCE(bv.producto_id,bc.producto_id) = p.id AND bv.sku LIKE ${t}))`);
  }
  if (q.disponibilidad === 'disponible')
    partes.push(Prisma.sql`COALESCE(i.disponible, 0) > 0`);
  if (q.disponibilidad === 'agotado')
    partes.push(Prisma.sql`COALESCE(i.disponible, 0) = 0`);
  if (q.disponibilidad === 'bajo')
    partes.push(Prisma.sql`COALESCE(i.bajo, 0) + COALESCE(i.agotadas, 0) > 0`);
  return Prisma.join(partes, ' AND ');
}
function orden(q: ConsultaProductos) {
  const campos = {
    catalogo: Prisma.sql`p.orden_catalogo ASC`,
    nombre: Prisma.sql`p.nombre ASC`,
    'precio-ascendente': Prisma.sql`p.precio IS NULL ASC, p.precio ASC`,
    'precio-descendente': Prisma.sql`p.precio IS NULL ASC, p.precio DESC`,
    stock: Prisma.sql`COALESCE(i.disponible, 0) ASC`,
  };
  return Prisma.sql`${campos[q.orden]}, p.id ASC`;
}
function fechas(q: ConsultaMovimientos): Prisma.DateTimeFilter | undefined {
  if (!q.desde && !q.hasta) return undefined;
  return {
    ...(q.desde ? { gte: new Date(q.desde + 'T00:00:00-05:00') } : {}),
    ...(q.hasta
      ? {
          lt: new Date(
            new Date(q.hasta + 'T00:00:00-05:00').getTime() + 86400000,
          ),
        }
      : {}),
  };
}

@Injectable()
export class ConsultaProductosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async conteos(tx: Prisma.TransactionClient) {
    const grupos = await tx.producto.groupBy({
      by: ['estado'],
      _count: { _all: true },
    });
    const cantidad = (estado: EstadoProducto) =>
      grupos.find((g) => g.estado === estado)?._count._all ?? 0;
    return {
      publicados: cantidad('PUBLICADO'),
      borradores: cantidad('BORRADOR'),
      archivados: cantidad('ARCHIVADO'),
      variantes: await tx.variante.count(),
    };
  }
  listar(q: ConsultaProductos) {
    return this.prisma.$transaction(
      async (tx) => {
        const desde = Prisma.sql`FROM productos p LEFT JOIN grupos_modelo g ON g.id=p.grupo_modelo_id LEFT JOIN marcas m ON m.id = COALESCE(g.marca_id,p.marca_id) LEFT JOIN categorias cat ON cat.id = p.categoria_id ${SALDOS} WHERE ${condicion(q)}`;
        const [conteo] = await tx.$queryRaw<Array<{ total: bigint }>>(
          Prisma.sql`SELECT COUNT(*) total ${desde}`,
        );
        const ids = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT p.id ${desde} ORDER BY ${orden(q)} LIMIT ${q.limite} OFFSET ${(q.pagina - 1) * q.limite}`,
        );
        const productos = await tx.producto.findMany({
          where: { id: { in: ids.map((p) => p.id) } },
          select: SELECT_PRODUCTO_ADMIN,
        });
        const porId = new Map(productos.map((p) => [p.id, p]));
        return {
          productos: ids.map((p) => productoAdmin(porId.get(p.id)!)),
          paginacion: paginacion(q.pagina, q.limite, Number(conteo.total)),
          resumen: await this.conteos(tx),
          capacidades: CAPACIDADES_PRODUCTOS,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detalle(id: string) {
    const p = await this.prisma.producto.findUnique({
      where: { id },
      select: SELECT_PRODUCTO_ADMIN,
    });
    if (!p) throw new NotFoundException('Producto no encontrado.');
    return { producto: productoAdmin(p), capacidades: CAPACIDADES_PRODUCTOS };
  }
  opciones() {
    return this.prisma.$transaction(
      async (tx) => ({
        marcas: await tx.marca.findMany({
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            codigo: true,
            slug: true,
            nombre: true,
            activa: true,
          },
        }),
        categorias: await tx.categoria.findMany({
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          select: { id: true, slug: true, nombre: true, activa: true },
        }),
        gruposModelo: await tx.grupoModelo.findMany({
          orderBy: [{ modelo: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            marcaId: true,
            codigoModelo: true,
            modelo: true,
            version: true,
          },
        }),
        tallas: (
          await tx.talla.findMany({
            orderBy: [{ valor: 'asc' }, { id: 'asc' }],
            select: { id: true, sistema: true, valor: true },
          })
        ).map((t) => ({
          id: t.id,
          sistema: t.sistema,
          valor: t.valor.toString(),
        })),
        capacidades: CAPACIDADES_PRODUCTOS,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  movimientos(q: ConsultaMovimientos) {
    const tipo = {
      entrada: 'ENTRADA',
      salida: 'SALIDA',
      ajuste: 'AJUSTE',
    } as const;
    const origen = {
      manual: 'MANUAL',
      'stock-inicial': 'STOCK_INICIAL',
      'envio-pedido': 'ENVIO_PEDIDO',
    } as const;
    const t = escaparLike(q.busqueda);
    const where: Prisma.MovimientoInventarioWhereInput = {
      ...(q.tipo ? { tipo: tipo[q.tipo] as TipoMovimientoInventario } : {}),
      ...(q.origen
        ? { origen: origen[q.origen] as OrigenMovimientoInventario }
        : {}),
      fecha: fechas(q),
      variante: {
        ...(q.sku ? { sku: q.sku } : {}),
        ...(q.producto
          ? {
              OR: [
                { productoId: q.producto },
                { productoId: null, productoColor: { productoId: q.producto } },
              ],
            }
          : {}),
      },
      ...(t
        ? {
            OR: [
              { id: { contains: t } },
              { motivo: { contains: t } },
              { referencia: { contains: t } },
              { variante: { sku: { contains: t } } },
              { variante: { productoColor: { nombre: { contains: t } } } },
              {
                variante: {
                  productoColor: { producto: { nombre: { contains: t } } },
                },
              },
            ],
          }
        : {}),
    };
    return this.prisma.$transaction(
      async (tx) => {
        const total = await tx.movimientoInventario.count({ where });
        const movimientos = await tx.movimientoInventario.findMany({
          where,
          orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
          skip: (q.pagina - 1) * q.limite,
          take: q.limite,
          include: {
            usuarioResponsable: {
              select: { id: true, nombres: true, apellidos: true },
            },
            envioPedido: { select: { pedido: { select: { codigo: true } } } },
            variante: {
              include: {
                talla: true,
                producto: { select: { id: true, nombre: true } },
                productoColor: {
                  include: { producto: { select: { id: true, nombre: true } } },
                },
              },
            },
          },
        });
        return {
          movimientos: movimientos.map((m) => ({
            id: m.id,
            fecha: m.fecha.toISOString(),
            responsable: m.usuarioResponsable
              ? {
                  id: m.usuarioResponsable.id,
                  nombre: [
                    m.usuarioResponsable.nombres,
                    m.usuarioResponsable.apellidos,
                  ].join(' '),
                }
              : null,
            productoId:
              m.variante.producto?.id ?? m.variante.productoColor.producto.id,
            producto:
              m.variante.producto?.nombre ??
              m.variante.productoColor.producto.nombre,
            varianteId: m.varianteId,
            sku: m.variante.sku,
            color: m.variante.productoColor.nombre,
            talla: m.variante.talla.valor.toString(),
            tipo: m.tipo.toLowerCase(),
            cantidad: m.cantidad,
            saldoAnterior: m.saldoAnterior,
            saldo: m.saldoPosterior,
            reservado: m.cantidadReservada,
            habilitada: m.varianteHabilitada,
            disponible: m.varianteHabilitada
              ? Math.max(0, m.saldoPosterior - m.cantidadReservada)
              : 0,
            motivo: m.motivo,
            referencia: m.referencia,
            origen: (
              {
                MANUAL: 'manual',
                STOCK_INICIAL: 'stock-inicial',
                ENVIO_PEDIDO: 'envio-pedido',
              } as const
            )[m.origen],
            pedido: m.envioPedido?.pedido.codigo ?? null,
          })),
          paginacion: paginacion(q.pagina, q.limite, total),
          capacidades: CAPACIDADES_PRODUCTOS,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  resumen() {
    return this.prisma.$transaction(
      async (tx) => {
        const desde = Prisma.sql`FROM variantes v INNER JOIN producto_colores c ON c.id = v.producto_color_id INNER JOIN productos p ON p.id = COALESCE(v.producto_id,c.producto_id) WHERE v.habilitada = TRUE AND p.estado <> 'ARCHIVADO' AND ${DISPONIBLE} <= 2`;
        const [totales] = await tx.$queryRaw<
          Array<{
            total: bigint;
            agotadas: Prisma.Decimal | null;
            faltantes: Prisma.Decimal | null;
          }>
        >(
          Prisma.sql`SELECT COUNT(*) total, SUM(CASE WHEN ${DISPONIBLE} = 0 THEN 1 ELSE 0 END) agotadas, SUM(CASE WHEN v.existencias < v.cantidad_reservada THEN 1 ELSE 0 END) faltantes ${desde}`,
        );
        const ids = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT v.id ${desde} ORDER BY (${DISPONIBLE} - GREATEST(0, CAST(v.cantidad_reservada AS SIGNED) - CAST(v.existencias AS SIGNED))) ASC, v.sku ASC, v.id ASC LIMIT 7`,
        );
        const variantes = await tx.variante.findMany({
          where: { id: { in: ids.map((v) => v.id) } },
          include: {
            talla: true,
            producto: {
              select: {
                id: true,
                nombre: true,
                imagenes: {
                  where: { archivo: { is: { estado: 'DISPONIBLE' } } },
                  orderBy: { orden: 'asc' },
                  take: 1,
                },
              },
            },
            productoColor: {
              include: {
                imagenes: { orderBy: { orden: 'asc' }, take: 1 },
                producto: {
                  select: {
                    id: true,
                    nombre: true,
                    imagenes: { orderBy: { orden: 'asc' }, take: 1 },
                  },
                },
              },
            },
          },
        });
        const porId = new Map(variantes.map((v) => [v.id, v]));
        return {
          resumen: await this.conteos(tx),
          alertasTotal: Number(totales.total),
          agotadasTotal: Number(totales.agotadas ?? 0),
          faltantesTotal: Number(totales.faltantes ?? 0),
          alertas: ids.map(({ id }) => {
            const v = porId.get(id)!,
              c = v.productoColor,
              p = v.producto ?? c.producto;
            return {
              producto: { id: p.id, nombre: p.nombre },
              variante: {
                id: v.id,
                sku: v.sku,
                talla: v.talla.valor.toString(),
                existencias: v.existencias,
                cantidadReservada: v.cantidadReservada,
              },
              color: c.nombre,
              disponible: Math.max(0, v.existencias - v.cantidadReservada),
              faltante: Math.max(0, v.cantidadReservada - v.existencias),
              imagen: v.producto
                ? (p.imagenes[0]?.ruta ?? null)
                : (c.imagenes[0]?.ruta ?? p.imagenes[0]?.ruta ?? null),
            };
          }),
          capacidades: CAPACIDADES_PRODUCTOS,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
