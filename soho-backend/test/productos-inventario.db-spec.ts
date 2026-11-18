import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import {
  CONFIGURACION_AUTH,
  crearConfiguracionAuth,
} from '../src/autenticacion/seguridad/configuracion-auth.js';
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { datosPedido } from './pedidos-fixtures.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Productos requiere TEST_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url),
  prefijo = 'padmin-' + randomBytes(4).toString('hex');
const origen = 'http://localhost:4200',
  clave = 'clave sintética productos 2026';
const usuarios: string[] = [],
  productos: string[] = [],
  marcas: string[] = [],
  categorias: string[] = [];
describe.sequential('Consulta administrativa con HTTP y MySQL aislado', () => {
  let app: INestApplication,
    privado: string,
    admin: ReturnType<typeof request.agent>,
    cliente: ReturnType<typeof request.agent>,
    csrf: string;
  let principal: string,
    borrador: string,
    archivado: string,
    varianteId: string,
    tallaId: string,
    tallaCreada: string | undefined;
  const sku = prefijo + '-BL-40';
  beforeAll(async () => {
    privado = await mkdtemp(join(tmpdir(), 'soho-productos-test-'));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({}))
      .overrideProvider(ConfiguracionPedidos)
      .useValue(
        new ConfiguracionPedidos({ PEDIDOS_DIRECTORIO_PRIVADO: privado }),
      )
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: vi.fn() })
      .compile();
    app = modulo.createNestApplication({ bodyParser: false });
    app.use(cuerpoJsonGeneral());
    await app.init();
    const hash = await new ClavesService().crear(clave);
    for (const rol of ['ADMIN', 'CLIENTE'] as const) {
      const u = await prisma.usuario.create({
        data: {
          nombres: 'Ana',
          apellidos: 'Inventario',
          correo: `${prefijo}-${rol.toLowerCase()}@productos.test`,
          claveHash: hash,
          rol,
        },
      });
      usuarios.push(u.id);
      const a = request.agent(app.getHttpServer()),
        token = (await a.get('/api/auth/csrf').expect(200)).body
          .csrfToken as string;
      const r = await a
        .post('/api/auth/login')
        .set('Origin', origen)
        .set('X-CSRF-Token', token)
        .send({ correo: u.correo, clave })
        .expect(200);
      if (rol === 'ADMIN') {
        admin = a;
        csrf = r.body.csrfToken as string;
      } else cliente = a;
    }
    for (const nombre of [prefijo, prefijo + '-sin-productos']) {
      marcas.push(
        (
          await prisma.marca.create({
            data: {
              codigo: randomBytes(4).toString('hex'),
              nombre,
              slug: nombre,
            },
          })
        ).id,
      );
      categorias.push(
        (await prisma.categoria.create({ data: { nombre, slug: nombre } })).id,
      );
    }
    let talla = await prisma.talla.findUnique({
      where: { sistema_valor: { sistema: 'EU', valor: 40 } },
    });
    if (!talla) {
      talla = await prisma.talla.create({ data: { valor: 40 } });
      tallaCreada = talla.id;
    }
    tallaId = talla.id;
    for (let i = 0; i < 29; i++) {
      const p = await prisma.producto.create({
        data: {
          slug: `${prefijo}-${i}`,
          codigoInterno: `${prefijo}-${i}`,
          nombre:
            i === 0
              ? `Zapatilla 100%_ ${prefijo}`
              : `${prefijo} producto ${String(i).padStart(2, '0')}`,
          estado: i === 0 ? 'PUBLICADO' : i === 2 ? 'ARCHIVADO' : 'BORRADOR',
          ...(i === 0
            ? { precio: '99.99', modelo: 'Prueba', codigoModelo: prefijo }
            : {}),
          marcaId: marcas[0],
          categoriaId: categorias[0],
          ...(i === 0
            ? {
                imagenes: {
                  create: { ruta: '/imagenes/productos/af1.png', orden: 0 },
                },
              }
            : {}),
        },
      });
      productos.push(p.id);
    }
    [principal, borrador, archivado] = productos;
    const color = await prisma.productoColor.create({
      data: {
        productoId: principal,
        codigo: 'BL',
        nombre: 'Blanco',
        hexadecimal: '#FFFFFF',
        variantes: { create: { tallaId, sku, existencias: 13 } },
      },
      include: { variantes: true },
    });
    varianteId = color.variantes[0].id;
    await prisma.productoColor.create({
      data: {
        productoId: principal,
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#000000',
        variantes: {
          create: {
            tallaId,
            sku: sku + '-DESH',
            existencias: 9,
            habilitada: false,
          },
        },
      },
    });
    await prisma.productoColor.create({
      data: {
        productoId: principal,
        codigo: 'RJ',
        nombre: 'Rojo',
        hexadecimal: '#FF0000',
        variantes: {
          create: {
            tallaId,
            sku: sku + '-FALTA',
            existencias: 1,
            cantidadReservada: 3,
          },
        },
      },
    });
    await prisma.movimientoInventario.create({
      data: {
        varianteId,
        tipo: 'ENTRADA',
        cantidad: 12,
        saldoAnterior: 0,
        saldoPosterior: 12,
        cantidadReservada: 0,
        varianteHabilitada: true,
        motivo: 'Carga histórica',
        origen: 'STOCK_INICIAL',
        fecha: new Date('2026-11-14T04:59:59Z'),
      },
    });
    for (let i = 0; i < 26; i++) {
      const sumar = i % 2 === 0;
      await prisma.movimientoInventario.create({
        data: {
          varianteId,
          usuarioResponsableId: usuarios[0],
          tipo: 'AJUSTE',
          cantidad: sumar ? 1 : -1,
          saldoAnterior: sumar ? 12 : 13,
          saldoPosterior: sumar ? 13 : 12,
          cantidadReservada: 2,
          varianteHabilitada: true,
          motivo: `Conteo ${i}`,
          referencia: '100%_ literal',
          origen: 'MANUAL',
          fecha: new Date(
            i === 0
              ? '2026-11-14T05:00:00Z'
              : i === 25
                ? '2026-11-15T05:00:00Z'
                : `2026-11-14T12:00:${String(i).padStart(2, '0')}Z`,
          ),
        },
      });
    }
  });
  afterAll(async () => {
    const pedidos = await prisma.pedido.findMany({
      where: { articulos: { some: { varianteId } } },
      select: { id: true },
    });
    const ids = pedidos.map((p) => p.id);
    await prisma.movimientoInventario.deleteMany({
      where: { variante: { productoColor: { productoId: { in: productos } } } },
    });
    await prisma.eventoPedido.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.envioPedido.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.reservaInventario.deleteMany({
      where: { articulo: { pedidoId: { in: ids } } },
    });
    await prisma.pedidoArticuloUnidad.deleteMany({
      where: { articulo: { pedidoId: { in: ids } } },
    });
    await prisma.pedidoArticulo.deleteMany({
      where: { pedidoId: { in: ids } },
    });
    await prisma.comprobantePago.deleteMany({
      where: { pago: { pedidoId: { in: ids } } },
    });
    await prisma.pagoPedido.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.pedidoFacturacion.deleteMany({
      where: { pedidoId: { in: ids } },
    });
    await prisma.pedido.deleteMany({ where: { id: { in: ids } } });
    await prisma.variante.deleteMany({
      where: { productoColor: { productoId: { in: productos } } },
    });
    await prisma.productoColor.deleteMany({
      where: { productoId: { in: productos } },
    });
    await prisma.imagenProducto.deleteMany({
      where: { productoId: { in: productos } },
    });
    await prisma.producto.deleteMany({ where: { id: { in: productos } } });
    await prisma.marca.deleteMany({ where: { id: { in: marcas } } });
    await prisma.categoria.deleteMany({ where: { id: { in: categorias } } });
    await prisma.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    if (tallaCreada) await prisma.talla.delete({ where: { id: tallaCreada } });
    await app?.close();
    await prisma.$disconnect();
    if (privado) await rm(privado, { recursive: true, force: true });
  });
  const rutas = () => [
    '/api/admin/productos',
    '/api/admin/productos/opciones',
    `/api/admin/productos/${principal}`,
    '/api/admin/inventario/movimientos',
    '/api/admin/inventario/resumen',
  ];
  it('protege las cinco consultas frente a invitados y clientes', async () => {
    for (const ruta of rutas()) {
      await request(app.getHttpServer()).get(ruta).expect(401);
      await cliente.get(ruta).expect(403);
    }
  });
  it('pagina en el servidor, mantiene los totales globales y omite archivados por defecto', async () => {
    const a = await admin
      .get(`/api/admin/productos?marca=${prefijo}&limite=10`)
      .expect(200);
    const b = await admin
      .get(`/api/admin/productos?marca=${prefijo}&limite=10&pagina=2`)
      .expect(200);
    expect(a.body.paginacion).toMatchObject({ total: 28, paginas: 3 });
    expect(a.body.productos).toHaveLength(10);
    expect(
      b.body.productos.some((p: { id: string }) =>
        a.body.productos.some((v: { id: string }) => v.id === p.id),
      ),
    ).toBe(false);
    expect(a.body.resumen).toEqual(b.body.resumen);
    expect(a.body.capacidades.escrituraDisponible).toBe(false);
    expect(a.headers['cache-control']).toBe('no-store');
  });
  it('consulta borradores y archivados sin inventar precio o perder identidad', async () => {
    const a = await admin.get('/api/admin/productos/' + borrador).expect(200);
    expect(a.body.producto).toMatchObject({
      id: borrador,
      estado: 'borrador',
      precio: null,
      codigoModelo: null,
    });
    const b = await admin
      .get(`/api/admin/productos?marca=${prefijo}&estado=archivado`)
      .expect(200);
    expect(b.body.productos.map((p: { id: string }) => p.id)).toEqual([
      archivado,
    ]);
  });
  it.each(['%', '_', '100%_', sku, prefijo])(
    'busca caracteres literales y SKU: %s',
    async (busqueda) => {
      const r = await admin
        .get('/api/admin/productos')
        .query({ marca: prefijo, busqueda })
        .expect(200);
      expect(r.body.paginacion.total).toBe(busqueda === prefijo ? 28 : 1);
      if (busqueda !== prefijo) expect(r.body.productos[0].id).toBe(principal);
    },
  );
  it('conserva cantidades reales y calcula faltantes y disponibilidad por variante', async () => {
    const r = await admin.get('/api/admin/productos/' + principal).expect(200),
      p = r.body.producto;
    expect(p.inventario).toMatchObject({
      fisico: 23,
      reservado: 3,
      disponible: 13,
      agotadas: 1,
      faltante: 2,
    });
    expect(
      p.variantes.find((v: { sku: string }) => v.sku.endsWith('-DESH')),
    ).toMatchObject({ existencias: 9, disponible: 0, habilitada: false });
    expect(p.variantes[0].id).not.toBe(p.variantes[0].sku);
  });
  it('filtra bajo, agotado y disponible con los mismos criterios del detalle', async () => {
    for (const [disponibilidad, total] of [
      ['bajo', 1],
      ['agotado', 27],
      ['disponible', 1],
    ] as const) {
      const r = await admin
        .get('/api/admin/productos')
        .query({ marca: prefijo, disponibilidad })
        .expect(200);
      expect(r.body.paginacion.total).toBe(total);
    }
  });
  it('ordena precios pendientes al final y calcula alertas sin depender de la página', async () => {
    const r = await admin
      .get('/api/admin/productos')
      .query({ marca: prefijo, orden: 'precio-ascendente', limite: 1 })
      .expect(200);
    expect(r.body.productos[0].id).toBe(principal);
    const resumen = await admin
      .get('/api/admin/inventario/resumen')
      .expect(200);
    expect(
      resumen.body.alertas.some(
        (a: { variante: { sku: string }; faltante: number }) =>
          a.variante.sku === sku + '-FALTA' && a.faltante === 2,
      ),
    ).toBe(true);
    expect(resumen.body.agotadasTotal).toBeGreaterThanOrEqual(1);
  });
  it('incluye opciones sin productos publicados', async () => {
    const r = await admin.get('/api/admin/productos/opciones').expect(200);
    expect(r.body.marcas.some((m: { id: string }) => m.id === marcas[1])).toBe(
      true,
    );
    expect(
      r.body.categorias.some((c: { id: string }) => c.id === categorias[1]),
    ).toBe(true);
  });
  it('pagina el historial y filtra días de Perú conservando los saldos históricos', async () => {
    const r = await admin
      .get('/api/admin/inventario/movimientos')
      .query({
        producto: principal,
        desde: '2026-11-14',
        hasta: '2026-11-14',
        limite: 50,
      })
      .expect(200);
    expect(r.body.paginacion.total).toBe(25);
    expect(
      r.body.movimientos.every(
        (m: { fecha: string }) =>
          m.fecha >= '2026-11-14T05:00:00.000Z' &&
          m.fecha < '2026-11-15T05:00:00.000Z',
      ),
    ).toBe(true);
    expect(r.body.movimientos[0]).toMatchObject({
      reservado: 2,
      disponible: 11,
    });
    const a = await admin
      .get('/api/admin/inventario/movimientos')
      .query({ producto: principal, limite: 10 })
      .expect(200);
    const b = await admin
      .get('/api/admin/inventario/movimientos')
      .query({ producto: principal, limite: 10, pagina: 2 })
      .expect(200);
    expect(a.body.paginacion).toMatchObject({ total: 27, paginas: 3 });
    expect(a.body.movimientos[0].id).not.toBe(b.body.movimientos[0].id);
  });
  it('distingue la carga inicial sin responsable y trata la referencia como texto literal', async () => {
    const r = await admin
      .get('/api/admin/inventario/movimientos')
      .query({ producto: principal, origen: 'stock-inicial' })
      .expect(200);
    expect(r.body.movimientos[0]).toMatchObject({
      responsable: null,
      origen: 'stock-inicial',
      saldo: 12,
    });
    const m = await admin
      .get('/api/admin/inventario/movimientos')
      .query({ producto: principal, busqueda: '100%_' })
      .expect(200);
    expect(m.body.paginacion.total).toBe(27);
  });
  it('refleja reservas y despacho real sin volver a descontar por consultar', async () => {
    const navegador = request.agent(app.getHttpServer()),
      c = (await navegador.get('/api/auth/csrf')).body.csrfToken as string;
    const p = (
      await navegador
        .post('/api/pedidos')
        .set('Origin', origen)
        .set('X-CSRF-Token', c)
        .set('X-Pedido-Acceso', randomBytes(32).toString('hex'))
        .send(await datosPedido(sku))
        .expect(201)
    ).body.pedido;
    const previo = (await admin.get('/api/admin/productos/' + principal)).body
      .producto;
    expect(
      previo.variantes.find((v: { sku: string }) => v.sku === sku),
    ).toMatchObject({ existencias: 13, cantidadReservada: 2, disponible: 11 });
    let d = (await admin.get('/api/admin/pedidos/' + p.codigo)).body.pedido;
    const post = (ruta: string, datos: object) =>
      admin
        .post(`/api/admin/pedidos/${p.codigo}/${ruta}`)
        .set('Origin', origen)
        .set('X-CSRF-Token', csrf)
        .send(datos);
    await admin
      .post(`/api/admin/pagos/${p.codigo}/decision`)
      .set('Origin', origen)
      .set('X-CSRF-Token', csrf)
      .send({
        versionPedido: d.version,
        versionPago: d.pago.version,
        comprobanteId: d.pago.comprobantes.at(-1).id,
        accion: 'APROBADO',
        confirmado: true,
      })
      .expect(201);
    d = (await admin.get('/api/admin/pedidos/' + p.codigo)).body.pedido;
    await post('preparacion', { versionPedido: d.version }).expect(200);
    d = (await admin.get('/api/admin/pedidos/' + p.codigo)).body.pedido;
    await post('envio', {
      versionPedido: d.version,
      transportista: 'Reparto de prueba',
      referenciaSeguimiento: 'GUIA-001',
    }).expect(200);
    for (let i = 0; i < 2; i++) {
      const r = (await admin.get('/api/admin/productos/' + principal)).body
        .producto;
      expect(
        r.variantes.find((v: { sku: string }) => v.sku === sku),
      ).toMatchObject({
        existencias: 11,
        cantidadReservada: 0,
        disponible: 11,
      });
    }
    const m = await admin
      .get('/api/admin/inventario/movimientos')
      .query({ producto: principal, origen: 'envio-pedido' })
      .expect(200);
    expect(m.body.movimientos).toHaveLength(1);
    expect(m.body.movimientos[0]).toMatchObject({
      origen: 'envio-pedido',
      cantidad: -2,
      pedido: p.codigo,
    });
  });
  it('rechaza consultas inválidas, altas sin datos y movimientos manuales', async () => {
    for (const ruta of [
      '/api/admin/productos?limite=51',
      '/api/admin/productos?busqueda=a&busqueda=b',
      '/api/admin/inventario/movimientos?desde=2026-02-30',
      '/api/admin/inventario/resumen?pagina=2',
    ])
      await admin.get(ruta).expect(400);
    await admin
      .get('/api/admin/productos/12345678-1234-1234-1234-123456789abc')
      .expect(404);
    for (const [ruta, estado] of [
      ['/api/admin/productos', 400],
      ['/api/admin/inventario/movimientos', 404],
    ] as const)
      await admin
        .post(ruta)
        .set('Origin', origen)
        .set('X-CSRF-Token', csrf)
        .send({})
        .expect(estado);
  });
});
