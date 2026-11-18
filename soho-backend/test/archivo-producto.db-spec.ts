import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import { EscrituraAutorizadaService } from '../src/autenticacion/seguridad/escritura-autorizada.service.js';
import {
  usuarioPublico,
  type ContextoAuth,
} from '../src/autenticacion/sesiones/contexto-auth.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import {
  ConfiguracionCloudinary,
  HTTP_CLOUDINARY,
} from '../src/productos/fotografias/configuracion-cloudinary.js';
import { ArchivosProductoService } from '../src/productos/fotografias/archivos-producto.service.js';
import { ArchivoProductoService } from '../src/productos/archivo/archivo-producto.service.js';
import { CloudinaryService } from '../src/productos/fotografias/cloudinary.service.js';
import { PrepararFotografiaService } from '../src/productos/fotografias/preparar-fotografia.service.js';
import { sembrarCatalogo } from '../prisma/sembrar-catalogo.js';
import { LecturaCatalogo } from '../src/productos/migracion/lectura-catalogo.js';
import { PlanCorrespondenciaProductos } from '../src/productos/migracion/plan-correspondencia-productos/plan-correspondencia-productos.js';
import { ConvertirCatalogo } from '../src/productos/migracion/convertir-catalogo.js';
import { datosPedido } from './pedidos-fixtures.js';

const url = process.env.TEST_ARCHIVO_DATABASE_URL;
if (!url)
  throw Error('Archivo requiere TEST_ARCHIVO_DATABASE_URL temporal explícita.');
const destino = new URL(obtenerUrlBaseDatos(url));
if (
  !['127.0.0.1', 'localhost'].includes(destino.hostname) ||
  !destino.pathname.endsWith('_test')
)
  throw Error(
    'Archivo requiere MySQL local exclusivo, migrado, vacío y con sufijo _test.',
  );
const prisma = crearClientePrisma(url),
  auth = crearConfiguracionAuth({});
const cloud = new ConfiguracionCloudinary({ NODE_ENV: 'test' });
const externo = vi.fn(() => {
  throw Error('Archivo no debe consultar proveedores externos.');
});
const origen = 'http://localhost:4200',
  clave = 'Clave sintética archivo 2026';
type Cuenta = {
  agente: ReturnType<typeof request.agent>;
  csrf: string;
  id: string;
};
type Ficha = {
  id: string;
  version: number;
  slug: string;
  codigoInterno: string;
  variantes: Array<{ id: string; sku: string }>;
};
let app: INestApplication,
  privado: string,
  admin: Cuenta,
  otro: Cuenta,
  cliente: Cuenta;
let marcaId: string,
  categoriaId: string,
  serie = 0,
  perderClave: string | undefined;
