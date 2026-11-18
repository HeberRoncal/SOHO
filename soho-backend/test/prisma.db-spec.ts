import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogoModule } from '../src/catalogo/catalogo.module.js';
import { CATALOGO_SEED } from '../prisma/datos/catalogo-seed.js';
import { sembrarCatalogo } from '../prisma/sembrar-catalogo.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const urlPruebas = process.env.TEST_DATABASE_URL;
if (
  !urlPruebas ||
  !new URL(obtenerUrlBaseDatos(urlPruebas)).pathname.endsWith('_test')
) {
  throw new Error(
    'TEST_DATABASE_URL debe apuntar a una base vacia exclusiva de pruebas con sufijo _test.',
  );
}
const prisma = crearClientePrisma(urlPruebas);

async function instantanea() {
  return prisma.$transaction([
    prisma.marca.findMany({ orderBy: { id: 'asc' } }),
    prisma.categoria.findMany({ orderBy: { id: 'asc' } }),
    prisma.producto.findMany({ orderBy: { id: 'asc' } }),
    prisma.productoColor.findMany({ orderBy: { id: 'asc' } }),
    prisma.talla.findMany({ orderBy: { id: 'asc' } }),
    prisma.variante.findMany({ orderBy: { id: 'asc' } }),
    prisma.imagenProducto.findMany({ orderBy: { id: 'asc' } }),
    prisma.imagenProductoColor.findMany({ orderBy: { id: 'asc' } }),
    prisma.movimientoInventario.findMany({ orderBy: { id: 'asc' } }),
  ]);
}

