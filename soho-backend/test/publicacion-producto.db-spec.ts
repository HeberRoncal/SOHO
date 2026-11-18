import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { Prisma } from '../src/generated/prisma/client.js';
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
import type { ContextoAuth } from '../src/autenticacion/sesiones/contexto-auth.js';
import { ConfiguracionPedidos } from '../src/pedidos/configuracion-pedidos.js';
import { cuerpoJsonGeneral } from '../src/pedidos/http/cuerpo-pedido.middleware.js';
import { sembrarCatalogo } from '../prisma/sembrar-catalogo.js';
import { LecturaCatalogo } from '../src/productos/migracion/lectura-catalogo.js';
import { PlanCorrespondenciaProductos } from '../src/productos/migracion/plan-correspondencia-productos/plan-correspondencia-productos.js';
import { ConvertirCatalogo } from '../src/productos/migracion/convertir-catalogo.js';
import {
  ConfiguracionCloudinary,
  HTTP_CLOUDINARY,
} from '../src/productos/fotografias/configuracion-cloudinary.js';
import { ArchivosProductoService } from '../src/productos/fotografias/archivos-producto.service.js';
import { CloudinaryService } from '../src/productos/fotografias/cloudinary.service.js';
import { PrepararFotografiaService } from '../src/productos/fotografias/preparar-fotografia.service.js';
import { MantenimientoFotografiasService } from '../src/productos/fotografias/mantenimiento-fotografias.service.js';
import { PublicacionProductoService } from '../src/productos/publicacion/publicacion-producto.service.js';
import { CloudinarySimulado } from './fotografias-proveedor.js';
import { datosPedido } from './pedidos-fixtures.js';
import { PedidosService } from '../src/pedidos/pedidos.service.js';

const url = process.env.TEST_PUBLICACION_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Publicación requiere TEST_PUBLICACION_DATABASE_URL exclusiva, migrada y vacía con sufijo _test.',
  );
const prisma = crearClientePrisma(url),
  proveedor = new CloudinarySimulado(),
  auth = crearConfiguracionAuth({});
const cloud = new ConfiguracionCloudinary({
  CLOUDINARY_CLOUD_NAME: 'sintetico',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'secreto-sintetico',
  NODE_ENV: 'test',
});
const origen = 'http://localhost:4200',
  clave = 'Clave sintética publicación 2026';
type Cuenta = {
  cliente: ReturnType<typeof request.agent>;
  csrf: string;
  usuarioId: string;
};
type Ficha = {
  id: string;
  version: number;
  codigoInterno: string;
  slug: string;
  variantes: Array<{ id: string; sku: string }>;
};
let app: INestApplication,
  privado: string,
  admin: Cuenta,
  otro: Cuenta,
  cliente: Cuenta,
  marcaId: string,
  rutaHeredada: string,
  serie = 0,
  perderClave: string | undefined;