async function acceso(rol: 'ADMIN' | 'CLIENTE'): Promise<Cuenta> {
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Archivo',
      correo: randomUUID() + '@archivo.test',
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
function cambiar(
  p: Pick<Ficha, 'id' | 'version'>,
  accion: 'archivo' | 'restauracion' = 'archivo',
  cuenta = admin,
  key: string = randomUUID(),
) {
  return post(
    `/api/admin/productos/${p.id}/${accion}`,
    { claveSolicitud: key, version: p.version },
    cuenta,
  );
}
async function producto(publicar = false, stock = 10): Promise<Ficha> {
  serie++;
  const r = await post('/api/admin/productos', {
    claveSolicitud: randomUUID(),
    nombre: 'Modelo archivo ' + serie,
    grupoModelo: {
      marcaId,
      codigoModelo: 'ARC' + serie,
      modelo: 'Modelo archivo ' + serie,
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
  if (!publicar) return p;
  const ahora = new Date();
  const a = await prisma.archivoImagen.create({
    data: {
      productoOrigenId: p.id,
      proveedor: 'LEGADO',
      estado: 'DISPONIBLE',
      claveCarga: randomUUID(),
      solicitudHash: 'a'.repeat(64),
      urlEntrega: '/imagenes/prueba-archivo.png',
      creadoEn: ahora,
      confirmadoEn: ahora,
    },
  });
  const g = await admin.agente
    .patch(`/api/admin/productos/${p.id}/galeria`)
    .set('Origin', origen)
    .set('X-CSRF-Token', admin.csrf)
    .send({
      claveSolicitud: randomUUID(),
      version: p.version,
      imagenes: [{ archivoId: a.id }],
    })
    .expect(200);
  return (
    await post(`/api/admin/productos/${p.id}/publicacion`, {
      claveSolicitud: randomUUID(),
      version: g.body.producto.version,
    }).expect(200)
  ).body.producto as Ficha;
}
async function contexto(cuenta = admin): Promise<ContextoAuth> {
  const s = await prisma.sesion.findFirstOrThrow({
    where: { usuarioId: cuenta.id, revocadaEn: null },
    include: { usuario: true },
  });
  return { sesionId: s.id, usuario: usuarioPublico(s.usuario) };
}
async function dominio() {
  const tablas = [
    'marcas',
    'categorias',
    'grupos_modelo',
    'producto_colores',
    'tallas',
    'variantes',
    'imagenes_producto',
    'imagenes_producto_color',
    'archivos_imagen',
    'alias_producto',
    'movimientos_inventario',
    'pedidos',
    'pedido_articulos',
    'pedido_articulo_unidades',
    'pedido_facturacion',
    'pagos_pedido',
    'comprobantes_pago',
    'reservas_inventario',
    'eventos_pedido',
    'envios_pedido',
    'cancelaciones_pedido',
    'configuracion_reserva',
    'zonas_entrega',
    'secuencia_codigo_producto',
    'conversion_catalogo',
  ];
  return Promise.all(
    tablas.map(async (tabla) => ({
      tabla,
      filas: await prisma.$queryRawUnsafe(
        'SELECT * FROM `' + tabla + '` ORDER BY id',
      ),
    })),
  );
}
function datosFijos(p: Record<string, unknown>) {
  const {
    estado: _estado,
    version: _version,
    actualizadoEn: _fecha,
    actualizadoPorId: _admin,
    ...resto
  } = p;
  return resto;
}
async function esperarBloqueo() {
  for (let i = 0; i < 150; i++) {
    const [r] = await prisma.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE d.OBJECT_SCHEMA=DATABASE() AND d.OBJECT_NAME='productos'`;
    if (Number(r.n) > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('No apareció el bloqueo comercial esperado.');
}

describe.sequential('Archivo y restauración con HTTP y MySQL temporal', () => {
  beforeAll(async () => {
    const tablas = await prisma.$queryRaw<
      Array<{ nombre: string }>
    >`SELECT TABLE_NAME AS nombre FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME NOT IN ('_prisma_migrations','conversion_catalogo','zonas_entrega','configuracion_reserva','configuracion_pagos','configuracion_tienda')`;
    for (const { nombre } of tablas) {
      expect(nombre).toMatch(/^[a-z_]+$/);
      const [r] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        'SELECT COUNT(*) AS n FROM `' + nombre + '`',
      );
      expect(
        Number(r.n),
        'La base exclusiva debe comenzar vacía: ' + nombre,
      ).toBe(0);
    }
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
    categoriaId = (
      await prisma.categoria.findFirstOrThrow({ where: { activa: true } })
    ).id;
    privado = await mkdtemp(path.join(tmpdir(), 'soho-archivo-test-'));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(auth)
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: vi.fn() })
      .overrideProvider(ConfiguracionCloudinary)
      .useValue(cloud)
      .overrideProvider(HTTP_CLOUDINARY)
      .useValue(externo)
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
            /\/(archivo|restauracion)$/.test(req.path) &&
            req.body?.claveSolicitud === perderClave &&
            res.statusCode === 200
          ) {
            perderClave = undefined;
            return res
              .status(503)
              .send('Respuesta sintética perdida tras COMMIT.');
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
      const objetivo = await realpath(privado),
        raiz = await realpath(tmpdir());
      expect(
        objetivo.startsWith(raiz + path.sep) &&
          path.basename(objetivo).startsWith('soho-archivo-test-'),
      ).toBe(true);
      await rm(objetivo, { recursive: true, force: true });
    }
    expect(externo).not.toHaveBeenCalled();
  });

  describe.each(['archivo', 'restauracion'] as const)('%s', (accion) => {
    it('rechaza anónimo y CLIENTE aunque conozcan el UUID', async () => {
      const p = await producto();
      await request(app.getHttpServer())
        .post(`/api/admin/productos/${p.id}/${accion}`)
        .send({ claveSolicitud: randomUUID(), version: p.version })
        .expect(401);
      await cambiar(p, accion, cliente).expect(403);
    });
    it('exige CSRF, origen permitido y JSON', async () => {
      const p = await producto();
      const ruta = `/api/admin/productos/${p.id}/${accion}`;
      await admin.agente
        .post(ruta)
        .set('Origin', origen)
        .send({ claveSolicitud: randomUUID(), version: p.version })
        .expect(403);
      await admin.agente
        .post(ruta)
        .set('Origin', 'https://otro.test')
        .set('X-CSRF-Token', admin.csrf)
        .send({ claveSolicitud: randomUUID(), version: p.version })
        .expect(403);
      await admin.agente
        .post(ruta)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .type('form')
        .send({ version: 1 })
        .expect(415);
    });
    it.each([
      { version: 1 },
      { claveSolicitud: randomUUID(), version: '1' },
      { claveSolicitud: randomUUID(), version: 4294967295 },
      { claveSolicitud: randomUUID(), version: 1, estado: 'PUBLICADO' },
    ])('rechaza un contrato inválido %j sin escribir', async (cuerpo) => {
      const p = await producto();
      const antes = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      await post(`/api/admin/productos/${p.id}/${accion}`, cuerpo).expect(400);
      expect(
        await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
      ).toEqual(antes);
    });
    it('rechaza identificadores comerciales, query extra y producto inexistente', async () => {
      const p = await producto();
      const cuerpo = { claveSolicitud: randomUUID(), version: p.version };
      await post(`/api/admin/productos/SHO-0001/${accion}`, cuerpo).expect(400);
      await post(
        `/api/admin/productos/${p.id}/${accion}?confirmar=true`,
        cuerpo,
      ).expect(400);
      await cambiar({ id: randomUUID(), version: 1 }, accion).expect(404);
    });
    it('rechaza versión obsoleta sin incrementar ni registrar la operación', async () => {
      const p = await producto();
      const ficha =
        accion === 'restauracion'
          ? ((await cambiar(p).expect(200)).body.producto as Ficha)
          : p;
      const key = randomUUID();
      const r = await cambiar(
        { ...ficha, version: ficha.version + 1 },
        accion,
        admin,
        key,
      ).expect(409);
      expect(r.body.codigo).toBe('PRODUCTO_CAMBIADO');
      expect(
        await prisma.operacionProducto.count({
          where: { claveSolicitud: key },
        }),
      ).toBe(0);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(ficha.version);
    });
    it('recupera un COMMIT sin respuesta con la misma clave y una sola versión', async () => {
      const p = await producto();
      const ficha =
        accion === 'restauracion'
          ? ((await cambiar(p).expect(200)).body.producto as Ficha)
          : p;
      const key = randomUUID();
      perderClave = key;
      await cambiar(ficha, accion, admin, key).expect(503);
      const resultado = await admin.agente
        .get('/api/admin/productos/operaciones/' + key)
        .expect(200);
      const repetida = await cambiar(ficha, accion, admin, key).expect(200);
      expect(repetida.body).toEqual(resultado.body);
      expect(resultado.body.producto.version).toBe(ficha.version + 1);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(ficha.version + 1);
      expect(
        await prisma.operacionProducto.count({
          where: { claveSolicitud: key },
        }),
      ).toBe(1);
      await otro.agente
        .get('/api/admin/productos/operaciones/' + key)
        .expect(404);
      await cambiar(ficha, accion, otro, key).expect(409);
    });
    it('revierte el estado si falla la auditoría', async () => {
      const p = await producto();
      const ficha =
        accion === 'restauracion'
          ? ((await cambiar(p).expect(200)).body.producto as Ficha)
          : p;
      const extendido = prisma.$extends({
        query: {
          operacionProducto: {
            create() {
              throw Error('Fallo sintético de auditoría');
            },
          },
        },
      }) as unknown as PrismaService;
      const escritura = new EscrituraAutorizadaService(extendido, auth);
      const archivos = new ArchivosProductoService(
        extendido,
        escritura,
        app.get(CloudinaryService),
        cloud,
        new PrepararFotografiaService(),
      );
      const s = new ArchivoProductoService(archivos),
        key = randomUUID();
      const antes = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      await expect(
        s[accion === 'archivo' ? 'archivar' : 'restaurar'](
          p.id,
          { claveSolicitud: key, version: ficha.version },
          await contexto(),
        ),
      ).rejects.toThrow('Fallo sintético');
      expect(
        await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
      ).toEqual(antes);
      expect(
        await prisma.operacionProducto.count({
          where: { claveSolicitud: key },
        }),
      ).toBe(0);
    });
    it('observa la revocación de sesión mientras espera el producto', async () => {
      const cuenta = await acceso('ADMIN'),
        p = await producto();
      const ficha =
        accion === 'restauracion'
          ? ((await cambiar(p).expect(200)).body.producto as Ficha)
          : p;
      let liberar!: () => void, listo!: () => void;
      const espera = new Promise<void>((r) => (liberar = r)),
        entrada = new Promise<void>((r) => (listo = r));
      const bloqueo = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM productos WHERE id=${p.id} FOR UPDATE`;
          listo();
          await espera;
        },
        { timeout: 20000 },
      );
      await entrada;
      const llamada = cambiar(ficha, accion, cuenta).then((r) => r);
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
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(ficha.version);
    });
  });

  it('archiva y restaura un borrador incompleto sin exigir requisitos de publicación', async () => {
    const p = (
      await post('/api/admin/productos', {
        claveSolicitud: randomUUID(),
        nombre: 'Ficha incompleta',
      }).expect(201)
    ).body.producto as Ficha;
    const r = await cambiar(p).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.producto).toMatchObject({
      id: p.id,
      estado: 'archivado',
      version: p.version + 1,
      precio: null,
      variantes: [],
    });
    const restaurada = await cambiar(
      r.body.producto as Ficha,
      'restauracion',
      otro,
    ).expect(200);
    expect(restaurada.body.producto.estado).toBe('borrador');
    await post(`/api/admin/productos/${p.id}/publicacion`, {
      claveSolicitud: randomUUID(),
      version: restaurada.body.producto.version,
    }).expect(422);
    const op = await prisma.operacionProducto.findUniqueOrThrow({
      where: { claveSolicitud: restaurada.body.operacion.claveSolicitud },
    });
    expect(op.usuarioResponsableId).toBe(otro.id);
  });
  it('permite retirar y restaurar una ficha cuya categoría dejó de estar activa', async () => {
    const p = await producto(true);
    await prisma.categoria.update({
      where: { id: categoriaId },
      data: { activa: false },
    });
    try {
      const a = await cambiar(p).expect(200);
      const r = await cambiar(a.body.producto as Ficha, 'restauracion').expect(
        200,
      );
      expect(r.body.producto.estado).toBe('borrador');
      await post(`/api/admin/productos/${p.id}/publicacion`, {
        claveSolicitud: randomUUID(),
        version: r.body.producto.version,
      }).expect(422);
    } finally {
      await prisma.categoria.update({
        where: { id: categoriaId },
        data: { activa: true },
      });
    }
  });
  it('retira del catálogo y alias, y restaurar no vuelve a publicar', async () => {
    const p = await producto(true, 0);
    const alias = 'enlace-anterior-' + serie;
    await prisma.aliasProducto.create({
      data: { slugAnterior: alias, codigoColor: '', productoDestinoId: p.id },
    });
    await request(app.getHttpServer())
      .get('/api/productos/' + p.slug)
      .expect(200);
    const a = await cambiar(p).expect(200);
    await request(app.getHttpServer())
      .get('/api/productos/' + p.slug)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/productos/' + alias)
      .expect(404);
    const listado = await request(app.getHttpServer())
      .get(
        '/api/productos?busqueda=' +
          encodeURIComponent('Modelo archivo ' + serie),
      )
      .expect(200);
    expect(JSON.stringify(listado.body)).not.toContain(p.id);
    const r = await cambiar(a.body.producto as Ficha, 'restauracion').expect(
      200,
    );
    expect(r.body.producto.estado).toBe('borrador');
    await request(app.getHttpServer())
      .get('/api/productos/' + p.slug)
      .expect(404);
    await post(`/api/admin/productos/${p.id}/publicacion`, {
      claveSolicitud: randomUUID(),
      version: r.body.producto.version,
    }).expect(200);
    await request(app.getHttpServer())
      .get('/api/productos/' + alias)
      .expect(200);
  });
  it('registra antes/después, hash, actor y fechas coherentes sin modificar identidad', async () => {
    const p = await producto(true),
      key = randomUUID();
    const antes = await prisma.producto.findUniqueOrThrow({
      where: { id: p.id },
    });
    const r = await cambiar(p, 'archivo', admin, key).expect(200);
    const op = await prisma.operacionProducto.findUniqueOrThrow({
      where: { claveSolicitud: key },
    });
    expect(op).toMatchObject({
      productoId: p.id,
      usuarioResponsableId: admin.id,
      tipo: 'ARCHIVAR',
      versionAnterior: p.version,
      versionPosterior: p.version + 1,
      respuesta: r.body,
    });
    expect(op.solicitudHash).toMatch(/^[a-f0-9]{64}$/);
    expect(op.antes).toMatchObject({ estado: 'publicado', version: p.version });
    expect(op.despues).toMatchObject({
      estado: 'archivado',
      version: p.version + 1,
    });
    const despues = await prisma.producto.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(datosFijos(despues)).toEqual(datosFijos(antes));
    expect(despues.actualizadoPorId).toBe(admin.id);
    expect(despues.actualizadoEn.getTime()).toBeGreaterThanOrEqual(
      antes.actualizadoEn.getTime(),
    );
    expect(op.creadoEn.getTime()).toBeGreaterThanOrEqual(
      antes.actualizadoEn.getTime(),
    );
  });
  it.each([false, true])(
    'rechaza restaurar una ficha no archivada, publicada=%s',
    async (publicado) => {
      const p = await producto(publicado);
      const r = await cambiar(p, 'restauracion').expect(409);
      expect(r.body.codigo).toBe('ESTADO_PRODUCTO_INCOMPATIBLE');
    },
  );
  it('una clave nueva no repite una transición terminada', async () => {
    const p = await producto();
    const a = await cambiar(p).expect(200);
    await cambiar(a.body.producto as Ficha).expect(409);
    const b = await cambiar(a.body.producto as Ficha, 'restauracion').expect(
      200,
    );
    await cambiar(b.body.producto as Ficha, 'restauracion').expect(409);
    expect(b.body.producto.version).toBe(p.version + 2);
  });
  it('recupera respuestas históricas sin deshacer cambios posteriores', async () => {
    const p = await producto(),
      keyA = randomUUID(),
      keyR = randomUUID();
    const a = await cambiar(p, 'archivo', admin, keyA).expect(200);
    const r = await cambiar(
      a.body.producto as Ficha,
      'restauracion',
      admin,
      keyR,
    ).expect(200);
    const otra = await cambiar(
      r.body.producto as Ficha,
      'archivo',
      otro,
    ).expect(200);
    expect((await cambiar(p, 'archivo', admin, keyA).expect(200)).body).toEqual(
      a.body,
    );
    expect(
      (
        await cambiar(
          a.body.producto as Ficha,
          'restauracion',
          admin,
          keyR,
        ).expect(200)
      ).body,
    ).toEqual(r.body);
    const actual = await admin.agente
      .get('/api/admin/productos/' + p.id)
      .expect(200);
    expect(actual.body.producto.version).toBe(otra.body.producto.version);
    expect(actual.body.producto.estado).toBe('archivado');
  });
  it('no reutiliza claves para otro cuerpo, acción o producto', async () => {
    const p = await producto(),
      q = await producto(),
      key = randomUUID();
    const a = await cambiar(p, 'archivo', admin, key).expect(200);
    await cambiar(
      { ...p, version: p.version + 1 },
      'archivo',
      admin,
      key,
    ).expect(409);
    await cambiar(a.body.producto as Ficha, 'restauracion', admin, key).expect(
      409,
    );
    await cambiar(q, 'archivo', admin, key).expect(409);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: q.id } })).estado,
    ).toBe('BORRADOR');
  });
  it('evita desbordar la versión sin tocar el estado ni registrar otra operación', async () => {
    const p = await producto();
    await prisma.producto.update({
      where: { id: p.id },
      data: { version: 4294967294 },
    });
    const r = await cambiar({ ...p, version: 4294967294 }).expect(200);
    expect(r.body.producto.version).toBe(4294967295);
    await cambiar(r.body.producto as Ficha, 'restauracion').expect(400);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).estado,
    ).toBe('ARCHIVADO');
  });
  it('dos administradores con la misma versión producen una transición y un conflicto', async () => {
    const p = await producto();
    const r = await Promise.all([cambiar(p), cambiar(p, 'archivo', otro)]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
        .version,
    ).toBe(p.version + 1);
  });
  it('dos envíos simultáneos de la misma solicitud conservan una respuesta y una auditoría', async () => {
    const p = await producto(),
      key = randomUUID();
    const [a, b] = await Promise.all([
      cambiar(p, 'archivo', admin, key),
      cambiar(p, 'archivo', admin, key),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
    expect(
      await prisma.operacionProducto.count({ where: { claveSolicitud: key } }),
    ).toBe(1);
  });
  it('la clave global protege una carrera entre dos productos sin dejar el perdedor modificado', async () => {
    const p = await producto(),
      q = await producto(),
      key = randomUUID();
    const r = await Promise.all([
      cambiar(p, 'archivo', admin, key),
      cambiar(q, 'archivo', otro, key),
    ]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const estados = await prisma.producto.findMany({
      where: { id: { in: [p.id, q.id] } },
      orderBy: { estado: 'asc' },
    });
    expect(
      estados.map((x) => x.estado).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['ARCHIVADO', 'BORRADOR']);
    expect(
      await prisma.operacionProducto.count({ where: { claveSolicitud: key } }),
    ).toBe(1);
  });
  it('archivo frente a edición de borrador conserva una sola operación con la versión esperada', async () => {
    const p = await producto();
    const editar = otro.agente
      .patch(`/api/admin/productos/${p.id}/borrador`)
      .set('Origin', origen)
      .set('X-CSRF-Token', otro.csrf)
      .send({
        claveSolicitud: randomUUID(),
        version: p.version,
        nombre: 'Nombre concurrente',
      });
    const r = await Promise.all([cambiar(p), editar]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
        .version,
    ).toBe(p.version + 1);
  });
  it('archivo frente a publicación no deja una transición sin auditoría', async () => {
    const pub = await producto(true);
    const a = await cambiar(pub).expect(200);
    const p = (
      await cambiar(a.body.producto as Ficha, 'restauracion').expect(200)
    ).body.producto as Ficha;
    const r = await Promise.all([
      cambiar(p),
      post(
        `/api/admin/productos/${p.id}/publicacion`,
        { claveSolicitud: randomUUID(), version: p.version },
        otro,
      ),
    ]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const actual = await prisma.producto.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(actual.version).toBe(p.version + 1);
    expect(actual.estado).toBe(r[0].status === 200 ? 'ARCHIVADO' : 'PUBLICADO');
  });
  it('archivo frente a galería no permite guardarla después de archivar con una versión vieja', async () => {
    const p = await producto();
    const galeria = otro.agente
      .patch(`/api/admin/productos/${p.id}/galeria`)
      .set('Origin', origen)
      .set('X-CSRF-Token', otro.csrf)
      .send({ claveSolicitud: randomUUID(), version: p.version, imagenes: [] });
    const r = await Promise.all([cambiar(p), galeria]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
        .version,
    ).toBe(p.version + 1);
  });
  it('archivo frente a checkout conserva el pedido que confirmó primero o rechaza la compra nueva', async () => {
    const p = await producto(true, 3),
      cuerpo = await datosPedido(p.variantes[0].sku, '100.00', 1);
    const [a, compra] = await Promise.all([
      cambiar(p),
      post('/api/pedidos', cuerpo, cliente),
    ]);
    expect(a.status, a.text).toBe(200);
    expect([201, 422], compra.text).toContain(compra.status);
    const v = await prisma.variante.findUniqueOrThrow({
      where: { id: p.variantes[0].id },
    });
    expect(v.existencias).toBe(3);
    expect(v.cantidadReservada).toBe(compra.status === 201 ? 1 : 0);
    await post(
      '/api/pedidos',
      await datosPedido(p.variantes[0].sku, '100.00', 1),
      cliente,
    ).expect(422);
  });
  it.each(['PENDIENTE', 'APROBADO'])(
    'conserva exactamente 25 tablas de dominio, ficha, comprobante y reservas al archivar/restaurar con pago %s',
    async (estadoPago) => {
      const p = await producto(true);
      const compra = await post(
        '/api/pedidos',
        await datosPedido(p.variantes[0].sku, '100.00'),
        cliente,
      ).expect(201);
      if (estadoPago === 'APROBADO') {
        const pedido = compra.body.pedido;
        await post('/api/admin/pagos/' + pedido.codigo + '/decision', {
          accion: 'APROBADO',
          versionPedido: pedido.version,
          versionPago: pedido.pago.version,
          comprobanteId: pedido.pago.comprobantes[0].id,
          confirmado: true,
        }).expect(201);
      }
      const antes = await dominio(),
        ficheros = await readdir(privado, { recursive: true });
      const datosAntes = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      const a = await cambiar(p).expect(200);
      expect(await dominio()).toEqual(antes);
      const r = await cambiar(a.body.producto as Ficha, 'restauracion').expect(
        200,
      );
      expect(await dominio()).toEqual(antes);
      expect(await readdir(privado, { recursive: true })).toEqual(ficheros);
      expect(
        datosFijos(
          await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
        ),
      ).toEqual(datosFijos(datosAntes));
      expect(r.body.producto.inventario.reservado).toBe(2);
      const pedido = await cliente.agente
        .get('/api/pedidos/' + compra.body.pedido.codigo)
        .expect(200);
      expect(pedido.body.pedido.articulos[0].sku).toBe(p.variantes[0].sku);
    },
  );
  it('un pedido existente puede aprobarse y despacharse con el producto archivado', async () => {
    const p = await producto(true);
    const compra = await post(
      '/api/pedidos',
      await datosPedido(p.variantes[0].sku, '100.00', 2),
      cliente,
    ).expect(201);
    await cambiar(p).expect(200);
    const d = compra.body.pedido,
      codigo = d.codigo as string;
    const decision = await post('/api/admin/pagos/' + codigo + '/decision', {
      accion: 'APROBADO',
      versionPedido: d.version,
      versionPago: d.pago.version,
      comprobanteId: d.pago.comprobantes[0].id,
      confirmado: true,
    }).expect(201);
    const prep = await post(`/api/admin/pedidos/${codigo}/preparacion`, {
      versionPedido: decision.body.pedido.version,
    }).expect(200);
    const envio = await post(`/api/admin/pedidos/${codigo}/envio`, {
      versionPedido: prep.body.pedido.version,
      transportista: 'Reparto prueba',
      referenciaSeguimiento: 'ARC-001',
    }).expect(200);
    await post(`/api/admin/pedidos/${codigo}/entrega`, {
      versionPedido: envio.body.pedido.version,
      confirmado: true,
    }).expect(200);
    const v = await prisma.variante.findUniqueOrThrow({
      where: { id: p.variantes[0].id },
    });
    expect(v.existencias).toBe(8);
    expect(v.cantidadReservada).toBe(0);
    expect(v.versionExistencias).toBe(2);
    expect(
      await prisma.movimientoInventario.count({
        where: { varianteId: v.id, origen: 'ENVIO_PEDIDO' },
      }),
    ).toBe(1);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).estado,
    ).toBe('ARCHIVADO');
  });
});