describe.sequential('Prisma y seed con MySQL real aislado', () => {
  let api: INestApplication | undefined;
  beforeAll(async () => {
    const tablas = await instantanea();
    if (tablas.some((filas) => filas.length > 0)) {
      throw new Error(
        'Las pruebas requieren una base migrada y vacia. No se borraron registros.',
      );
    }
    const modulo = await Test.createTestingModule({ imports: [CatalogoModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    api = modulo.createNestApplication();
    await api.init();
  });

  afterAll(async () => {
    await api?.close();
    await prisma.$disconnect();
  });

  it('carga el catalogo completo y registra el stock inicial sin crear reservas', async () => {
    expect(await sembrarCatalogo(prisma)).toEqual({
      creados: 11,
      conservados: 0,
    });
    expect(await prisma.marca.count()).toBe(6);
    expect(await prisma.categoria.count()).toBe(5);
    expect(await prisma.talla.count()).toBe(27);
    expect(await prisma.variante.count()).toBe(168);
    const af1 = await prisma.producto.findUniqueOrThrow({
      where: { slug: 'af1' },
    });
    expect(af1.precio?.toFixed(2)).toBe('529.90');
    expect(af1.estado).toBe('PUBLICADO');
    const variantes = await prisma.variante.findMany({
      include: { movimientos: true },
    });
    for (const variante of variantes) {
      expect(variante.cantidadReservada).toBe(0);
      expect(variante.movimientos).toHaveLength(
        variante.existencias > 0 ? 1 : 0,
      );
      if (variante.existencias > 0) {
        expect(variante.movimientos[0].saldoPosterior).toBe(
          variante.existencias,
        );
        expect(variante.movimientos[0].origen).toBe('STOCK_INICIAL');
      }
    }
  });

  it('API pagina de forma estable y devuelve precios exactos y disponibilidad pública', async () => {
    const primero = await request(api!.getHttpServer())
      .get('/api/productos?limite=2')
      .expect(200);
    const segundo = await request(api!.getHttpServer())
      .get('/api/productos?limite=2&pagina=2')
      .expect(200);
    expect(primero.body.paginacion).toEqual({
      total: 11,
      paginas: 6,
      pagina: 1,
      limite: 2,
    });
    expect(
      new Set(
        [...primero.body.productos, ...segundo.body.productos].map(
          (p: { id: string }) => p.id,
        ),
      ).size,
    ).toBe(4);
    const detalle = await request(api!.getHttpServer())
      .get('/api/productos/af1')
      .expect(200);
    expect(detalle.body.precio).toBe('529.90');
    expect(
      detalle.body.variantes.find(
        (v: { sku: string }) => v.sku === 'NK-AF107-BL-40',
      ).disponible,
    ).toBe(5);
    expect(detalle.body.variantes[0]).not.toHaveProperty('existencias');
    expect(detalle.body.variantes[0]).not.toHaveProperty('cantidadReservada');
    expect(detalle.body).not.toHaveProperty('codigoInterno');
    const vacia = await request(api!.getHttpServer())
      .get('/api/productos?pagina=100')
      .expect(200);
    expect(vacia.body.productos).toEqual([]);
  });

  it('API filtra búsqueda, marcas, categorías, género, novedades, ofertas y céntimos', async () => {
    const nike = await request(api!.getHttpServer())
      .get('/api/productos?marca=NK&genero=Hombre&talla=40')
      .expect(200);
    expect(nike.body.productos.map((p: { slug: string }) => p.slug)).toEqual([
      'af1',
    ]);
    const unisex = await request(api!.getHttpServer())
      .get('/api/productos?genero=Unisex')
      .expect(200);
    expect(
      unisex.body.productos.every(
        (p: { genero: string }) => p.genero === 'Unisex',
      ),
    ).toBe(true);
    const hombres = await request(api!.getHttpServer())
      .get('/api/productos?genero=Hombre')
      .expect(200);
    expect(
      hombres.body.productos.some(
        (p: { genero: string }) => p.genero === 'Unisex',
      ),
    ).toBe(true);
    expect(
      hombres.body.productos.some(
        (p: { genero: string }) => p.genero === 'Mujer',
      ),
    ).toBe(false);
    const exacto = await request(api!.getHttpServer())
      .get('/api/productos?desde=529.90&hasta=529.90&busqueda=Air%20Force')
      .expect(200);
    expect(exacto.body.productos.map((p: { slug: string }) => p.slug)).toEqual([
      'af1',
    ]);
    const ofertas = await request(api!.getHttpServer())
      .get('/api/productos?ofertas=1&orden=precio-descendente')
      .expect(200);
    const precios = ofertas.body.productos.map(
      (p: { precio: string; precioAnterior: string }) => {
        expect(Number(p.precioAnterior)).toBeGreaterThan(Number(p.precio));
        return Number(p.precio);
      },
    );
    expect(precios).toEqual([...precios].sort((a, b) => b - a));
    const nuevos = await request(api!.getHttpServer())
      .get('/api/productos?novedades=1&categoria=clasicos')
      .expect(200);
    expect(
      nuevos.body.productos.every(
        (p: { esNovedad: boolean; categoria: string }) =>
          p.esNovedad && p.categoria === 'Clásicos',
      ),
    ).toBe(true);
    for (const q of [
      'pagina=0',
      'limite=101',
      'orden=sql',
      'talla=8',
      'color=negro',
      'desde=500&hasta=100',
    ])
      await request(api!.getHttpServer())
        .get('/api/productos?' + q)
        .expect(400);
    const filtros = await request(api!.getHttpServer())
      .get('/api/catalogo/filtros')
      .expect(200);
    expect(filtros.body.marcas).toHaveLength(6);
    expect(filtros.body.secciones['zapatillas-hombre']).toContain('Clásicos');
    expect(filtros.body.precioMinimo).toMatch(/^\d+\.\d{2}$/);
    await request(api!.getHttpServer()).get('/api/marcas').expect(200);
    await request(api!.getHttpServer()).get('/api/categorias').expect(200);
  });

  it('API exige color y talla en la misma variante y descuenta reservas y deshabilitación', async () => {
    const registros = await prisma.variante.findMany({
      where: {
        sku: {
          in: ['AD-SAMBAOG-BL-40', 'AD-SAMBAOG-NG-40', 'AD-SAMBAOG-NG-41'],
        },
      },
    });
    try {
      await prisma.variante.update({
        where: { sku: 'AD-SAMBAOG-BL-40' },
        data: { existencias: 0 },
      });
      await prisma.variante.update({
        where: { sku: 'AD-SAMBAOG-NG-40' },
        data: { cantidadReservada: 5 },
      });
      const falta = await request(api!.getHttpServer())
        .get('/api/productos?color=BL&talla=40')
        .expect(200);
      expect(
        falta.body.productos.some((p: { slug: string }) => p.slug === 'samba'),
      ).toBe(false);
      const reserva = await request(api!.getHttpServer())
        .get('/api/productos?color=NG&talla=40')
        .expect(200);
      expect(
        reserva.body.productos.some(
          (p: { slug: string }) => p.slug === 'samba',
        ),
      ).toBe(false);
      const disponible = await request(api!.getHttpServer())
        .get('/api/productos?color=NG&talla=41')
        .expect(200);
      expect(
        disponible.body.productos.some(
          (p: { slug: string }) => p.slug === 'samba',
        ),
      ).toBe(true);
      await prisma.variante.update({
        where: { sku: 'AD-SAMBAOG-NG-41' },
        data: { habilitada: false },
      });
      const deshabilitada = await request(api!.getHttpServer())
        .get('/api/productos?color=NG&talla=41')
        .expect(200);
      expect(
        deshabilitada.body.productos.some(
          (p: { slug: string }) => p.slug === 'samba',
        ),
      ).toBe(false);
      const detalle = await request(api!.getHttpServer())
        .get('/api/productos/samba')
        .expect(200);
      expect(
        detalle.body.variantes.find(
          (v: { sku: string }) => v.sku === 'AD-SAMBAOG-NG-40',
        ).disponible,
      ).toBe(0);
    } finally {
      for (const v of registros)
        await prisma.variante.update({
          where: { id: v.id },
          data: {
            existencias: v.existencias,
            cantidadReservada: v.cantidadReservada,
            habilitada: v.habilitada,
          },
        });
    }
  });

  it('API oculta borradores, archivados y marcas inactivas también por URL directa', async () => {
    try {
      for (const estado of ['BORRADOR', 'ARCHIVADO'] as const) {
        await prisma.producto.update({
          where: { slug: 'af1' },
          data: { estado },
        });
        await request(api!.getHttpServer())
          .get('/api/productos/af1')
          .expect(404);
        const lista = await request(api!.getHttpServer())
          .get('/api/productos?slug=af1')
          .expect(200);
        expect(lista.body.paginacion.total).toBe(0);
      }
      await prisma.producto.update({
        where: { slug: 'af1' },
        data: { estado: 'PUBLICADO' },
      });
      await prisma.marca.update({
        where: { codigo: 'NK' },
        data: { activa: false },
      });
      await request(api!.getHttpServer()).get('/api/productos/af1').expect(404);
      await request(api!.getHttpServer())
        .get('/api/productos/no-existe')
        .expect(404);
    } finally {
      await prisma.producto.update({
        where: { slug: 'af1' },
        data: { estado: 'PUBLICADO' },
      });
      await prisma.marca.update({
        where: { codigo: 'NK' },
        data: { activa: true },
      });
    }
  });

  it('repetirlo no cambia filas, IDs, fechas ni duplica movimientos', async () => {
    const antes = await instantanea();
    expect(await sembrarCatalogo(prisma)).toEqual({
      creados: 0,
      conservados: 11,
    });
    expect(await instantanea()).toEqual(antes);
  });

  it('conserva ediciones, estado, inventario, reservas y fotografias retiradas', async () => {
    const producto = await prisma.producto.findUniqueOrThrow({
      where: { slug: 'af1' },
    });
    const variante = await prisma.variante.findUniqueOrThrow({
      where: { sku: 'NK-AF107-BL-40' },
    });
    await prisma.$transaction([
      prisma.producto.update({
        where: { id: producto.id },
        data: {
          nombre: 'Producto editado',
          precio: '123.45',
          estado: 'ARCHIVADO',
        },
      }),
      prisma.variante.update({
        where: { id: variante.id },
        data: { existencias: 2, cantidadReservada: 1, habilitada: false },
      }),
      prisma.movimientoInventario.create({
        data: {
          varianteId: variante.id,
          tipo: 'AJUSTE',
          cantidad: -3,
          saldoAnterior: 5,
          saldoPosterior: 2,
          cantidadReservada: 1,
          varianteHabilitada: false,
          motivo: 'Ajuste de prueba',
          origen: 'MANUAL',
        },
      }),
      prisma.imagenProducto.deleteMany({
        where: { productoId: producto.id, orden: 1 },
      }),
      prisma.marca.update({
        where: { codigo: 'NK' },
        data: { nombre: 'Marca editada', activa: false },
      }),
    ]);
    const antes = await instantanea();
    expect(await sembrarCatalogo(prisma)).toEqual({
      creados: 0,
      conservados: 11,
    });
    expect(await instantanea()).toEqual(antes);
  });

  it('revierte toda la carga si un producto contiene una talla invalida', async () => {
    const datos = structuredClone(CATALOGO_SEED);
    datos.marcas.push({
      codigo: 'ZZ',
      nombre: 'Marca que debe revertirse',
      logotipo: '/prueba.svg',
      altoLogotipo: 20,
    });
    datos.productos = [
      {
        ...datos.productos[0],
        identificador: 'producto-invalido',
        codigoInterno: 'TEST-INVALIDO',
        codigoModelo: 'TEST-INVALIDO',
        nombre: 'Producto invalido de prueba',
        variantes: datos.productos[0].variantes.map((v) => ({
          ...v,
          talla: '40.3',
        })),
      },
    ];
    const antes = await instantanea();
    await expect(sembrarCatalogo(prisma, datos)).rejects.toThrow(
      'Talla o reservas invalidas',
    );
    expect(await instantanea()).toEqual(antes);
  });

  it('NestJS obtiene el mismo producto desde PrismaModule y cierra su conexion', async () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = urlPruebas;
    const app = await NestFactory.createApplicationContext(PrismaModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      const servicio = app.get(PrismaService);
      const producto = await servicio.producto.findUniqueOrThrow({
        where: { slug: 'af1' },
      });
      expect(producto.precio?.toFixed(2)).toBe('123.45');
      expect(producto.estado).toBe('ARCHIVADO');
    } finally {
      await app.close();
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