async function acceso(rol: 'ADMIN' | 'CLIENTE'): Promise<Cuenta> {
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Publicación',
      correo: randomUUID() + '@publicacion.test',
      rol,
      claveHash: await new ClavesService().crear(clave),
    },
  });
  const agente = request.agent(app.getHttpServer()),
    token = (await agente.get('/api/auth/csrf').expect(200)).body
      .csrfToken as string;
  const login = await agente
    .post('/api/auth/login')
    .set('Origin', origen)
    .set('X-CSRF-Token', token)
    .send({ correo: u.correo, clave })
    .expect(200);
  return {
    cliente: agente,
    csrf: login.body.csrfToken as string,
    usuarioId: u.id,
  };
}
async function contexto(cuenta = admin): Promise<ContextoAuth> {
  const s = await prisma.sesion.findFirstOrThrow({
    where: { usuarioId: cuenta.usuarioId, revocadaEn: null },
  });
  return {
    sesionId: s.id,
    usuario: {
      id: cuenta.usuarioId,
      nombres: 'Ana',
      apellidos: 'Publicación',
      correo: 'sintetico@publicacion.test',
      rol: 'ADMIN',
      correoVerificado: false,
    },
  };
}
async function borrador(extra: Record<string, unknown> = {}): Promise<Ficha> {
  serie++;
  const categoria = await prisma.categoria.create({
    data: {
      nombre: 'Categoría publicación ' + serie,
      slug: 'publicacion-' + serie,
    },
  });
  const r = await admin.cliente
    .post('/api/admin/productos')
    .set('Origin', origen)
    .set('X-CSRF-Token', admin.csrf)
    .send({
      claveSolicitud: randomUUID(),
      nombre: 'Modelo publicación ' + serie,
      grupoModelo: {
        marcaId,
        codigoModelo: 'PUB' + serie,
        modelo: 'Modelo publicación ' + serie,
      },
      color: { codigo: 'BL', nombre: 'Blanco', hexadecimal: '#FFFFFF' },
      categoriaId: categoria.id,
      precio: '100.00',
      tallas: ['40', '40.5'],
      ...extra,
    })
    .expect(201);
  return r.body.producto as Ficha;
}
async function fotografia(p: Ficha, cloudinary = false) {
  if (cloudinary) {
    const png = await sharp({
      create: { width: 16, height: 12, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const r = await admin.cliente
      .post('/api/admin/productos/' + p.id + '/fotografias')
      .set('Origin', origen)
      .set('X-CSRF-Token', admin.csrf)
      .field(
        'datos',
        JSON.stringify({ claveCarga: randomUUID(), version: p.version }),
      )
      .attach('archivo', png, {
        filename: 'frontal.png',
        contentType: 'image/png',
      })
      .expect(201);
    return r.body.archivo.id as string;
  }
  const ahora = new Date();
  return (
    await prisma.archivoImagen.create({
      data: {
        productoOrigenId: p.id,
        proveedor: 'LEGADO',
        estado: 'DISPONIBLE',
        claveCarga: randomUUID(),
        solicitudHash: 'a'.repeat(64),
        urlEntrega: rutaHeredada,
        creadoEn: ahora,
        confirmadoEn: ahora,
      },
    })
  ).id;
}
function galeria(
  p: Ficha,
  archivoId: string,
  version = p.version,
  cuenta = admin,
) {
  return cuenta.cliente
    .patch('/api/admin/productos/' + p.id + '/galeria')
    .set('Origin', origen)
    .set('X-CSRF-Token', cuenta.csrf)
    .send({
      claveSolicitud: randomUUID(),
      version,
      imagenes: [{ archivoId, textoAlternativo: 'Vista frontal' }],
    });
}
async function listo(cloudinary = false) {
  const p = await borrador(),
    archivoId = await fotografia(p, cloudinary),
    r = await galeria(p, archivoId).expect(200);
  return { ...(r.body.producto as Ficha), archivoId };
}
function publicar(
  p: Pick<Ficha, 'id' | 'version'>,
  key: string = randomUUID(),
  cuenta = admin,
) {
  return cuenta.cliente
    .post('/api/admin/productos/' + p.id + '/publicacion')
    .set('Origin', origen)
    .set('X-CSRF-Token', cuenta.csrf)
    .send({ claveSolicitud: key, version: p.version });
}
async function esperarBloqueo(
  tabla: 'productos' | 'archivos_imagen' | 'marcas',
) {
  for (let i = 0; i < 150; i++) {
    const [r] = await prisma.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE d.OBJECT_SCHEMA=DATABASE() AND d.OBJECT_NAME=${tabla}`;
    if (Number(r.n) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('No apareció el bloqueo esperado en ' + tabla);
}
describe.sequential('Publicación con HTTP y MySQL exclusivo', () => {
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
    rutaHeredada = (
      await prisma.archivoImagen.findFirstOrThrow({
        where: { proveedor: 'LEGADO' },
      })
    ).urlEntrega!;
    privado = await mkdtemp(path.join(tmpdir(), 'soho-publicacion-test-'));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(auth)
      .overrideProvider(ConfiguracionCloudinary)
      .useValue(cloud)
      .overrideProvider(HTTP_CLOUDINARY)
      .useValue(proveedor.http)
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: vi.fn() })
      .overrideProvider(ConfiguracionPedidos)
      .useValue(
        new ConfiguracionPedidos({
          PEDIDOS_DIRECTORIO_PRIVADO: privado,
          NODE_ENV: 'test',
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
            req.path.endsWith('/publicacion') &&
            req.body?.claveSolicitud === perderClave &&
            res.statusCode === 200
          ) {
            perderClave = undefined;
            res.destroy();
            return res;
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
          path.basename(objetivo).startsWith('soho-publicacion-test-'),
      ).toBe(true);
      await rm(objetivo, { recursive: true, force: true });
    }
  });
  it('publica con stock cero, auditoría, versión y consulta pública', async () => {
    const p = await listo(),
      antes = await prisma.variante.findMany({
        where: { productoId: p.id },
        orderBy: { id: 'asc' },
      }),
      movimientos = await prisma.movimientoInventario.count(),
      key = randomUUID();
    await request(app.getHttpServer())
      .get('/api/productos/' + p.slug)
      .expect(404);
    const r = await publicar(p, key).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.producto).toMatchObject({
      id: p.id,
      estado: 'publicado',
      version: p.version + 1,
      codigoInterno: p.codigoInterno,
      slug: p.slug,
      inventario: { fisico: 0, reservado: 0, disponible: 0 },
    });
    const operacion = await prisma.operacionProducto.findUniqueOrThrow({
      where: { claveSolicitud: key },
    });
    expect(operacion).toMatchObject({
      tipo: 'PUBLICAR',
      usuarioResponsableId: admin.usuarioId,
      versionAnterior: p.version,
      versionPosterior: p.version + 1,
    });
    expect(
      await prisma.variante.findMany({
        where: { productoId: p.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(antes);
    expect(await prisma.movimientoInventario.count()).toBe(movimientos);
    const ficha = await request(app.getHttpServer())
      .get('/api/productos/' + p.slug)
      .expect(200);
    expect(
      ficha.body.variantes.every(
        (v: { disponible: number }) => v.disponible === 0,
      ),
    ).toBe(true);
  });
  it('publica una galería Cloudinary confirmada sin nuevas llamadas externas', async () => {
    const p = await listo(true),
      antes = { ...proveedor.peticiones };
    await publicar(p).expect(200);
    expect(proveedor.peticiones).toEqual(antes);
    const fila = await prisma.imagenProducto.findFirstOrThrow({
      where: { productoId: p.id },
      include: { archivo: true },
    });
    expect(fila.archivo?.proveedor).toBe('CLOUDINARY');
    expect(fila.archivo?.estado).toBe('DISPONIBLE');
  });
  it('publica conservando variantes deshabilitadas, reservas mayores al stock y sus SKU', async () => {
    const p = await listo();
    await prisma.variante.update({
      where: { id: p.variantes[0].id },
      data: { habilitada: false, cantidadReservada: 3 },
    });
    const antes = await prisma.variante.findMany({
      where: { productoId: p.id },
      orderBy: { id: 'asc' },
    });
    await publicar(p).expect(200);
    expect(
      await prisma.variante.findMany({
        where: { productoId: p.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(antes);
  });
  it('recupera la misma publicación y no incrementa dos veces aunque el estado sea posterior', async () => {
    const p = await listo(),
      key = randomUUID(),
      r = await publicar(p, key).expect(200);
    await prisma.producto.update({
      where: { id: p.id },
      data: { estado: 'ARCHIVADO', version: { increment: 1 } },
    });
    expect((await publicar(p, key).expect(200)).body).toEqual(r.body);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).estado,
    ).toBe('ARCHIVADO');
    expect(
      (
        await admin.cliente
          .get('/api/admin/productos/operaciones/' + key)
          .expect(200)
      ).body,
    ).toEqual(r.body);
    expect(
      await prisma.operacionProducto.count({
        where: { productoId: p.id, tipo: 'PUBLICAR' },
      }),
    ).toBe(1);
  });
  it('recupera el COMMIT tras perder la respuesta HTTP', async () => {
    const p = await listo(),
      key = randomUUID();
    perderClave = key;
    await expect(publicar(p, key)).rejects.toThrow();
    const consulta = await admin.cliente
      .get('/api/admin/productos/operaciones/' + key)
      .expect(200);
    expect((await publicar(p, key).expect(200)).body).toEqual(consulta.body);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
        .version,
    ).toBe(p.version + 1);
  });
  it('reintentos concurrentes de la misma clave recuperan una sola operación', async () => {
    const p = await listo(),
      key = randomUUID(),
      [a, b] = await Promise.all([publicar(p, key), publicar(p, key)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    expect(
      await prisma.operacionProducto.count({ where: { claveSolicitud: key } }),
    ).toBe(1);
  });
  it('dos administradores no publican dos veces la misma versión', async () => {
    const p = await listo(),
      [a, b] = await Promise.all([
        publicar(p),
        publicar(p, randomUUID(), otro),
      ]);
    expect([a.status, b.status].sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
        .version,
    ).toBe(p.version + 1);
  });
  it('no reutiliza una clave con otro contenido, otro administrador u otro producto', async () => {
    const p = await listo(),
      q = await listo(),
      key = randomUUID();
    await publicar(p, key).expect(200);
    await publicar({ ...p, version: p.version + 1 }, key).expect(409);
    await publicar(p, key, otro).expect(409);
    await publicar(q, key).expect(409);
    await otro.cliente
      .get('/api/admin/productos/operaciones/' + key)
      .expect(404);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: q.id } })).estado,
    ).toBe('BORRADOR');
  });
  it('no reutiliza claves confirmadas de alta o edición de galería', async () => {
    const p = await listo(),
      op = await prisma.operacionProducto.findFirstOrThrow({
        where: { productoId: p.id, tipo: 'ACTUALIZAR_GALERIA' },
      });
    await publicar(p, op.claveSolicitud).expect(409);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).estado,
    ).toBe('BORRADOR');
  });
  it('exige la versión vigente, borrador y conversión completada', async () => {
    const p = await listo();
    await publicar({ ...p, version: 1 }).expect(409);
    await prisma.producto.update({
      where: { id: p.id },
      data: { estado: 'ARCHIVADO' },
    });
    await publicar(p).expect(409);
    await prisma.producto.update({
      where: { id: p.id },
      data: { estado: 'BORRADOR' },
    });
    const original = await prisma.conversionCatalogo.findUniqueOrThrow({
      where: { id: 1 },
    });
    try {
      await prisma.conversionCatalogo.update({
        where: { id: 1 },
        data: {
          huellaOrigen: null,
          huellaManifiesto: null,
          manifiesto: Prisma.DbNull,
          realizadaEn: null,
        },
      });
      await publicar(p).expect(409);
    } finally {
      await prisma.conversionCatalogo.update({
        where: { id: 1 },
        data: {
          huellaOrigen: original.huellaOrigen,
          huellaManifiesto: original.huellaManifiesto,
          manifiesto: original.manifiesto as Prisma.InputJsonObject,
          realizadaEn: original.realizadaEn,
        },
      });
    }
  });
  it('protege sesión, ADMIN y CSRF y rechaza cuerpos o rutas inválidas', async () => {
    const p = await listo();
    await request(app.getHttpServer())
      .post('/api/admin/productos/' + p.id + '/publicacion')
      .send({})
      .expect(401);
    await publicar(p, randomUUID(), cliente).expect(403);
    await admin.cliente
      .post('/api/admin/productos/' + p.id + '/publicacion')
      .set('Origin', origen)
      .send({ claveSolicitud: randomUUID(), version: p.version })
      .expect(403);
    for (const body of [
      { version: p.version },
      { claveSolicitud: randomUUID(), version: p.version, estado: 'PUBLICADO' },
    ])
      await admin.cliente
        .post('/api/admin/productos/' + p.id + '/publicacion')
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send(body)
        .expect(400);
    await publicar({ id: randomUUID(), version: 1 }).expect(404);
    await publicar({ id: 'SHO-0001', version: 1 }).expect(400);
  });
  it('devuelve requisitos corregibles de un borrador incompleto sin crear operación', async () => {
    const p = await borrador({
        grupoModelo: null,
        color: null,
        categoriaId: null,
        precio: null,
        tallas: [],
      }),
      r = await publicar(p).expect(422);
    expect(r.body.codigo).toBe('PRODUCTO_NO_PUBLICABLE');
    expect(r.body.incidencias.map((i: { codigo: string }) => i.codigo)).toEqual(
      expect.arrayContaining([
        'IDENTIDAD_INCOMPLETA',
        'CATEGORIA_NO_ACTIVA',
        'PRECIO_INVALIDO',
        'VARIANTE_HABILITADA_REQUERIDA',
        'GALERIA_INCOMPLETA',
      ]),
    );
    expect(
      await prisma.operacionProducto.count({
        where: { productoId: p.id, tipo: 'PUBLICAR' },
      }),
    ).toBe(0);
  });
  it('revalida marca y categoría activas', async () => {
    const p = await listo(),
      categoriaId = (
        await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })
      ).categoriaId!;
    await prisma.categoria.update({
      where: { id: categoriaId },
      data: { activa: false },
    });
    await publicar(p).expect(422);
    await prisma.categoria.update({
      where: { id: categoriaId },
      data: { activa: true },
    });
    try {
      await prisma.marca.update({
        where: { id: marcaId },
        data: { activa: false },
      });
      await publicar(p).expect(422);
    } finally {
      await prisma.marca.update({
        where: { id: marcaId },
        data: { activa: true },
      });
    }
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
        .version,
    ).toBe(p.version);
  });
  it('comprueba identidad compartida sin corregir silenciosamente el modelo', async () => {
    const p = await listo();
    await prisma.producto.update({
      where: { id: p.id },
      data: { codigoModelo: 'OTROMODELO' },
    });
    const r = await publicar(p).expect(422);
    expect(r.body.incidencias).toContainEqual({
      codigo: 'DATOS_MODELO_INCOHERENTES',
      campo: 'grupoModelo',
    });
  });
  it('rechaza SKU inconsistente también en variantes deshabilitadas', async () => {
    const p = await listo();
    await prisma.variante.update({
      where: { id: p.variantes[0].id },
      data: { habilitada: false, sku: 'NK-NOCOINCIDE-BL-40-' + serie },
    });
    const r = await publicar(p).expect(422);
    expect(r.body.incidencias).toContainEqual({
      codigo: 'SKU_O_TALLA_INCOHERENTES',
      campo: 'variantes',
    });
  });
  it('rechaza variantes sin vínculo directo o asignadas a otro color', async () => {
    const p = await listo();
    await prisma.variante.update({
      where: { id: p.variantes[0].id },
      data: { productoId: null },
    });
    await publicar(p).expect(422);
    await prisma.variante.update({
      where: { id: p.variantes[0].id },
      data: { productoId: p.id },
    });
    const ajeno = await borrador(),
      color = await prisma.productoColor.findFirstOrThrow({
        where: { productoId: ajeno.id },
      });
    await prisma.variante.update({
      where: { id: p.variantes[0].id },
      data: {
        productoColorId: color.id,
        tallaId: (
          await prisma.talla.findUniqueOrThrow({
            where: { sistema_valor: { sistema: 'EU', valor: '41' } },
          })
        ).id,
      },
    });
    await publicar(p).expect(422);
  });
  it('exige al menos una variante habilitada y una galería asociada', async () => {
    const p = await listo();
    await prisma.variante.updateMany({
      where: { productoId: p.id },
      data: { habilitada: false },
    });
    await publicar(p).expect(422);
    const q = await borrador();
    await fotografia(q);
    await publicar(q).expect(422);
  });
  it('rechaza galería sin portada o con URL discordante', async () => {
    const p = await listo(),
      i = await prisma.imagenProducto.findFirstOrThrow({
        where: { productoId: p.id },
      });
    await prisma.imagenProducto.update({
      where: { id: i.id },
      data: { orden: 1 },
    });
    await publicar(p).expect(422);
    await prisma.imagenProducto.update({
      where: { id: i.id },
      data: { orden: 0, ruta: '/otra-foto.png' },
    });
    await publicar(p).expect(422);
  });
  it('exige archivos confirmados y disponibles en toda la galería', async () => {
    const p = await listo(true);
    await prisma.archivoImagen.update({
      where: { id: p.archivoId },
      data: { estado: 'CONCILIANDO', confirmadoEn: null },
    });
    await publicar(p).expect(422);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).estado,
    ).toBe('BORRADOR');
  });
  it('revierte la publicación si falla el registro de auditoría', async () => {
    const p = await listo(),
      extendido = prisma.$extends({
        query: {
          operacionProducto: {
            create() {
              throw Error('Fallo sintético de auditoría');
            },
          },
        },
      }) as unknown as PrismaService,
      escritura = new EscrituraAutorizadaService(extendido, auth),
      archivos = new ArchivosProductoService(
        extendido,
        escritura,
        app.get(CloudinaryService),
        cloud,
        new PrepararFotografiaService(),
      ),
      service = new PublicacionProductoService(archivos);
    const antes = await prisma.producto.findUniqueOrThrow({
      where: { id: p.id },
    });
    await expect(
      service.publicar(
        p.id,
        { claveSolicitud: randomUUID(), version: p.version },
        await contexto(),
      ),
    ).rejects.toThrow('Fallo sintético');
    expect(
      await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
    ).toEqual(antes);
    await request(app.getHttpServer())
      .get('/api/productos/' + p.slug)
      .expect(404);
  });
  it('revalida una sesión revocada mientras espera al producto', async () => {
    const cuenta = await acceso('ADMIN'),
      p = await listo();
    let abrir!: () => void, listoBloqueo!: () => void;
    const espera = new Promise<void>((r) => (abrir = r)),
      entrada = new Promise<void>((r) => (listoBloqueo = r));
    const bloqueo = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM productos WHERE id=${p.id} FOR UPDATE`;
        listoBloqueo();
        await espera;
      },
      { timeout: 20000 },
    );
    await entrada;
    const pendiente = publicar(p, randomUUID(), cuenta).then((r) => r);
    try {
      await esperarBloqueo('productos');
      await prisma.sesion.updateMany({
        where: { usuarioId: cuenta.usuarioId },
        data: { revocadaEn: new Date() },
      });
    } finally {
      abrir();
      await bloqueo;
    }
    expect((await pendiente).status).toBe(401);
    expect(
      (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).estado,
    ).toBe('BORRADOR');
  });
  it('publicar frente a edición del borrador conserva un único cambio válido', async () => {
    const p = await listo(),
      edicion = otro.cliente
        .patch('/api/admin/productos/' + p.id + '/borrador')
        .set('Origin', origen)
        .set('X-CSRF-Token', otro.csrf)
        .send({
          claveSolicitud: randomUUID(),
          version: p.version,
          nombre: 'Nombre corregido en paralelo',
        });
    const [a, b] = await Promise.all([publicar(p), edicion]);
    expect([a.status, b.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const actual = await prisma.producto.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(actual.version).toBe(p.version + 1);
    expect(actual.estado).toBe(a.status === 200 ? 'PUBLICADO' : 'BORRADOR');
  });
  it('publicar frente a retirada de portada nunca publica un producto sin galería', async () => {
    const p = await listo(),
      retirada = otro.cliente
        .patch('/api/admin/productos/' + p.id + '/galeria')
        .set('Origin', origen)
        .set('X-CSRF-Token', otro.csrf)
        .send({
          claveSolicitud: randomUUID(),
          version: p.version,
          imagenes: [],
        });
    const [a, b] = await Promise.all([publicar(p), retirada]);
    expect([a.status, b.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const actual = await prisma.producto.findUniqueOrThrow({
      where: { id: p.id },
      include: { imagenes: true },
    });
    if (actual.estado === 'PUBLICADO') expect(actual.imagenes).toHaveLength(1);
    else expect(actual.imagenes).toHaveLength(0);
  });
  it('espera la marca bloqueada y observa su desactivación antes de publicar', async () => {
    const p = await listo();
    let abrir!: () => void, listoBloqueo!: () => void;
    const espera = new Promise<void>((r) => (abrir = r)),
      entrada = new Promise<void>((r) => (listoBloqueo = r));
    const bloqueo = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM marcas WHERE id=${marcaId} FOR UPDATE`;
        listoBloqueo();
        await espera;
        await tx.marca.update({
          where: { id: marcaId },
          data: { activa: false },
        });
      },
      { timeout: 20000 },
    );
    await entrada;
    const pendiente = publicar(p).then((r) => r);
    try {
      await esperarBloqueo('marcas');
    } finally {
      abrir();
      await bloqueo;
    }
    try {
      expect((await pendiente).status).toBe(422);
    } finally {
      await prisma.marca.update({
        where: { id: marcaId },
        data: { activa: true },
      });
    }
  });
  it('publicar frente a limpieza conserva la imagen referenciada', async () => {
    const p = await listo(true),
      a = await prisma.archivoImagen.update({
        where: { id: p.archivoId },
        data: { limpiarDesde: new Date(Date.now() - 1000) },
      }),
      n = proveedor.peticiones.borrados;
    const [r, retirado] = await Promise.all([
      publicar(p),
      app.get(MantenimientoFotografiasService).limpiar(a),
    ]);
    expect(r.status, r.text).toBe(200);
    expect(retirado).toBe(false);
    expect(proveedor.peticiones.borrados).toBe(n);
    expect(
      (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
        .estado,
    ).toBe('DISPONIBLE');
  });
  it('publicación y checkout concurrentes conservan precio, SKU e imagen histórica', async () => {
    const pedidos = app.get(PedidosService),
      crearOriginal = pedidos.crear.bind(pedidos);
    let falloCompra: unknown;
    const observador = vi
      .spyOn(pedidos, 'crear')
      .mockImplementation(async (...args) => {
        try {
          return await crearOriginal(...args);
        } catch (error) {
          falloCompra =
            error instanceof Prisma.PrismaClientKnownRequestError
              ? { code: error.code, meta: error.meta }
              : error instanceof Error
                ? { nombre: error.name, mensaje: error.message }
                : null;
          throw error;
        }
      });
    const p = await listo(true);
    await prisma.variante.update({
      where: { id: p.variantes[0].id },
      data: { existencias: 2 },
    });
    const invitado = request.agent(app.getHttpServer()),
      token = (await invitado.get('/api/auth/csrf').expect(200)).body
        .csrfToken as string,
      datos = await datosPedido(p.variantes[0].sku, '100.00', 1),
      accesoInvitado = randomBytes(32).toString('hex');
    const comprar = () =>
      invitado
        .post('/api/pedidos')
        .set('Origin', origen)
        .set('X-CSRF-Token', token)
        .set('X-Pedido-Acceso', accesoInvitado)
        .send(datos);
    const [pub, compra] = await Promise.all([publicar(p), comprar()]);
    expect(pub.status, pub.text).toBe(200);
    observador.mockRestore();
    expect([201, 422], JSON.stringify(falloCompra)).toContain(compra.status);
    const pedido = compra.status === 201 ? compra : await comprar().expect(201);
    const articulo = await prisma.pedidoArticulo.findFirstOrThrow({
      where: { archivoImagenId: p.archivoId },
    });
    expect(articulo.sku).toBe(p.variantes[0].sku);
    expect(articulo.precioUnitario.toFixed(2)).toBe('100.00');
    expect(
      await prisma.pedido.count({
        where: { codigo: pedido.body.pedido.codigo },
      }),
    ).toBe(1);
    const variante = await prisma.variante.findUniqueOrThrow({
      where: { id: p.variantes[0].id },
    });
    expect(variante.existencias).toBe(2);
    expect(variante.cantidadReservada).toBe(1);
    const decision = await admin.cliente
      .post('/api/admin/pagos/' + pedido.body.pedido.codigo + '/decision')
      .set('Origin', origen)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        versionPedido: pedido.body.pedido.version,
        versionPago: pedido.body.pedido.pago.version,
        comprobanteId: pedido.body.pedido.pago.comprobantes.at(-1).id,
        accion: 'APROBADO',
        confirmado: true,
      })
      .expect(201);
    const prep = await admin.cliente
      .post('/api/admin/pedidos/' + pedido.body.pedido.codigo + '/preparacion')
      .set('Origin', origen)
      .set('X-CSRF-Token', admin.csrf)
      .send({ versionPedido: decision.body.pedido.version })
      .expect(200);
    await admin.cliente
      .post('/api/admin/pedidos/' + pedido.body.pedido.codigo + '/envio')
      .set('Origin', origen)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        versionPedido: prep.body.pedido.version,
        transportista: 'Reparto sintético',
        referenciaSeguimiento: 'PUBLICACION-001',
      })
      .expect(200);
    const final = await prisma.variante.findUniqueOrThrow({
      where: { id: variante.id },
    });
    expect(final.existencias).toBe(1);
    expect(final.cantidadReservada).toBe(0);
    expect(
      await prisma.movimientoInventario.count({
        where: { varianteId: variante.id, origen: 'ENVIO_PEDIDO' },
      }),
    ).toBe(1);
  });
});
