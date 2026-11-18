import type { Prisma } from '../../generated/prisma/client.js';

export const CAPACIDADES_CLIENTES = Object.freeze({
  escrituraDisponible: false,
});
export const SELECT_CONTACTO_PEDIDO = {
  id: true,
  codigo: true,
  nombres: true,
  apellidos: true,
  correo: true,
  celular: true,
  destinatario: true,
  creadoEn: true,
} as const satisfies Prisma.PedidoSelect;
export const SELECT_PEDIDO_CLIENTE = {
  ...SELECT_CONTACTO_PEDIDO,
  direccion: true,
  distritoCodigo: true,
  distritoNombre: true,
  provincia: true,
  departamento: true,
  referencia: true,
  moneda: true,
  total: true,
  estadoEntrega: true,
  pago: { select: { estado: true } },
  articulos: {
    orderBy: { orden: 'asc' },
    select: {
      sku: true,
      nombreProducto: true,
      imagen: true,
      color: true,
      talla: true,
      cantidad: true,
    },
  },
} as const satisfies Prisma.PedidoSelect;
type ContactoPedido = Prisma.PedidoGetPayload<{
  select: typeof SELECT_CONTACTO_PEDIDO;
}>;
export interface FilaClienteSql {
  identificador: string;
  tipo: 'registrado' | 'invitado';
  nombre: string;
  correo: string;
  celular: string | null;
  destinatario: string | null;
  pedido_codigo: string | null;
  fecha: Date | null;
  pedidos_total: bigint | number;
}
export function telefonoEntrega(p: ContactoPedido | null) {
  return p
    ? {
        celular: p.celular,
        destinatario: p.destinatario,
        pedidoCodigo: p.codigo,
        fecha: p.creadoEn.toISOString(),
      }
    : null;
}
export function referenciaPedido(
  p: Pick<ContactoPedido, 'codigo' | 'creadoEn'> | null,
) {
  return p ? { codigo: p.codigo, fecha: p.creadoEn.toISOString() } : null;
}
export function filaCliente(p: FilaClienteSql) {
  return {
    identificador: p.identificador,
    tipo: p.tipo,
    nombre: p.nombre,
    correo: p.correo,
    telefonoEntrega: p.pedido_codigo
      ? {
          celular: p.celular,
          destinatario: p.destinatario,
          pedidoCodigo: p.pedido_codigo,
          fecha: p.fecha!.toISOString(),
        }
      : null,
    pedidosTotal: Number(p.pedidos_total),
    ultimoPedido: p.pedido_codigo
      ? { codigo: p.pedido_codigo, fecha: p.fecha!.toISOString() }
      : null,
  };
}
export function pedidoCliente(
  p: Prisma.PedidoGetPayload<{ select: typeof SELECT_PEDIDO_CLIENTE }>,
) {
  return {
    codigo: p.codigo,
    fecha: p.creadoEn.toISOString(),
    contacto: { nombres: p.nombres, apellidos: p.apellidos, correo: p.correo },
    direccion: {
      direccion: p.direccion,
      distritoCodigo: p.distritoCodigo,
      distritoNombre: p.distritoNombre,
      provincia: p.provincia,
      departamento: p.departamento,
      referencia: p.referencia,
      destinatario: p.destinatario,
      celular: p.celular,
    },
    estadoPago: p.pago?.estado ?? null,
    estadoEntrega: p.estadoEntrega,
    moneda: p.moneda,
    total: p.total.toFixed(2),
    articulos: p.articulos.map((a) => ({
      sku: a.sku,
      nombre: a.nombreProducto,
      imagen: a.imagen,
      color: a.color,
      talla: a.talla.toString(),
      cantidad: a.cantidad,
    })),
  };
}
