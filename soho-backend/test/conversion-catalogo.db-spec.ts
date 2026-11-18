import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import { sembrarCatalogo } from '../prisma/sembrar-catalogo.js';
import { ConvertirCatalogo } from '../src/productos/migracion/convertir-catalogo.js';
import { LecturaCatalogo } from '../src/productos/migracion/lectura-catalogo.js';
import { PlanCorrespondenciaProductos } from '../src/productos/migracion/plan-correspondencia-productos/plan-correspondencia-productos.js';
import { CatalogoService } from '../src/catalogo/catalogo.service.js';
import { ConsultaProductosService } from '../src/productos/consulta-productos.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { leerConsultaCatalogo } from '../src/catalogo/dto/consulta-catalogo.dto.js';
import { leerProductos } from '../src/productos/dto/consulta-productos.js';
import { AppModule } from '../src/app.module.js';
import {
  CONFIGURACION_AUTH,
  crearConfiguracionAuth,
} from '../src/autenticacion/seguridad/configuracion-auth.js';
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { datosPedido } from './pedidos-fixtures.js';

const url = process.env.TEST_CONVERSION_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Conversión requiere TEST_CONVERSION_DATABASE_URL exclusiva, migrada y vacía con sufijo _test.',
  );
const prisma = crearClientePrisma(url),
  convertir = new ConvertirCatalogo();
const plan = async () =>
  new PlanCorrespondenciaProductos().crear(
    await new LecturaCatalogo().leer(prisma),
  );
const catalogo = new CatalogoService(prisma as PrismaService),
  adminProductos = new ConsultaProductosService(prisma as PrismaService);
const origen = 'http://localhost:4200';
let app: INestApplication | undefined,
  privado: string,
  inicializada = false;

async function limpiar() {
  assertExclusiva();
  for (const tabla of [
    'operaciones_producto',
    'alias_producto',
    'reservas_inventario',
    'pedido_articulo_unidades',
    'eventos_pedido',
    'cancelaciones_pedido',
    'comprobantes_pago',
    'pagos_pedido',
    'pedido_facturacion',
    'movimientos_inventario',
    'envios_pedido',
    'pedido_articulos',
    'imagenes_producto',
    'imagenes_producto_color',
    'archivos_imagen',
    'variantes',
    'producto_colores',
    'productos',
    'grupos_modelo',
    'tallas',
    'pedidos',
    'direcciones_usuario',
    'identidades_externas',
    'sesiones',
    'tokens_usuario',
    'secuencia_codigo_producto',
  ])
    await prisma.$executeRawUnsafe('DELETE FROM `' + tabla + '`');
  await prisma.configuracionReserva.update({
    where: { id: 1 },
    data: {
      modo: 'HASTA_DECISION',
      horas: null,
      accionVencimiento: null,
      accionCancelacion: 'LIBERAR',
      version: 1,
      actualizadoPorId: null,
    },
  });
  await prisma.usuario.deleteMany();
  await prisma.marca.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.conversionCatalogo.update({
    where: { id: 1 },
    data: {
      huellaOrigen: null,
      huellaManifiesto: null,
      manifiesto: Prisma.DbNull,
      realizadaEn: null,
    },
  });
}
function assertExclusiva() {
  if (!inicializada)
    throw Error('No se habilitó la base exclusiva de esta prueba.');
}
async function iniciar() {
  const m = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(CONFIGURACION_AUTH)
    .useValue(crearConfiguracionAuth({}))
    .overrideProvider(ConfiguracionPedidos)
    .useValue(new ConfiguracionPedidos({ PEDIDOS_DIRECTORIO_PRIVADO: privado }))
    .overrideProvider(CorreosService)
    .useValue({ habilitado: () => false })
    .overrideProvider(LimitesAuthService)
    .useValue({ comprobar: vi.fn() })
    .compile();
  app = m.createNestApplication({ bodyParser: false });
  app.use(cuerpoJsonGeneral());
  await app.init();
  return app;
}
async function comprar(sku = 'AD-SAMBAOG-NG-40') {
  if (!app) await iniciar();
  const cliente = request.agent(app!.getHttpServer()),
    csrf = (await cliente.get('/api/auth/csrf').expect(200)).body
      .csrfToken as string;
  const variante = await prisma.variante.findUniqueOrThrow({
    where: { sku },
    include: { producto: true, productoColor: { include: { producto: true } } },
  });
  const datos = await datosPedido(
    sku,
    (variante.producto ?? variante.productoColor.producto).precio!.toFixed(2),
    1,
  );
  const respuesta = await cliente
    .post('/api/pedidos')
    .set('Origin', origen)
    .set('X-CSRF-Token', csrf)
    .set('X-Pedido-Acceso', randomBytes(32).toString('hex'))
    .send(datos);
  expect(respuesta.status, respuesta.text).toBe(201);
  return respuesta.body.pedido;
}
async function administrador() {
  if (!app) await iniciar();
  const clave = 'Conversión aislada prueba 2026',
    u = await prisma.usuario.create({
      data: {
        nombres: 'Ana',
        apellidos: 'Conversión',
        correo: 'admin@conversion.test',
        rol: 'ADMIN',
        claveHash: await new ClavesService().crear(clave),
      },
    });
  const cliente = request.agent(app!.getHttpServer()),
    token = (await cliente.get('/api/auth/csrf').expect(200)).body.csrfToken;
  const login = await cliente
    .post('/api/auth/login')
    .set('Origin', origen)
    .set('X-CSRF-Token', token)
    .send({ correo: u.correo, clave })
    .expect(200);
  return { cliente, csrf: login.body.csrfToken as string };
}
const serial = (v: unknown) => JSON.parse(JSON.stringify(v));

