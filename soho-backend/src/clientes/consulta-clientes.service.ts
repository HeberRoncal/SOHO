import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { escaparLike } from '../productos/dto/consulta-productos.js';
import { paginacion } from '../productos/dto/respuesta-productos.js';
import type {
  ConsultaClientes,
  IdentidadCliente,
  PaginaClientes,
} from './dto/consulta-clientes.js';
import {
  CAPACIDADES_CLIENTES,
  SELECT_CONTACTO_PEDIDO,
  SELECT_PEDIDO_CLIENTE,
  filaCliente,
  pedidoCliente,
  referenciaPedido,
  telefonoEntrega,
  type FilaClienteSql,
} from './dto/respuesta-clientes.js';

// Una fila por cuenta elegible o por pedido invitado, sin agrupar por contacto.
const CLIENTES = Prisma.sql`WITH cantidades AS (
  SELECT usuario_id, COUNT(*) total FROM pedidos WHERE usuario_id IS NOT NULL GROUP BY usuario_id
), clientes AS (
  SELECT u.id identificador, 'registrado' tipo, CONCAT(u.nombres, ' ', u.apellidos) nombre,
    u.correo, p.celular, p.destinatario, p.codigo pedido_codigo, p.creado_en fecha,
    COALESCE(c.total, 0) pedidos_total
  FROM usuarios u LEFT JOIN cantidades c ON c.usuario_id = u.id
  LEFT JOIN pedidos p ON p.id = (SELECT ul.id FROM pedidos ul WHERE ul.usuario_id = u.id
    ORDER BY ul.creado_en DESC, ul.id DESC LIMIT 1)
  WHERE u.rol = 'CLIENTE' OR c.usuario_id IS NOT NULL
  UNION ALL
  SELECT CONCAT('invitado:', p.id), 'invitado', CONCAT(p.nombres, ' ', p.apellidos),
    p.correo, p.celular, p.destinatario, p.codigo, p.creado_en, 1
  FROM pedidos p WHERE p.usuario_id IS NULL
)`;
const ELEGIBLE = {
  OR: [{ rol: 'CLIENTE' }, { pedidos: { some: {} } }],
} satisfies Prisma.UsuarioWhereInput;
const ORDEN_PEDIDO = [{ creadoEn: 'desc' }, { id: 'desc' }] as const;
// BINARY conserva diferencias de acentos, mayúsculas y espacios de los snapshots.
const CAMPOS_DIRECCION = Prisma.sql`BINARY p.direccion, BINARY p.distrito_codigo,
  BINARY p.distrito_nombre, BINARY p.provincia, BINARY p.departamento, BINARY p.referencia`;
function condicionPedido(identidad: IdentidadCliente): Prisma.PedidoWhereInput {
  return identidad.tipo === 'registrado'
    ? { usuarioId: identidad.id }
    : { id: identidad.id, usuarioId: null };
}
function condicionSql(identidad: IdentidadCliente) {
  return identidad.tipo === 'registrado'
    ? Prisma.sql`p.usuario_id = ${identidad.id}`
    : Prisma.sql`p.id = ${identidad.id} AND p.usuario_id IS NULL`;
}
function filtros(q: ConsultaClientes) {
  const partes: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (q.tipo) partes.push(Prisma.sql`c.tipo = ${q.tipo}`);
  if (q.busqueda) {
    const texto = '%' + escaparLike(q.busqueda) + '%';
    const telefono = q.busqueda.replace(/[-\s()+.]/g, '');
    partes.push(Prisma.sql`(c.nombre COLLATE utf8mb4_0900_ai_ci LIKE ${texto}
      OR c.correo COLLATE utf8mb4_0900_ai_ci LIKE ${texto} OR c.identificador LIKE ${texto}
      ${/^\d+$/.test(telefono) ? Prisma.sql`OR c.celular LIKE ${'%' + telefono + '%'}` : Prisma.empty})`);
  }
  return Prisma.join(partes, ' AND ');
}
function orden(q: ConsultaClientes) {
  const nombre = Prisma.sql`c.nombre COLLATE utf8mb4_0900_ai_ci ASC, c.identificador ASC`;
  if (q.orden === 'nombre') return nombre;
  const reciente = Prisma.sql`c.fecha IS NULL ASC, c.fecha DESC, ${nombre}`;
  return q.orden === 'pedidos'
    ? Prisma.sql`c.pedidos_total DESC, ${reciente}`
    : reciente;
}

