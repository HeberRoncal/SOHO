import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import {
  CONFIGURACION_AUTH,
  crearConfiguracionAuth,
} from '../src/autenticacion/seguridad/configuracion-auth.js';
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { ConfiguracionCloudinary } from '../src/productos/fotografias/configuracion-cloudinary.js';
import { sembrarCatalogo } from '../prisma/sembrar-catalogo.js';
import { LecturaCatalogo } from '../src/productos/migracion/lectura-catalogo.js';
import { PlanCorrespondenciaProductos } from '../src/productos/migracion/plan-correspondencia-productos/plan-correspondencia-productos.js';
import { ConvertirCatalogo } from '../src/productos/migracion/convertir-catalogo.js';
import { datosPedido } from './pedidos-fixtures.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { MovimientosInventarioService } from '../src/inventario/movimientos-inventario.service.js';
import { InventarioReservadoService } from '../src/inventario/reservas/inventario-reservado.service.js';
import { EscrituraAutorizadaService } from '../src/autenticacion/seguridad/escritura-autorizada.service.js';
import {
  usuarioPublico,
  type ContextoAuth,
} from '../src/autenticacion/sesiones/contexto-auth.js';

const url = process.env.TEST_MOVIMIENTOS_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Movimientos requiere TEST_MOVIMIENTOS_DATABASE_URL exclusiva terminada en _test.',
  );
const prisma = crearClientePrisma(url),
  origen = 'http://localhost:4200',
  clave = 'Clave sintética inventario 2026';
type Cuenta = {
  agente: ReturnType<typeof request.agent>;
  csrf: string;
  id: string;
};
type Ficha = {
  id: string;
  version: number;
  variantes: { id: string; sku: string }[];
};
type EstadoVariante = {
  id: string;
  sku: string;
  versionExistencias: number;
  cantidadReservada: number;
  existencias: number;
  habilitada: boolean;
};
let app: INestApplication,
  admin: Cuenta,
  otro: Cuenta,
  cliente: Cuenta,
  privado: string,
  marcaId: string,
  categoriaId: string,
  serie = 0,
  perderClave: string | undefined;