describe.sequential('Conversión completa en MySQL exclusivo', () => {
  beforeAll(async () => {
    const tablas = await prisma.$queryRaw<
      Array<{ nombre: string }>
    >`SELECT TABLE_NAME AS nombre FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME NOT IN ('_prisma_migrations','conversion_catalogo','zonas_entrega','configuracion_reserva','configuracion_pagos','configuracion_tienda')`;
    for (const { nombre } of tablas) {
      expect(nombre).toMatch(/^[a-z_]+$/);
      const [fila] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        'SELECT COUNT(*) AS n FROM `' + nombre + '`',
      );
      expect(
        Number(fila.n),
        'La base exclusiva debe comenzar vacía: ' + nombre,
      ).toBe(0);
    }
    expect(await prisma.producto.count()).toBe(0);
    expect(
      (await prisma.conversionCatalogo.findUniqueOrThrow({ where: { id: 1 } }))
        .realizadaEn,
    ).toBeNull();
    inicializada = true;
    privado = await mkdtemp(path.join(tmpdir(), 'soho-conversion-test-'));
  });
  beforeEach(async () => {
    await limpiar();
    await sembrarCatalogo(prisma);
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });
  afterAll(async () => {
    if (inicializada) await limpiar();
    await prisma.$disconnect();
    if (privado) {
      const res = await realpath(privado),
        raiz = await realpath(tmpdir());
      expect(
        res.startsWith(raiz + path.sep) &&
          path.basename(res).startsWith('soho-conversion-test-'),
      ).toBe(true);
      await rm(res, { recursive: true, force: true });
    }
  });
  it('convierte once modelos en catorce fichas sin cambiar variantes o movimientos', async () => {
    const v = serial(
        await prisma.variante.findMany({ orderBy: { id: 'asc' } }),
      ),
      m = serial(
        await prisma.movimientoInventario.findMany({ orderBy: { id: 'asc' } }),
      ),
      p = await plan();
    expect((await convertir.aplicar(prisma, p)).aplicada).toBe(true);
    expect(await prisma.producto.count()).toBe(14);
    expect(await prisma.grupoModelo.count()).toBe(11);
    const despues = serial(
      await prisma.variante.findMany({ orderBy: { id: 'asc' } }),
    );
    expect(
      despues.map((a: Record<string, unknown>) => ({ ...a, productoId: null })),
    ).toEqual(v);
    expect(
      serial(
        await prisma.movimientoInventario.findMany({ orderBy: { id: 'asc' } }),
      ),
    ).toEqual(m);
    expect(
      (
        await prisma.secuenciaCodigoProducto.findUniqueOrThrow({
          where: { id: 1 },
        })
      ).ultimoNumero,
    ).toBe(14);
  });
  it('conserva identidad principal y asigna alias y SKU a los destinos por color', async () => {
    const p = await plan();
    await convertir.aplicar(prisma, p);
    const negro = await catalogo.detalle('samba', 'NG');
    await expect(catalogo.detalle('samba', 'AZ')).rejects.toThrow('Color');
    expect(negro.slug).toBe('samba-negro');
    expect(negro.colores.map((c) => c.codigo)).toEqual(['NG']);
    expect(negro.variantes).toHaveLength(12);
    expect(negro.colores[0].imagenes).toEqual(negro.imagenes);
    expect(negro.colores[0].imagenes[0]).toContain('samba_b.png');
    expect(negro.otrosColores?.some((c) => c.slug === 'samba')).toBe(true);
    expect(
      (
        await catalogo.listar(leerConsultaCatalogo({ sku: 'AD-SAMBAOG-NG-40' }))
      ).productos.map((p) => p.slug),
    ).toEqual(['samba-negro']);
    expect(
      (
        await adminProductos.listar(
          leerProductos({ busqueda: 'AD-SAMBAOG-NG-40' }),
        )
      ).productos[0].codigoInterno,
    ).toBe('SHO-0012');
    expect(
      (await catalogo.listar(leerConsultaCatalogo({}))).paginacion.total,
    ).toBe(14);
  });
  it('conserva los DATETIME SQL literales incluso con otro huso en el lector', async () => {
    const leerFechas = async () => {
      const r: Record<string, unknown> = {};
      for (const tabla of ['productos', 'producto_colores', 'variantes'])
        r[tabla] = await prisma.$queryRawUnsafe(
          'SELECT id,CAST(creado_en AS CHAR) AS creado,CAST(actualizado_en AS CHAR) AS actualizado FROM `' +
            tabla +
            '` ORDER BY id',
        );
      return r;
    };
    const antes = await leerFechas();
    const u = new URL(url!);
    u.searchParams.set('timezone', '+09:00');
    const otro = crearClientePrisma(u.toString());
    try {
      const p = new PlanCorrespondenciaProductos().crear(
        await new LecturaCatalogo().leer(otro),
      );
      await convertir.aplicar(otro, p);
      const despues = await leerFechas();
      expect(despues.producto_colores).toEqual(antes.producto_colores);
      expect(despues.variantes).toEqual(antes.variantes);
      const originales = antes.productos as Array<{
        id: string;
        creado: string;
        actualizado: string;
      }>;
      const destinos = despues.productos as typeof originales;
      for (const d of p.productos) {
        const fuente = originales.find((a) => a.id === d.productoAnteriorId)!,
          destino = destinos.find((a) => a.id === d.productoDestinoId)!;
        expect([destino.creado, destino.actualizado]).toEqual([
          fuente.creado,
          fuente.actualizado,
        ]);
      }
    } finally {
      await otro.$disconnect();
    }
  });
  it('un segundo intento reconoce el COMMIT y no duplica ni reinicia inventario', async () => {
    const p = await plan();
    await convertir.aplicar(prisma, p);
    const v = await prisma.variante.findFirstOrThrow();
    await prisma.variante.update({
      where: { id: v.id },
      data: { existencias: 1 },
    });
    const antes = serial(
      await prisma.producto.findMany({ orderBy: { id: 'asc' } }),
    );
    expect((await convertir.aplicar(prisma, serial(p))).yaRealizada).toBe(true);
    expect(
      serial(await prisma.producto.findMany({ orderBy: { id: 'asc' } })),
    ).toEqual(antes);
    expect(
      (await prisma.variante.findUniqueOrThrow({ where: { id: v.id } }))
        .existencias,
    ).toBe(1);
  });
  it('consulta el nombre de modelo compartido sin depender de su copia anterior', async () => {
    await convertir.aplicar(prisma, await plan());
    const p = await prisma.producto.findUniqueOrThrow({
      where: { slug: 'samba' },
    });
    await prisma.grupoModelo.update({
      where: { id: p.grupoModeloId! },
      data: { modelo: 'Nombre compartido corregido' },
    });
    expect((await catalogo.detalle('samba-negro')).modelo).toBe(
      'Nombre compartido corregido',
    );
    expect(
      (await catalogo.listar(leerConsultaCatalogo({ busqueda: 'compartido' })))
        .paginacion.total,
    ).toBe(2);
    expect(
      (await adminProductos.listar(leerProductos({ busqueda: 'compartido' })))
        .paginacion.total,
    ).toBe(2);
  });
  it('rechaza un manifiesto alterado sin dejar una conversión parcial', async () => {
    const p = await plan();
    p.productos[0].codigoInterno = 'SHO-9999';
    await expect(convertir.aplicar(prisma, p)).rejects.toThrow('manifiesto');
    expect(await prisma.producto.count()).toBe(11);
    expect(await prisma.grupoModelo.count()).toBe(0);
  });
  it('rechaza una revisión obsoleta después de cambiar stock', async () => {
    const p = await plan(),
      v = await prisma.variante.findFirstOrThrow();
    await prisma.variante.update({
      where: { id: v.id },
      data: { existencias: 2 },
    });
    await expect(convertir.aplicar(prisma, p)).rejects.toThrow(
      'catálogo cambió',
    );
    expect(await prisma.grupoModelo.count()).toBe(0);
  });
  it('revierte todas las escrituras si falla el punto de control al final', async () => {
    const p = await plan();
    const fallo = prisma.$extends({
      query: {
        conversionCatalogo: {
          update() {
            throw Error('fallo sintético del último paso');
          },
        },
      },
    });
    await expect(convertir.aplicar(fallo as typeof prisma, p)).rejects.toThrow(
      'fallo sintético',
    );
    expect(await prisma.producto.count()).toBe(11);
    expect(await prisma.archivoImagen.count()).toBe(0);
    expect(
      await prisma.variante.count({ where: { productoId: { not: null } } }),
    ).toBe(0);
  });
  it('conserva pedido, comprobante, política y reservas aprobadas, incluso con déficit', async () => {
    await comprar();
    await app!.close();
    app = undefined;
    const articulo = await prisma.pedidoArticulo.findFirstOrThrow();
    await prisma.pedidoArticulo.update({
      where: { id: articulo.id },
      data: { imagen: '/imagenes/retirada-historica.webp' },
    });
    await prisma.pagoPedido.updateMany({ data: { estado: 'APROBADO' } });
    await prisma.variante.update({
      where: { id: articulo.varianteId },
      data: { existencias: 0 },
    });
    const antes = serial(
      await prisma.$transaction([
        prisma.pedido.findMany(),
        prisma.pagoPedido.findMany(),
        prisma.comprobantePago.findMany(),
        prisma.reservaInventario.findMany(),
        prisma.movimientoInventario.findMany(),
      ]),
    );
    await convertir.aplicar(prisma, await plan());
    expect(
      serial(
        await prisma.$transaction([
          prisma.pedido.findMany(),
          prisma.pagoPedido.findMany(),
          prisma.comprobantePago.findMany(),
          prisma.reservaInventario.findMany(),
          prisma.movimientoInventario.findMany(),
        ]),
      ),
    ).toEqual(antes);
    const a = await prisma.pedidoArticulo.findUniqueOrThrow({
      where: { id: articulo.id },
      include: { archivoImagen: true },
    });
    expect(a.imagen).toBe('/imagenes/retirada-historica.webp');
    expect(a.archivoImagen?.urlEntrega).toBe(a.imagen);
    expect(a.archivoImagen?.proveedor).toBe('LEGADO');
    expect(
      (await prisma.variante.findUniqueOrThrow({ where: { id: a.varianteId } }))
        .cantidadReservada,
    ).toBe(1);
  });
  it('checkout posterior usa la misma variante y guarda la imagen por FK', async () => {
    await convertir.aplicar(prisma, await plan());
    await comprar();
    const a = await prisma.pedidoArticulo.findFirstOrThrow({
      include: { archivoImagen: true, variante: true },
    });
    expect(a.nombreProducto).toBe('adidas Samba OG Negro');
    expect(a.archivoImagenId).not.toBeNull();
    expect(a.archivoImagen?.urlEntrega).toBe(a.imagen);
    expect(
      (
        await prisma.producto.findUniqueOrThrow({
          where: { id: a.variante.productoId! },
        })
      ).slug,
    ).toBe('samba-negro');
  });
  it('aprobar, preparar y despachar sigue consumiendo una reserva una sola vez', async () => {
    await convertir.aplicar(prisma, await plan());
    const p = await comprar(),
      admin = await administrador();
    const decision = await admin.cliente
      .post(`/api/admin/pagos/${p.codigo}/decision`)
      .set('Origin', origen)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        versionPedido: p.version,
        versionPago: p.pago.version,
        comprobanteId: p.pago.comprobantes.at(-1).id,
        accion: 'APROBADO',
        confirmado: true,
      })
      .expect(201);
    const prep = await admin.cliente
      .post(`/api/admin/pedidos/${p.codigo}/preparacion`)
      .set('Origin', origen)
      .set('X-CSRF-Token', admin.csrf)
      .send({ versionPedido: decision.body.pedido.version })
      .expect(200);
    const respuesta = await admin.cliente
      .post(`/api/admin/pedidos/${p.codigo}/envio`)
      .set('Origin', origen)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        versionPedido: prep.body.pedido.version,
        transportista: 'Reparto de prueba',
        referenciaSeguimiento: '000123',
      });
    expect(respuesta.status, respuesta.text).toBe(200);
    const a = await prisma.pedidoArticulo.findFirstOrThrow({
      include: { variante: true },
    });
    expect(a.variante.existencias).toBe(4);
    expect(a.variante.cantidadReservada).toBe(0);
    expect(
      await prisma.movimientoInventario.count({
        where: { varianteId: a.varianteId, origen: 'ENVIO_PEDIDO' },
      }),
    ).toBe(1);
  });
  it('el seed antiguo no puede reintroducir modelos después de convertir', async () => {
    await convertir.aplicar(prisma, await plan());
    await expect(sembrarCatalogo(prisma)).rejects.toThrow(
      'catálogo convertido',
    );
    expect(await prisma.producto.count()).toBe(14);
  });
  it('una foto retirada o limpiándose no se publica ni se usa para comprar', async () => {
    await convertir.aplicar(prisma, await plan());
    const p = await prisma.producto.findUniqueOrThrow({
      where: { slug: 'samba-negro' },
      include: { imagenes: true },
    });
    await prisma.archivoImagen.update({
      where: { id: p.imagenes[0].archivoId! },
      data: {
        proveedor: 'CLOUDINARY',
        estado: 'FALLIDO',
        confirmadoEn: null,
        cloudName: 'test',
        publicId: 'imagen',
        resourceType: 'image',
        deliveryType: 'upload',
        carpetaCloudinary: 'SOHO/productos/test',
      },
    });
    await expect(catalogo.detalle('samba-negro')).rejects.toThrow();
  });
});