@Injectable()
export class ConsultaClientesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listar(q: ConsultaClientes) {
    return this.prisma.$transaction(
      async (tx) => {
        const desde = Prisma.sql`FROM clientes c WHERE ${filtros(q)}`;
        const [conteo] = await tx.$queryRaw<Array<{ total: bigint }>>(
          Prisma.sql`${CLIENTES} SELECT COUNT(*) total ${desde}`,
        );
        const filas = await tx.$queryRaw<
          FilaClienteSql[]
        >(Prisma.sql`${CLIENTES} SELECT c.* ${desde}
        ORDER BY ${orden(q)} LIMIT ${q.limite} OFFSET ${(q.pagina - 1) * q.limite}`);
        const registrados = await tx.usuario.count({ where: ELEGIBLE });
        const invitados = await tx.pedido.count({ where: { usuarioId: null } });
        return {
          clientes: filas.map(filaCliente),
          paginacion: paginacion(q.pagina, q.limite, Number(conteo.total)),
          resumen: {
            total: registrados + invitados,
            registrados,
            invitados,
            unidadInvitados: 'pedido' as const,
          },
          capacidades: CAPACIDADES_CLIENTES,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private async obtener(
    tx: Prisma.TransactionClient,
    identidad: IdentidadCliente,
  ) {
    if (identidad.tipo === 'registrado') {
      const u = await tx.usuario.findFirst({
        where: { id: identidad.id, ...ELEGIBLE },
        select: {
          nombres: true,
          apellidos: true,
          correo: true,
          creadoEn: true,
          activo: true,
          correoVerificadoEn: true,
        },
      });
      if (!u) throw new NotFoundException('Cliente no encontrado.');
      return {
        identificador: identidad.identificador,
        tipo: identidad.tipo,
        nombre: `${u.nombres} ${u.apellidos}`,
        correo: u.correo,
        cuenta: {
          creadaEn: u.creadoEn.toISOString(),
          activa: u.activo,
          correoVerificado: u.correoVerificadoEn !== null,
        },
      };
    }
    const p = await tx.pedido.findFirst({
      where: condicionPedido(identidad),
      select: SELECT_CONTACTO_PEDIDO,
    });
    if (!p) throw new NotFoundException('Cliente no encontrado.');
    return {
      identificador: identidad.identificador,
      tipo: identidad.tipo,
      nombre: `${p.nombres} ${p.apellidos}`,
      correo: p.correo,
      cuenta: null,
    };
  }

  private async direccionesTotal(
    tx: Prisma.TransactionClient,
    identidad: IdentidadCliente,
  ) {
    const [fila] = await tx.$queryRaw<
      Array<{ total: bigint }>
    >(Prisma.sql`SELECT COUNT(*) total FROM (
      SELECT 1 FROM pedidos p WHERE ${condicionSql(identidad)} GROUP BY ${CAMPOS_DIRECCION}
    ) direcciones`);
    return Number(fila.total);
  }

  detalle(identidad: IdentidadCliente) {
    return this.prisma.$transaction(
      async (tx) => {
        const cliente = await this.obtener(tx, identidad),
          where = condicionPedido(identidad);
        const ultimo = await tx.pedido.findFirst({
          where,
          select: SELECT_CONTACTO_PEDIDO,
          orderBy: [...ORDEN_PEDIDO],
        });
        const primero = await tx.pedido.findFirst({
          where,
          select: { codigo: true, creadoEn: true },
          orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
        });
        const pedidosTotal = await tx.pedido.count({ where });
        const aprobado = await tx.pedido.aggregate({
          where: { ...where, pago: { is: { estado: 'APROBADO' } } },
          _sum: { total: true },
        });
        return {
          cliente: {
            ...cliente,
            telefonoEntrega: telefonoEntrega(ultimo),
            pedidosTotal,
            ultimoPedido: referenciaPedido(ultimo),
            capacidades: CAPACIDADES_CLIENTES,
            resumen: {
              pedidosTotal,
              direccionesTotal: await this.direccionesTotal(tx, identidad),
              primerPedido: referenciaPedido(primero),
              ultimoPedido: referenciaPedido(ultimo),
              pagosAprobados: aprobado._sum.total?.toFixed(2) ?? '0.00',
              moneda: 'PEN' as const,
            },
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  pedidos(identidad: IdentidadCliente, q: PaginaClientes) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.obtener(tx, identidad);
        const where = condicionPedido(identidad),
          total = await tx.pedido.count({ where });
        const pedidos = await tx.pedido.findMany({
          where,
          select: SELECT_PEDIDO_CLIENTE,
          orderBy: [...ORDEN_PEDIDO],
          skip: (q.pagina - 1) * q.limite,
          take: q.limite,
        });
        return {
          pedidos: pedidos.map(pedidoCliente),
          paginacion: paginacion(q.pagina, q.limite, total),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  direcciones(identidad: IdentidadCliente, q: PaginaClientes) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.obtener(tx, identidad);
        const total = await this.direccionesTotal(tx, identidad);
        const filas = await tx.$queryRaw<
          Array<{
            direccion: string;
            distrito_codigo: string;
            distrito_nombre: string;
            provincia: string;
            departamento: string;
            referencia: string;
            usos: bigint;
            creado_en: Date;
            codigo: string;
          }>
        >(
          Prisma.sql`WITH direcciones AS (
          SELECT p.direccion, p.distrito_codigo, p.distrito_nombre, p.provincia, p.departamento,
            p.referencia, p.creado_en, p.codigo, COUNT(*) OVER (PARTITION BY ${CAMPOS_DIRECCION}) usos,
            ROW_NUMBER() OVER (PARTITION BY ${CAMPOS_DIRECCION} ORDER BY p.creado_en DESC, p.id DESC) posicion
          FROM pedidos p WHERE ${condicionSql(identidad)}
        ) SELECT p.direccion, p.distrito_codigo, p.distrito_nombre, p.provincia, p.departamento,
          p.referencia, p.usos, p.creado_en, p.codigo FROM direcciones p WHERE p.posicion = 1
          ORDER BY p.creado_en DESC, ${CAMPOS_DIRECCION}
          LIMIT ${q.limite} OFFSET ${(q.pagina - 1) * q.limite}`,
        );
        return {
          direcciones: filas.map((p) => ({
            direccion: p.direccion,
            distritoCodigo: p.distrito_codigo,
            distritoNombre: p.distrito_nombre,
            provincia: p.provincia,
            departamento: p.departamento,
            referencia: p.referencia,
            pedidosTotal: Number(p.usos),
            ultimaUtilizacionEn: p.creado_en.toISOString(),
            pedidoReferencia: p.codigo,
          })),
          paginacion: paginacion(q.pagina, q.limite, total),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
