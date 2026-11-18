import { Prisma } from '../../generated/prisma/client.js';

export const PRODUCTO_PUBLICO_SELECT = {
  id: true,
  grupoModeloId: true,
  codigoColor: true,
  colorNombre: true,
  colorHexadecimal: true,
  grupoModelo: {
    select: {
      codigoModelo: true,
      modelo: true,
      marca: { select: { nombre: true } },
      productos: {
        where: {
          estado: 'PUBLICADO',
          precio: { not: null },
          codigoColor: { not: null },
          colorNombre: { not: null },
          colorHexadecimal: { not: null },
          categoria: { is: { activa: true } },
          variantesDirectas: { some: { habilitada: true } },
          imagenes: { some: { archivo: { is: { estado: 'DISPONIBLE' } } } },
        },
        orderBy: [{ ordenColor: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          slug: true,
          codigoColor: true,
          colorNombre: true,
          colorHexadecimal: true,
          imagenes: {
            where: { archivo: { is: { estado: 'DISPONIBLE' } } },
            orderBy: { orden: 'asc' },
            take: 1,
            select: { ruta: true, archivo: { select: { urlEntrega: true } } },
          },
        },
      },
    },
  },
  slug: true,
  nombre: true,
  modelo: true,
  codigoModelo: true,
  descripcion: true,
  genero: true,
  precio: true,
  precioAnterior: true,
  esNovedad: true,
  marca: { select: { nombre: true } },
  categoria: { select: { nombre: true } },
  imagenes: {
    orderBy: { orden: 'asc' },
    select: {
      ruta: true,
      archivo: { select: { estado: true, urlEntrega: true } },
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
  colores: {
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    select: {
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

export type ProductoSeleccionado = Prisma.ProductoGetPayload<{
  select: typeof PRODUCTO_PUBLICO_SELECT;
}>;

export function productoPublico(p: ProductoSeleccionado) {
  const convertido = Boolean(p.grupoModeloId);
  const fotografias = p.imagenes
    .filter((i) => !i.archivo || i.archivo.estado === 'DISPONIBLE')
    .map((i) => i.archivo?.urlEntrega ?? i.ruta);
  const colores = convertido
    ? [
        {
          codigo: p.codigoColor!,
          nombre: p.colorNombre!,
          hexadecimal: p.colorHexadecimal!,
          imagenes: fotografias.map((ruta) => ({ ruta })),
        },
      ]
    : p.colores;
  const variantes = convertido
    ? p.variantesDirectas.map((v) => ({ ...v, codigoColor: p.codigoColor! }))
    : p.colores.flatMap((c) =>
        c.variantes.map((v) => ({ ...v, codigoColor: c.codigo })),
      );
  return {
    id: p.id,
    slug: p.slug,
    nombre: p.nombre,
    modelo: p.grupoModelo?.modelo ?? p.modelo!,
    codigoModelo: p.grupoModelo?.codigoModelo ?? p.codigoModelo!,
    descripcion: p.descripcion,
    genero: ({ HOMBRE: 'Hombre', MUJER: 'Mujer', UNISEX: 'Unisex' } as const)[
      p.genero
    ],
    marca: p.grupoModelo?.marca?.nombre ?? p.marca!.nombre,
    categoria: p.categoria!.nombre,
    precio: p.precio!.toFixed(2),
    precioAnterior: p.precioAnterior?.toFixed(2) ?? null,
    esNovedad: p.esNovedad,
    imagenes: fotografias,
    ...(convertido
      ? {
          otrosColores: p
            .grupoModelo!.productos.filter((c) => c.id !== p.id)
            .map((c) => ({
              slug: c.slug,
              codigo: c.codigoColor!,
              nombre: c.colorNombre!,
              hexadecimal: c.colorHexadecimal!,
              imagen:
                c.imagenes[0]?.archivo?.urlEntrega ??
                c.imagenes[0]?.ruta ??
                null,
            })),
        }
      : {}),
    colores: colores.map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      hexadecimal: c.hexadecimal,
      imagenes: c.imagenes.map((i) => i.ruta),
    })),
    variantes: variantes.map((v) => ({
      id: v.id,
      sku: v.sku,
      codigoColor: v.codigoColor,
      talla: v.talla.valor.toString(),
      sistemaTallas: v.talla.sistema,
      habilitada: v.habilitada,
      disponible: v.habilitada
        ? Math.max(0, v.existencias - v.cantidadReservada)
        : 0,
    })),
  };
}
