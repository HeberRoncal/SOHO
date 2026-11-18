import { Prisma } from '../../generated/prisma/client.js';

export const SELECT_PRODUCTO_ADMIN = {
  id: true,
  version: true,
  grupoModeloId: true,
  codigoColor: true,
  colorNombre: true,
  colorHexadecimal: true,
  grupoModelo: {
    select: {
      id: true,
      version: true,
      codigoModelo: true,
      modelo: true,
      marca: { select: { id: true, slug: true, nombre: true, activa: true } },
    },
  },
  variantesDirectas: {
    orderBy: [{ talla: { valor: 'asc' } }, { id: 'asc' }],
    select: {
      id: true,
      sku: true,
      habilitada: true,
      existencias: true,
      cantidadReservada: true,
      talla: { select: { valor: true, sistema: true } },
    },
  },
  slug: true,
  codigoInterno: true,
  codigoModelo: true,
  nombre: true,
  modelo: true,
  descripcion: true,
  genero: true,
  precio: true,
  precioAnterior: true,
  esNovedad: true,
  estado: true,
  ordenCatalogo: true,
  ordenColor: true,
  actualizadoEn: true,
  marca: { select: { id: true, slug: true, nombre: true, activa: true } },
  categoria: { select: { id: true, slug: true, nombre: true, activa: true } },
  imagenes: { orderBy: { orden: 'asc' }, select: { ruta: true } },
  colores: {
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      codigo: true,
      nombre: true,
      hexadecimal: true,
      imagenes: { orderBy: { orden: 'asc' }, select: { ruta: true } },
      variantes: {
        orderBy: [{ talla: { valor: 'asc' } }, { id: 'asc' }],
        select: {
          id: true,
          sku: true,
          habilitada: true,
          existencias: true,
          cantidadReservada: true,
          talla: { select: { valor: true, sistema: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductoSelect;
export type ProductoAdmin = Prisma.ProductoGetPayload<{
  select: typeof SELECT_PRODUCTO_ADMIN;
}>;
export function productoAdmin(p: ProductoAdmin) {
  const colores =
    p.grupoModeloId && p.codigoColor && p.colorNombre && p.colorHexadecimal
      ? [
          {
            id: p.id,
            codigo: p.codigoColor!,
            nombre: p.colorNombre!,
            hexadecimal: p.colorHexadecimal!,
            imagenes: p.imagenes,
            variantes: p.variantesDirectas,
          },
        ]
      : p.grupoModeloId
        ? []
        : p.colores;
  const variantes = colores.flatMap((c) =>
    c.variantes.map((v) => ({
      id: v.id,
      sku: v.sku,
      codigoColor: c.codigo,
      talla: v.talla.valor.toString(),
      sistemaTallas: v.talla.sistema,
      habilitada: v.habilitada,
      existencias: v.existencias,
      cantidadReservada: v.cantidadReservada,
      disponible: v.habilitada
        ? Math.max(0, v.existencias - v.cantidadReservada)
        : 0,
      faltante: Math.max(0, v.cantidadReservada - v.existencias),
    })),
  );
  return {
    id: p.id,
    version: p.version,
    grupoModelo: p.grupoModelo
      ? { id: p.grupoModelo.id, version: p.grupoModelo.version }
      : null,
    slug: p.slug,
    codigoInterno: p.codigoInterno,
    nombre: p.nombre,
    modelo: p.grupoModelo ? p.grupoModelo.modelo : p.modelo,
    codigoModelo: p.grupoModelo ? p.grupoModelo.codigoModelo : p.codigoModelo,
    descripcion: p.descripcion,
    genero: ({ HOMBRE: 'Hombre', MUJER: 'Mujer', UNISEX: 'Unisex' } as const)[
      p.genero
    ],
    precio: p.precio?.toFixed(2) ?? null,
    precioAnterior: p.precioAnterior?.toFixed(2) ?? null,
    esNovedad: p.esNovedad,
    estado: p.estado.toLowerCase() as 'borrador' | 'publicado' | 'archivado',
    ordenCatalogo: p.ordenCatalogo,
    ordenColor: p.ordenColor,
    actualizadoEn: p.actualizadoEn.toISOString(),
    marca: p.grupoModelo ? p.grupoModelo.marca : p.marca,
    categoria: p.categoria,
    imagenes: p.imagenes.map((i) => i.ruta),
    colores: colores.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      hexadecimal: c.hexadecimal,
      imagenes: c.imagenes.map((i) => i.ruta),
    })),
    variantes,
    inventario: {
      fisico: variantes.reduce((n, v) => n + v.existencias, 0),
      reservado: variantes.reduce((n, v) => n + v.cantidadReservada, 0),
      disponible: variantes.reduce((n, v) => n + v.disponible, 0),
      bajo: variantes.filter(
        (v) => v.habilitada && v.disponible > 0 && v.disponible <= 2,
      ).length,
      agotadas: variantes.filter((v) => v.habilitada && v.disponible === 0)
        .length,
      activas: variantes.filter((v) => v.habilitada).length,
      faltante: variantes.reduce((n, v) => n + v.faltante, 0),
    },
  };
}
export const CAPACIDADES_PRODUCTOS = Object.freeze({
  escrituraDisponible: false,
});
export function paginacion(pagina: number, limite: number, total: number) {
  return { pagina, limite, total, paginas: Math.ceil(total / limite) };
}
