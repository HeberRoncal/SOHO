import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GeneroProducto, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  leerConsultaCatalogo,
  type ConsultaCatalogoDto,
} from './dto/consulta-catalogo.dto.js';
import {
  PRODUCTO_PUBLICO_SELECT,
  productoPublico,
} from './dto/producto-publico.dto.js';

@Injectable()
export class CatalogoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private publicados(): Prisma.ProductoWhereInput {
    return {
      estado: 'PUBLICADO',
      precio: { not: null },
      categoria: { is: { activa: true } },
      OR: [
        {
          grupoModeloId: null,
          modelo: { not: null },
          codigoModelo: { not: null },
          marca: { is: { activa: true } },
          imagenes: { some: {} },
          colores: { some: { variantes: { some: { habilitada: true } } } },
        },
        {
          grupoModelo: {
            is: {
              modelo: { not: null },
              codigoModelo: { not: null },
              marca: { is: { activa: true } },
            },
          },
          codigoColor: { not: null },
          colorNombre: { not: null },
          colorHexadecimal: { not: null },
          variantesDirectas: { some: { habilitada: true } },
          imagenes: { some: { archivo: { is: { estado: 'DISPONIBLE' } } } },
        },
      ],
    };
  }

  private donde(q: ConsultaCatalogoDto): Prisma.ProductoWhereInput {
    const AND: Prisma.ProductoWhereInput[] = [this.publicados()];
    if (q.marcas.length) {
      const marca: Prisma.MarcaWhereInput = {
        OR: [
          { nombre: { in: q.marcas } },
          { slug: { in: q.marcas } },
          { codigo: { in: q.marcas } },
        ],
      };
      AND.push({
        OR: [
          { grupoModelo: { is: { marca: { is: marca } } } },
          { grupoModeloId: null, marca: { is: marca } },
        ],
      });
    }
    if (q.categorias.length)
      AND.push({
        categoria: {
          is: {
            OR: [
              { nombre: { in: q.categorias } },
              { slug: { in: q.categorias } },
            ],
          },
        },
      });
    if (q.generos.length) {
      const mapa = {
        Hombre: GeneroProducto.HOMBRE,
        Mujer: GeneroProducto.MUJER,
        Unisex: GeneroProducto.UNISEX,
      };
      AND.push({
        genero: {
          in: [
            ...new Set([
              ...q.generos.map((g) => mapa[g]),
              GeneroProducto.UNISEX,
            ]),
          ],
        },
      });
    }
    if (q.desde !== undefined || q.hasta !== undefined)
      AND.push({ precio: { gte: q.desde, lte: q.hasta } });
    if (q.novedades) AND.push({ esNovedad: true });
    if (q.ofertas)
      AND.push({ precioAnterior: { gt: this.prisma.producto.fields.precio } });
    if (q.slugs.length) AND.push({ slug: { in: q.slugs } });
    if (q.skus.length)
      AND.push({
        OR: [
          { variantesDirectas: { some: { sku: { in: q.skus } } } },
          {
            grupoModeloId: null,
            colores: { some: { variantes: { some: { sku: { in: q.skus } } } } },
          },
        ],
      });
    if (q.busqueda) {
      const texto = q.busqueda.replace(/[\\%_]/g, '\\$&');
      AND.push({
        OR: [
          { nombre: { contains: texto } },
          { modelo: { contains: texto } },
          { grupoModelo: { is: { modelo: { contains: texto } } } },
          { categoria: { is: { nombre: { contains: texto } } } },
          { marca: { is: { nombre: { contains: texto } } } },
          {
            grupoModelo: {
              is: { marca: { is: { nombre: { contains: texto } } } },
            },
          },
        ],
      });
    }
    if (q.colores.length || q.tallas.length)
      AND.push({
        OR: [
          {
            grupoModeloId: { not: null },
            ...(q.colores.length ? { codigoColor: { in: q.colores } } : {}),
            variantesDirectas: {
              some: {
                habilitada: true,
                existencias: {
                  gt: this.prisma.variante.fields.cantidadReservada,
                },
                ...(q.tallas.length
                  ? {
                      talla: { is: { sistema: 'EU', valor: { in: q.tallas } } },
                    }
                  : {}),
              },
            },
          },
          {
            grupoModeloId: null,
            colores: {
              some: {
                ...(q.colores.length ? { codigo: { in: q.colores } } : {}),
                variantes: {
                  some: {
                    habilitada: true,
                    existencias: {
                      gt: this.prisma.variante.fields.cantidadReservada,
                    },
                    ...(q.tallas.length
                      ? {
                          talla: {
                            is: { sistema: 'EU', valor: { in: q.tallas } },
                          },
                        }
                      : {}),
                  },
                },
              },
            },
          },
        ],
      });
    return { AND };
  }

  async listar(q: ConsultaCatalogoDto) {
    const where = this.donde(q);
    const orden: Prisma.ProductoOrderByWithRelationInput[] =
      q.orden === 'precio-ascendente'
        ? [{ precio: 'asc' }]
        : q.orden === 'precio-descendente'
          ? [{ precio: 'desc' }]
          : q.orden === 'novedades'
            ? [{ esNovedad: 'desc' }, { ordenCatalogo: 'asc' }]
            : [{ ordenCatalogo: 'asc' }];
    orden.push({ id: 'asc' });
    return this.prisma.$transaction(
      async (tx) => {
        const total = await tx.producto.count({ where });
        const productos = await tx.producto.findMany({
          where,
          select: PRODUCTO_PUBLICO_SELECT,
          orderBy: orden,
          skip: (q.pagina - 1) * q.limite,
          take: q.limite,
        });
        return {
          productos: productos.map(productoPublico),
          paginacion: {
            pagina: q.pagina,
            limite: q.limite,
            total,
            paginas: Math.ceil(total / q.limite),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async detalle(slug: string, color?: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160)
      throw new NotFoundException('Producto no encontrado.');
    if (color !== undefined && !/^[A-Z]{2}$/.test(color))
      throw new BadRequestException('Color inválido.');
    const alias = await this.prisma.aliasProducto.findUnique({
      where: {
        slugAnterior_codigoColor: {
          slugAnterior: slug,
          codigoColor: color ?? '',
        },
      },
    });
    const producto = await this.prisma.producto.findFirst({
      where: {
        AND: [
          this.publicados(),
          alias ? { id: alias.productoDestinoId } : { slug },
        ],
      },
      select: PRODUCTO_PUBLICO_SELECT,
    });
    if (!producto) throw new NotFoundException('Producto no encontrado.');
    if (
      color &&
      (producto.grupoModeloId
        ? producto.codigoColor !== color
        : !producto.colores.some((c) => c.codigo === color))
    )
      throw new NotFoundException('Color de producto no encontrado.');
    return productoPublico(producto);
  }

  marcas() {
    return this.prisma.marca.findMany({
      where: { activa: true },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      select: {
        codigo: true,
        nombre: true,
        slug: true,
        logotipo: true,
        altoLogotipo: true,
      },
    });
  }

  categorias() {
    return this.prisma.categoria.findMany({
      where: { activa: true, productos: { some: this.publicados() } },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      select: { nombre: true, slug: true },
    });
  }

  async filtros() {
    const publicado = this.publicados();
    const [marcas, categorias, colores, tallas, precios, ...grupos] =
      await Promise.all([
        this.marcas(),
        this.categorias(),
        this.prisma.productoColor.findMany({
          where: { producto: { is: publicado } },
          distinct: ['codigo'],
          orderBy: [{ codigo: 'asc' }, { id: 'asc' }],
          select: { codigo: true, nombre: true, hexadecimal: true },
        }),
        this.prisma.talla.findMany({
          where: {
            variantes: {
              some: {
                OR: [
                  { producto: { is: publicado } },
                  {
                    productoId: null,
                    productoColor: { is: { producto: { is: publicado } } },
                  },
                ],
              },
            },
          },
          orderBy: { valor: 'asc' },
          select: { valor: true },
        }),
        this.prisma.producto.aggregate({
          where: publicado,
          _min: { precio: true },
          _max: { precio: true },
        }),
        ...[
          {},
          { genero: ['Hombre'] },
          { genero: ['Mujer'] },
          { genero: ['Unisex'] },
          { novedades: '1' },
          { ofertas: '1' },
        ].map((q) =>
          this.prisma.categoria.findMany({
            where: {
              activa: true,
              productos: { some: this.donde(leerConsultaCatalogo(q)) },
            },
            orderBy: { nombre: 'asc' },
            select: { nombre: true },
          }),
        ),
      ]);
    const rutas = [
      'zapatillas',
      'zapatillas-hombre',
      'zapatillas-mujer',
      'zapatillas-unisex',
      'zapatillas-novedades',
      'zapatillas-ofertas',
    ];
    return {
      marcas,
      categorias: categorias.map((c) => c.nombre),
      colores,
      tallas: tallas.map((t) => t.valor.toString()),
      precioMinimo: precios._min.precio?.toFixed(2) ?? '0.00',
      precioMaximo: precios._max.precio?.toFixed(2) ?? '0.00',
      secciones: Object.fromEntries(
        rutas.map((ruta, i) => [ruta, grupos[i].map((c) => c.nombre)]),
      ),
    };
  }
}
