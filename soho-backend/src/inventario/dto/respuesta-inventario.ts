import { Prisma } from '../../generated/prisma/client.js';

export const SELECT_VARIANTE_INVENTARIO = {
  id: true,
  sku: true,
  existencias: true,
  cantidadReservada: true,
  versionExistencias: true,
  habilitada: true,
  productoId: true,
  productoColorId: true,
  talla: { select: { valor: true, sistema: true } },
  producto: {
    select: {
      id: true,
      nombre: true,
      codigoInterno: true,
      estado: true,
      codigoColor: true,
      colorNombre: true,
      grupoModeloId: true,
    },
  },
  productoColor: {
    select: {
      codigo: true,
      nombre: true,
      productoId: true,
      producto: {
        select: { id: true, nombre: true, codigoInterno: true, estado: true },
      },
    },
  },
} satisfies Prisma.VarianteSelect;
export type VarianteInventario = Prisma.VarianteGetPayload<{
  select: typeof SELECT_VARIANTE_INVENTARIO;
}>;
export class RespuestaInventario {
  static variante(v: VarianteInventario) {
    const p = v.producto ?? v.productoColor.producto;
    return {
      id: v.id,
      sku: v.sku,
      producto: {
        id: p.id,
        nombre: p.nombre,
        codigoInterno: p.codigoInterno,
        estado: p.estado.toLowerCase(),
      },
      color: {
        codigo: v.producto?.codigoColor ?? v.productoColor.codigo,
        nombre: v.producto?.colorNombre ?? v.productoColor.nombre,
      },
      talla: v.talla.valor.toString(),
      sistemaTallas: v.talla.sistema,
      habilitada: v.habilitada,
      existencias: v.existencias,
      cantidadReservada: v.cantidadReservada,
      versionExistencias: v.versionExistencias,
      disponible: v.habilitada
        ? Math.max(0, v.existencias - v.cantidadReservada)
        : 0,
      faltante: Math.max(0, v.cantidadReservada - v.existencias),
    };
  }
}