async function acceso(rol: 'ADMIN' | 'CLIENTE'): Promise<Cuenta> {
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Inventario',
      correo: randomUUID() + '@inventario.test',
      rol,
      claveHash: await new ClavesService().crear(clave),
    },
  });
  const agente = request.agent(app.getHttpServer());
  const token = (await agente.get('/api/auth/csrf').expect(200)).body
    .csrfToken as string;
  const r = await agente
    .post('/api/auth/login')
    .set('Origin', origen)
    .set('X-CSRF-Token', token)
    .send({ correo: u.correo, clave })
    .expect(200);
  return { agente, csrf: r.body.csrfToken as string, id: u.id };
}
function post(ruta: string, cuerpo: object, cuenta = admin) {
  return cuenta.agente
    .post(ruta)
    .set('Origin', origen)
    .set('X-CSRF-Token', cuenta.csrf)
    .send(cuerpo);
}
async function producto(stock = 10): Promise<Ficha> {
  serie++;
  const r = await post('/api/admin/productos', {
    claveSolicitud: randomUUID(),
    nombre: 'Modelo inventario ' + serie,
    grupoModelo: {
      marcaId,
      codigoModelo: 'MOV' + serie,
      modelo: 'Modelo inventario ' + serie,
    },
    color: { codigo: 'BL', nombre: 'Blanco', hexadecimal: '#FFFFFF' },
    categoriaId,
    precio: '100.00',
    tallas: ['40', '40.5'],
  }).expect(201);
  const p = r.body.producto as Ficha;
  await prisma.variante.updateMany({
    where: { productoId: p.id },
    data: { existencias: stock },
  });
  return p;
}
async function publicado(stock = 10) {
  const p = await producto(stock);
  const ahora = new Date();
  const a = await prisma.archivoImagen.create({
    data: {
      productoOrigenId: p.id,
      proveedor: 'LEGADO',
      estado: 'DISPONIBLE',
      claveCarga: randomUUID(),
      solicitudHash: 'a'.repeat(64),
      urlEntrega: '/imagenes/prueba-inventario.png',
      creadoEn: ahora,
      confirmadoEn: ahora,
    },
  });
  const g = await admin.agente
    .patch('/api/admin/productos/' + p.id + '/galeria')
    .set('Origin', origen)
    .set('X-CSRF-Token', admin.csrf)
    .send({
      claveSolicitud: randomUUID(),
      version: p.version,
      imagenes: [{ archivoId: a.id }],
    })
    .expect(200);
  const pub = await post('/api/admin/productos/' + p.id + '/publicacion', {
    claveSolicitud: randomUUID(),
    version: g.body.producto.version,
  }).expect(200);
  return pub.body.producto as Ficha;
}
async function estado(id: string): Promise<EstadoVariante> {
  return (
    await admin.agente.get('/api/admin/inventario/variantes/' + id).expect(200)
  ).body.variante as EstadoVariante;
}
function datos(v: EstadoVariante, extra: Record<string, unknown> = {}) {
  return {
    claveSolicitud: randomUUID(),
    versionExistencias: v.versionExistencias,
    reservadoEsperado: v.cantidadReservada,
    habilitadaEsperada: v.habilitada,
    tipo: 'ENTRADA',
    cantidad: 2,
    motivo: 'Reposición documentada',
    referencia: '00123',
    ...extra,
  };
}
function mover(id: string, cuerpo: object, cuenta = admin) {
  return post(
    '/api/admin/inventario/variantes/' + id + '/movimientos',
    cuerpo,
    cuenta,
  );
}
async function reservar(p: Ficha, cantidad = 2) {
  return post(
    '/api/pedidos',
    await datosPedido(p.variantes[0].sku, '100.00', cantidad),
    cliente,
  ).expect(201);
}
async function preparar(p: Ficha) {
  const r = await reservar(p);
  const codigo = r.body.pedido.codigo as string;
  const detalle = r.body.pedido;
  const decision = await post('/api/admin/pagos/' + codigo + '/decision', {
    accion: 'APROBADO',
    versionPedido: detalle.version,
    versionPago: detalle.pago.version,
    comprobanteId: detalle.pago.comprobantes[0].id,
    confirmado: true,
  }).expect(201);
  const preparado = await post(
    '/api/admin/pedidos/' + codigo + '/preparacion',
    { versionPedido: decision.body.pedido.version },
  ).expect(200);
  return { codigo, pedido: preparado.body.pedido };
}
async function esperarBloqueo() {
  for (let i = 0; i < 150; i++) {
    const [r] = await prisma.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE d.OBJECT_SCHEMA=DATABASE() AND d.OBJECT_NAME='variantes'`;
    if (Number(r.n) > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('No apareció el bloqueo de inventario.');
}

describe.sequential('Movimientos manuales con HTTP y MySQL exclusivo', () => {
  beforeAll(async () => {
    expect(await prisma.producto.count()).toBe(0);
    expect(await prisma.usuario.count()).toBe(0);
    await sembrarCatalogo(prisma);
    await new ConvertirCatalogo().aplicar(
      prisma,
      new PlanCorrespondenciaProductos().crear(
        await new LecturaCatalogo().leer(prisma),
      ),
    );
    marcaId = (
      await prisma.marca.findUniqueOrThrow({ where: { codigo: 'NK' } })
    ).id;
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    privado = await mkdtemp(path.join(tmpdir(), 'soho-movimientos-test-'));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({}))
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: vi.fn() })
      .overrideProvider(ConfiguracionCloudinary)
      .useValue(new ConfiguracionCloudinary({ NODE_ENV: 'test' }))
      .overrideProvider(ConfiguracionPedidos)
      .useValue(
        new ConfiguracionPedidos({
          NODE_ENV: 'test',
          PEDIDOS_DIRECTORIO_PRIVADO: privado,
        }),
      )
      .compile();
    app = modulo.createNestApplication({ bodyParser: false });
    app.use(cuerpoJsonGeneral());
    app.use(
      (
        req: import('express').Request,
        res: import('express').Response,
        next: import('express').NextFunction,
      ) => {
        const json = res.json.bind(res);
        res.json = (body: unknown) => {
          if (
            req.method === 'POST' &&
            req.path.endsWith('/movimientos') &&
            req.body?.claveSolicitud === perderClave &&
            res.statusCode === 201
          ) {
            perderClave = undefined;
            res.status(503);
            return json({
              message: 'Respuesta sintética perdida tras COMMIT.',
            });
          }
          return json(body);
        };
        next();
      },
    );
    await app.init();
    admin = await acceso('ADMIN');
    otro = await acceso('ADMIN');
    cliente = await acceso('CLIENTE');
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
    if (privado) {
      const destino = await realpath(privado),
        raiz = await realpath(tmpdir());
      expect(
        destino.startsWith(raiz + path.sep) &&
          path.basename(destino).startsWith('soho-movimientos-test-'),
      ).toBe(true);
      await rm(destino, { recursive: true, force: true });
    }
  });
  it('busca variantes de todo el catálogo por SKU exacto, fuera de la primera página', async () => {
    const p = await producto(),
      v = await estado(p.variantes[1].id);
    const r = await admin.agente
      .get('/api/admin/inventario/variantes')
      .query({ sku: v.sku, limite: '1' })
      .expect(200);
    expect(r.body.paginacion).toMatchObject({ total: 1, paginas: 1 });
    expect(r.body.variantes[0]).toMatchObject({
      id: v.id,
      talla: '40.5',
      versionExistencias: 1,
    });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(r.body)).not.toContain('claveHash');
  });
  it('pagina la búsqueda y filtra por ficha', async () => {
    const p = await producto();
    const r = await admin.agente
      .get('/api/admin/inventario/variantes')
      .query({ producto: p.id, pagina: '2', limite: '1' })
      .expect(200);
    expect(r.body.paginacion).toEqual({
      pagina: 2,
      limite: 1,
      total: 2,
      paginas: 2,
    });
    expect(r.body.variantes[0].id).toBe(p.variantes[1].id);
  });
  it('trata comodines de búsqueda como texto literal', async () => {
    const r = await admin.agente
      .get('/api/admin/inventario/variantes')
      .query({ busqueda: '%_' })
      .expect(200);
    expect(r.body.variantes).toEqual([]);
  });
  it.each([
    'pagina=0',
    'limite=51',
    'sku=a&sku=b',
    'busqueda=a&busqueda=b',
    'producto=SHO-001',
    'desconocido=x',
  ])('rechaza consulta inválida %s', async (q) => {
    await admin.agente.get('/api/admin/inventario/variantes?' + q).expect(400);
  });
  it('exige ADMIN y CSRF en lectura, escritura y recuperación', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v);
    await request(app.getHttpServer())
      .get('/api/admin/inventario/variantes')
      .expect(401);
    await cliente.agente.get('/api/admin/inventario/variantes').expect(403);
    await mover(v.id, d, cliente).expect(403);
    await admin.agente
      .post('/api/admin/inventario/variantes/' + v.id + '/movimientos')
      .set('Origin', origen)
      .send(d)
      .expect(403);
    await admin.agente
      .post('/api/admin/inventario/variantes/' + v.id + '/movimientos')
      .set('X-CSRF-Token', admin.csrf)
      .send(d)
      .expect(403);
    expect(
      await prisma.movimientoInventario.count({ where: { varianteId: v.id } }),
    ).toBe(0);
  });
  it('registra entrada con responsable, saldo e historial y conserva el producto', async () => {
    const p = await producto(),
      antes = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
      v = await estado(p.variantes[0].id);
    const r = await mover(v.id, datos(v)).expect(201);
    expect(r.body.movimiento).toMatchObject({
      cantidad: 2,
      saldoAnterior: 10,
      saldo: 12,
      reservado: 0,
      origen: 'manual',
      responsable: { id: admin.id },
      referencia: '00123',
    });
    expect(r.body.variante).toMatchObject({
      existencias: 12,
      versionExistencias: 2,
      sku: v.sku,
    });
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
    ).toEqual(antes);
    const historial = await admin.agente
      .get('/api/admin/inventario/movimientos')
      .query({ sku: v.sku, origen: 'manual' })
      .expect(200);
    expect(historial.body.movimientos[0].id).toBe(r.body.movimiento.id);
  });
  it('conserva una salida y ajustes con signo correcto', async () => {
    const p = await producto(),
      id = p.variantes[0].id;
    for (const [tipo, cantidad] of [
      ['SALIDA', -2],
      ['AJUSTE', 3],
      ['AJUSTE', -1],
    ] as const) {
      const v = await estado(id);
      await mover(id, datos(v, { tipo, cantidad })).expect(201);
    }
    expect(await estado(id)).toMatchObject({
      existencias: 10,
      versionExistencias: 4,
      cantidadReservada: 0,
    });
  });
  it.each([
    { tipo: 'SALIDA', cantidad: 2 },
    { cantidad: 0 },
    { cantidad: 1.5 },
    { origen: 'ENVIO_PEDIDO' },
    { usuarioResponsableId: randomUUID() },
    { saldoPosterior: 15 },
    { fecha: '2026-11-15' },
    { motivo: ' ' },
    { referencia: 'x'.repeat(81) },
  ])('rechaza cuerpos inválidos sin movimiento %j', async (extra) => {
    const p = await producto(),
      v = await estado(p.variantes[0].id);
    await mover(v.id, datos(v, extra)).expect(400);
    expect(await estado(v.id)).toMatchObject({
      existencias: 10,
      versionExistencias: 1,
    });
  });
  it('recupera y repite la misma solicitud después de cambios posteriores', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v),
      r = await mover(v.id, d).expect(201);
    const actual = await estado(v.id);
    await mover(v.id, datos(actual)).expect(201);
    expect((await mover(v.id, d).expect(201)).body).toEqual(r.body);
    expect(
      (
        await admin.agente
          .get(
            '/api/admin/inventario/movimientos/operaciones/' + d.claveSolicitud,
          )
          .expect(200)
      ).body,
    ).toEqual(r.body);
    expect((await estado(v.id)).existencias).toBe(14);
    expect(
      await prisma.movimientoInventario.count({ where: { varianteId: v.id } }),
    ).toBe(2);
  });
  it('rechaza clave ajena o usada con otro cuerpo/variante y oculta su consulta', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v);
    await mover(v.id, d).expect(201);
    await mover(v.id, { ...d, cantidad: 3 }).expect(409);
    await mover(p.variantes[1].id, d).expect(409);
    await mover(v.id, d, otro).expect(409);
    await otro.agente
      .get('/api/admin/inventario/movimientos/operaciones/' + d.claveSolicitud)
      .expect(404);
    await cliente.agente
      .get('/api/admin/inventario/movimientos/operaciones/' + d.claveSolicitud)
      .expect(403);
  });
  it('recupera un COMMIT cuya respuesta se pierde sin volver a aplicar el delta', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v);
    perderClave = d.claveSolicitud;
    await mover(v.id, d).expect(503);
    const r = await admin.agente
      .get('/api/admin/inventario/movimientos/operaciones/' + d.claveSolicitud)
      .expect(200);
    expect((await mover(v.id, d).expect(201)).body).toEqual(r.body);
    expect(await estado(v.id)).toMatchObject({
      existencias: 12,
      versionExistencias: 2,
    });
    expect(
      await prisma.movimientoInventario.count({
        where: { claveSolicitud: d.claveSolicitud },
      }),
    ).toBe(1);
  });
  it('serializa dos solicitudes iguales con una sola aplicación', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v),
      r = await Promise.all([mover(v.id, d), mover(v.id, d)]);
    expect(r.map((x) => x.status)).toEqual([201, 201]);
    expect(r[0].body).toEqual(r[1].body);
    expect(await estado(v.id)).toMatchObject({
      existencias: 12,
      versionExistencias: 2,
    });
  });
  it('rechaza una de dos claves distintas para la misma versión', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      r = await Promise.all([
        mover(v.id, datos(v)),
        mover(v.id, datos(v), otro),
      ]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await estado(v.id)).toMatchObject({
      existencias: 12,
      versionExistencias: 2,
    });
  });
  it('revierte la otra variante cuando compite la misma clave global', async () => {
    const p = await producto(),
      v1 = await estado(p.variantes[0].id),
      v2 = await estado(p.variantes[1].id),
      key = randomUUID(),
      r = await Promise.all([
        mover(v1.id, datos(v1, { claveSolicitud: key })),
        mover(v2.id, datos(v2, { claveSolicitud: key }), otro),
      ]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const finales = await Promise.all([estado(v1.id), estado(v2.id)]);
    expect(finales.map((v) => v.existencias).sort((a, b) => a - b)).toEqual([
      10, 12,
    ]);
    expect(
      finales.map((v) => v.versionExistencias).sort((a, b) => a - b),
    ).toEqual([1, 2]);
  });
  it('protege reservas activas sin modificar pedido, pago ni reservas', async () => {
    const p = await publicado(),
      reserva = await reservar(p, 7),
      v = await estado(p.variantes[0].id),
      antes = await prisma.reservaInventario.findMany({
        where: { articulo: { varianteId: v.id } },
      });
    await mover(v.id, datos(v, { tipo: 'SALIDA', cantidad: -4 })).expect(409);
    const r = await mover(
      v.id,
      datos(v, { tipo: 'SALIDA', cantidad: -3 }),
    ).expect(201);
    expect(r.body.variante).toMatchObject({
      existencias: 7,
      cantidadReservada: 7,
      disponible: 0,
    });
    expect(
      await prisma.reservaInventario.findMany({
        where: { articulo: { varianteId: v.id } },
      }),
    ).toEqual(antes);
    expect(
      (
        await prisma.pedido.findUniqueOrThrow({
          where: { codigo: reserva.body.pedido.codigo },
        })
      ).estadoEntrega,
    ).toBe('PENDIENTE');
  });
  it('permite reposición parcial de un déficit y mantiene su alerta', async () => {
    const p = await publicado();
    await reservar(p, 7);
    const id = p.variantes[0].id;
    await prisma.variante.update({ where: { id }, data: { existencias: 5 } });
    const r = await mover(id, datos(await estado(id), { cantidad: 1 })).expect(
      201,
    );
    expect(r.body.variante).toMatchObject({
      existencias: 6,
      cantidadReservada: 7,
      disponible: 0,
      faltante: 1,
    });
    await mover(
      id,
      datos(await estado(id), { tipo: 'AJUSTE', cantidad: -1 }),
    ).expect(409);
  });
  it('rechaza un contador reservado desajustado', async () => {
    const p = await producto(),
      id = p.variantes[0].id;
    await prisma.variante.update({
      where: { id },
      data: { cantidadReservada: 1 },
    });
    await mover(id, datos(await estado(id)))
      .expect(409)
      .expect((r) => expect(r.body.codigo).toBe('INVENTARIO_INCONSISTENTE'));
  });
  it('detecta reservas o habilitación cambiadas aunque la versión física sea igual', async () => {
    const p = await publicado(),
      v = await estado(p.variantes[0].id),
      d = datos(v);
    await reservar(p, 2);
    await mover(v.id, d).expect(409);
    const nuevo = await estado(v.id);
    await prisma.variante.update({
      where: { id: v.id },
      data: { habilitada: false },
    });
    await mover(v.id, datos(nuevo)).expect(409);
  });
  it('contabiliza una variante archivada y deshabilitada sin reactivarla', async () => {
    const p = await producto(),
      id = p.variantes[0].id;
    await prisma.producto.update({
      where: { id: p.id },
      data: { estado: 'ARCHIVADO' },
    });
    await prisma.variante.update({
      where: { id },
      data: { habilitada: false },
    });
    const r = await mover(id, datos(await estado(id))).expect(201);
    expect(r.body.variante).toMatchObject({
      habilitada: false,
      disponible: 0,
      producto: { estado: 'archivado' },
    });
  });
  it.each([
    { existencias: 0, tipo: 'SALIDA', cantidad: -1 },
    { existencias: 99999, tipo: 'ENTRADA', cantidad: 1 },
  ])('protege los límites físicos %j', async (c) => {
    const p = await producto(c.existencias),
      v = await estado(p.variantes[0].id);
    await mover(v.id, datos(v, { tipo: c.tipo, cantidad: c.cantidad })).expect(
      409,
    );
    expect((await estado(v.id)).existencias).toBe(c.existencias);
  });
  it('rechaza el agotamiento de versión física sin overflow', async () => {
    const p = await producto(),
      id = p.variantes[0].id;
    await prisma.variante.update({
      where: { id },
      data: { versionExistencias: 4294967295 },
    });
    await mover(id, datos(await estado(id))).expect(409);
    expect((await estado(id)).versionExistencias).toBe(4294967295);
  });
  it('revierte stock y versión si falla la inserción del historial', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v);
    const extendido = prisma.$extends({
      query: {
        movimientoInventario: {
          create() {
            throw Error('Fallo sintético de historial');
          },
        },
      },
    });
    const sesion = await prisma.sesion.findFirstOrThrow({
      where: { usuarioId: admin.id, revocadaEn: null },
    });
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: admin.id },
    });
    const contexto: ContextoAuth = {
      sesionId: sesion.id,
      usuario: usuarioPublico(usuario),
    };
    const servicio = new MovimientosInventarioService(
      new EscrituraAutorizadaService(
        extendido as unknown as PrismaService,
        app.get(CONFIGURACION_AUTH),
      ),
      app.get(InventarioReservadoService),
    );
    await expect(servicio.registrar(v.id, d, contexto)).rejects.toThrow(
      'Fallo sintético de historial',
    );
    expect(await estado(v.id)).toMatchObject({
      existencias: 10,
      versionExistencias: 1,
    });
    await admin.agente
      .get('/api/admin/inventario/movimientos/operaciones/' + d.claveSolicitud)
      .expect(404);
    await mover(v.id, d).expect(201);
  });
  it('detecta revocación de sesión confirmada mientras espera la variante', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      cuenta = await acceso('ADMIN');
    let liberar!: () => void;
    const barrera = new Promise<void>((r) => (liberar = r));
    let adquirido!: () => void;
    const inicio = new Promise<void>((r) => (adquirido = r));
    const bloqueo = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM variantes WHERE id=${v.id} FOR UPDATE`;
        adquirido();
        await barrera;
      },
      { timeout: 20000 },
    );
    await inicio;
    const llamada = mover(v.id, datos(v), cuenta).then((r) => r);
    try {
      await esperarBloqueo();
      await prisma.sesion.updateMany({
        where: { usuarioId: cuenta.id },
        data: { revocadaEn: new Date() },
      });
    } finally {
      liberar();
      await bloqueo;
    }
    expect((await llamada).status).toBe(401);
    expect((await estado(v.id)).existencias).toBe(10);
  });
  it('resuelve salida manual frente a checkout sin sobreventa', async () => {
    const p = await publicado(1),
      v = await estado(p.variantes[0].id),
      cuerpo = await datosPedido(v.sku, '100.00', 1);
    const r = await Promise.all([
      mover(v.id, datos(v, { tipo: 'SALIDA', cantidad: -1 }), otro),
      post('/api/pedidos', cuerpo, cliente),
    ]);
    expect(r.filter((x) => x.status === 201)).toHaveLength(1);
    const final = await estado(v.id);
    expect(final.existencias >= final.cantidadReservada).toBe(true);
    expect([0, 1]).toContain(final.existencias);
  });
  it('incrementa versión una sola vez al despachar y no al entregar', async () => {
    const p = await publicado(),
      pre = await preparar(p),
      id = p.variantes[0].id,
      v = await estado(id);
    const d = {
      versionPedido: pre.pedido.version,
      transportista: 'Reparto prueba',
      referenciaSeguimiento: '00123',
    };
    const r = await post(
      '/api/admin/pedidos/' + pre.codigo + '/envio',
      d,
    ).expect(200);
    expect(await estado(id)).toMatchObject({
      existencias: 8,
      cantidadReservada: 0,
      versionExistencias: v.versionExistencias + 1,
    });
    await post('/api/admin/pedidos/' + pre.codigo + '/envio', d).expect(409);
    await mover(id, datos(v)).expect(409);
    await post('/api/admin/pedidos/' + pre.codigo + '/entrega', {
      versionPedido: r.body.pedido.version,
      confirmado: true,
    }).expect(200);
    expect((await estado(id)).versionExistencias).toBe(
      v.versionExistencias + 1,
    );
    expect(
      await prisma.movimientoInventario.count({
        where: { varianteId: id, origen: 'ENVIO_PEDIDO' },
      }),
    ).toBe(1);
  });
  it('serializa reposición manual y despacho sin duplicar consumo', async () => {
    const p = await publicado(),
      pre = await preparar(p),
      id = p.variantes[0].id,
      v = await estado(id);
    const r = await Promise.all([
      mover(id, datos(v), otro),
      post('/api/admin/pedidos/' + pre.codigo + '/envio', {
        versionPedido: pre.pedido.version,
        transportista: 'Prueba',
        referenciaSeguimiento: '001',
      }),
    ]);
    expect(r[1].status).toBe(200);
    expect([201, 409]).toContain(r[0].status);
    expect(await estado(id)).toMatchObject({
      cantidadReservada: 0,
      existencias: r[0].status === 201 ? 10 : 8,
      versionExistencias: r[0].status === 201 ? 3 : 2,
    });
    expect(
      await prisma.movimientoInventario.count({
        where: { varianteId: id, origen: 'ENVIO_PEDIDO' },
      }),
    ).toBe(1);
  });
  it('mantiene recuperación autorizada después de deshabilitar o archivar la ficha', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v),
      r = await mover(v.id, d).expect(201);
    await prisma.variante.update({
      where: { id: v.id },
      data: { habilitada: false },
    });
    await prisma.producto.update({
      where: { id: p.id },
      data: { estado: 'ARCHIVADO' },
    });
    expect((await mover(v.id, d).expect(201)).body).toEqual(r.body);
  });
  it('devuelve 404 por UUID inexistente y 400 por identificador interno', async () => {
    await admin.agente
      .get('/api/admin/inventario/variantes/' + randomUUID())
      .expect(404);
    await admin.agente
      .get('/api/admin/inventario/variantes/SHO-0001')
      .expect(400);
    await admin.agente
      .get('/api/admin/inventario/movimientos/operaciones/' + randomUUID())
      .expect(404);
  });
  it('exige el punto de conversión confirmado antes de una escritura nueva', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      antes = await prisma.conversionCatalogo.findUniqueOrThrow({
        where: { id: 1 },
      });
    await prisma.conversionCatalogo.update({
      where: { id: 1 },
      data: {
        huellaOrigen: null,
        huellaManifiesto: null,
        manifiesto: Prisma.DbNull,
        realizadaEn: null,
      },
    });
    try {
      await mover(v.id, datos(v))
        .expect(409)
        .expect((r) => expect(r.body.codigo).toBe('CATALOGO_NO_CONVERTIDO'));
      expect((await estado(v.id)).existencias).toBe(10);
    } finally {
      await prisma.conversionCatalogo.update({
        where: { id: 1 },
        data: {
          huellaOrigen: antes.huellaOrigen,
          huellaManifiesto: antes.huellaManifiesto,
          manifiesto: antes.manifiesto as Prisma.InputJsonValue,
          realizadaEn: antes.realizadaEn,
        },
      });
    }
  });
  it('rechaza identidad directa incoherente antes de modificar stock', async () => {
    const p = await producto(),
      id = p.variantes[0].id;
    await prisma.variante.update({ where: { id }, data: { productoId: null } });
    await mover(id, datos(await estado(id)))
      .expect(409)
      .expect((r) => expect(r.body.codigo).toBe('INVENTARIO_INCONSISTENTE'));
    expect((await estado(id)).existencias).toBe(10);
  });
  it('detecta versiones antiguas incluso si el físico vuelve al mismo saldo', async () => {
    const p = await producto(),
      v = await estado(p.variantes[0].id),
      d = datos(v);
    await mover(v.id, datos(v)).expect(201);
    await mover(
      v.id,
      datos(await estado(v.id), { tipo: 'AJUSTE', cantidad: -2 }),
    ).expect(201);
    expect(await estado(v.id)).toMatchObject({
      existencias: 10,
      versionExistencias: 3,
    });
    await mover(v.id, d).expect(409);
  });
  it('el límite de versión del despacho revierte reservas, físico y estados', async () => {
    const p = await publicado(),
      pre = await preparar(p),
      id = p.variantes[0].id;
    await prisma.variante.update({
      where: { id },
      data: { versionExistencias: 4294967295 },
    });
    await post('/api/admin/pedidos/' + pre.codigo + '/envio', {
      versionPedido: pre.pedido.version,
      transportista: 'Prueba',
      referenciaSeguimiento: '001',
    }).expect(409);
    expect(await estado(id)).toMatchObject({
      existencias: 10,
      cantidadReservada: 2,
      versionExistencias: 4294967295,
    });
    expect(
      (await prisma.pedido.findUniqueOrThrow({ where: { codigo: pre.codigo } }))
        .estadoEntrega,
    ).toBe('EN_PREPARACION');
    expect(
      await prisma.movimientoInventario.count({
        where: { varianteId: id, origen: 'ENVIO_PEDIDO' },
      }),
    ).toBe(0);
  });
});
