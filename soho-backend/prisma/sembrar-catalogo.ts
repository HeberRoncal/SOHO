import {
  EstadoProducto,
  GeneroProducto,
  OrigenMovimientoInventario,
  Prisma,
  type PrismaClient,
  SistemaTallas,
  TipoMovimientoInventario,
} from '../src/generated/prisma/client.js';
import { CATALOGO_SEED, type CatalogoSeed } from './datos/catalogo-seed.js';

const generos = {
  Hombre: GeneroProducto.HOMBRE,
  Mujer: GeneroProducto.MUJER,
  Unisex: GeneroProducto.UNISEX,
};

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function sembrarCatalogo(
  prisma: PrismaClient,
  datos: CatalogoSeed = CATALOGO_SEED,
) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'El catalogo de demostracion solo se carga en desarrollo o pruebas.',
    );
  }
  if (datos.version !== 1)
    throw new Error('Version de catalogo de prueba no compatible.');

  return prisma.$transaction(
    async (tx) => {
      if (await tx.producto.count({ where: { grupoModeloId: { not: null } } }))
        throw new Error(
          'El catálogo convertido por color no admite el seed de demostración anterior.',
        );
      const marcas = new Map<string, string>();
      for (const [orden, marca] of datos.marcas.entries()) {
        const registro = await tx.marca.upsert({
          where: { codigo: marca.codigo },
          update: {},
          create: { ...marca, slug: slug(marca.nombre), orden },
        });
        marcas.set(marca.nombre, registro.id);
      }

      const categorias = new Map<string, string>();
      const nombres = [...new Set(datos.productos.map((p) => p.categoria))];
      for (const [orden, nombre] of nombres.entries()) {
        const registro = await tx.categoria.upsert({
          where: { slug: slug(nombre) },
          update: {},
          create: { nombre, slug: slug(nombre), orden },
        });
        categorias.set(nombre, registro.id);
      }

      const tallas = new Map<string, string>();
      for (let orden = 0; orden < 27; orden++) {
        const valor = new Prisma.Decimal(35 + orden / 2);
        const registro = await tx.talla.upsert({
          where: { sistema_valor: { sistema: SistemaTallas.EU, valor } },
          update: {},
          create: { sistema: SistemaTallas.EU, valor, orden },
        });
        tallas.set(valor.toString(), registro.id);
      }

      let creados = 0;
      let conservados = 0;
      for (const [ordenCatalogo, p] of datos.productos.entries()) {
        const existentes = await tx.producto.findMany({
          where: {
            OR: [
              { slug: p.identificador },
              { codigoInterno: p.codigoInterno },
              { codigoModelo: p.codigoModelo },
            ],
          },
          select: { id: true },
        });
        if (existentes.length > 1) {
          throw new Error(
            `Identificadores de ${p.identificador} pertenecen a productos distintos.`,
          );
        }
        if (existentes.length === 1) {
          conservados++;
          continue;
        }

        const marcaId = marcas.get(p.marca);
        const categoriaId = categorias.get(p.categoria);
        if (
          !marcaId ||
          !categoriaId ||
          !p.imagenes.length ||
          !p.variantes.some((v) => v.habilitada)
        ) {
          throw new Error(
            `Datos incompletos en el producto de prueba ${p.identificador}.`,
          );
        }
        if (
          p.variantes.some(
            (v) => !p.colores.some((c) => c.codigo === v.codigoColor),
          )
        ) {
          throw new Error(`Variante sin color en ${p.identificador}.`);
        }

        const producto = await tx.producto.create({
          data: {
            slug: p.identificador,
            codigoInterno: p.codigoInterno,
            codigoModelo: p.codigoModelo,
            nombre: p.nombre,
            modelo: p.modelo,
            descripcion: p.descripcion,
            genero: generos[p.genero],
            precio: new Prisma.Decimal(p.precio),
            precioAnterior:
              p.precioAnterior === null
                ? null
                : new Prisma.Decimal(p.precioAnterior),
            esNovedad: p.esNovedad,
            estado: EstadoProducto.BORRADOR,
            ordenCatalogo,
            marcaId,
            categoriaId,
            imagenes: {
              create: p.imagenes.map((ruta, orden) => ({
                ruta,
                orden,
                textoAlternativo: p.nombre,
              })),
            },
            colores: {
              create: p.colores.map((color, orden) => ({
                codigo: color.codigo,
                nombre: color.nombre,
                hexadecimal: color.hexadecimal,
                orden,
                imagenes: {
                  create: color.imagenes.map((ruta, posicion) => ({
                    ruta,
                    orden: posicion,
                    textoAlternativo: `${p.nombre} — ${color.nombre}`,
                  })),
                },
                variantes: {
                  create: p.variantes
                    .filter((v) => v.codigoColor === color.codigo)
                    .map((v) => {
                      const tallaId = tallas.get(
                        new Prisma.Decimal(v.talla).toString(),
                      );
                      if (
                        !tallaId ||
                        v.sistemaTallas !== 'EU' ||
                        v.cantidadReservada !== 0
                      ) {
                        throw new Error(
                          `Talla o reservas invalidas en ${v.sku}.`,
                        );
                      }
                      return {
                        tallaId,
                        sku: v.sku,
                        habilitada: v.habilitada,
                        existencias: v.existencias,
                        cantidadReservada: 0,
                        movimientos: {
                          create:
                            v.existencias > 0
                              ? [
                                  {
                                    tipo: TipoMovimientoInventario.ENTRADA,
                                    cantidad: v.existencias,
                                    saldoAnterior: 0,
                                    saldoPosterior: v.existencias,
                                    cantidadReservada: 0,
                                    varianteHabilitada: v.habilitada,
                                    motivo:
                                      'Stock inicial del catalogo de demostracion',
                                    referencia: 'seed-catalogo-v1',
                                    origen:
                                      OrigenMovimientoInventario.STOCK_INICIAL,
                                  },
                                ]
                              : [],
                        },
                      };
                    }),
                },
              })),
            },
          },
        });
        if (p.publicado) {
          await tx.producto.update({
            where: { id: producto.id },
            data: { estado: EstadoProducto.PUBLICADO },
          });
        }
        creados++;
      }
      return { creados, conservados };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
