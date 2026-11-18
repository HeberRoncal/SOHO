import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
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
import { PublicadosProductoService } from '../src/productos/publicados/publicados-producto.service.js';
import { CloudinarySimulado } from './fotografias-proveedor.js';
import { datosPedido } from './pedidos-fixtures.js';

const url = process.env.TEST_PUBLICADOS_DATABASE_URL;
if (
  !url ||
  !['127.0.0.1', 'localhost'].includes(
    new URL(obtenerUrlBaseDatos(url)).hostname,
  ) ||
  !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test')
)
  throw Error(
    'Publicación requiere TEST_PUBLICADOS_DATABASE_URL exclusiva, migrada y vacía con sufijo _test.',
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
describe.sequential(
  'Edicion de publicados - Publicación con HTTP y MySQL exclusivo',
  () => {
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
      privado = await mkdtemp(path.join(tmpdir(), 'soho-publicados-test-'));
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
              req.method === 'PATCH' &&
              /\/(publicado|galeria)$/.test(req.path) &&
              req.body?.claveSolicitud === perderClave &&
              res.statusCode === 200
            ) {
              perderClave = undefined;
              res.status(503);
              return json({
                message: 'Respuesta sintetica perdida tras COMMIT.',
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
        const objetivo = await realpath(privado),
          raiz = await realpath(tmpdir());
        expect(
          objetivo.startsWith(raiz + path.sep) &&
            path.basename(objetivo).startsWith('soho-publicados-test-'),
        ).toBe(true);
        await rm(objetivo, { recursive: true, force: true });
      }
    });
    let imagenPrueba: Buffer;
    beforeAll(async () => {
      imagenPrueba = await sharp({
        create: { width: 16, height: 12, channels: 3, background: '#ffffff' },
      })
        .png()
        .toBuffer();
    });
    function post(ruta: string, cuerpo: object, cuenta = admin) {
      return cuenta.cliente
        .post(ruta)
        .set('Origin', origen)
        .set('X-CSRF-Token', cuenta.csrf)
        .send(cuerpo);
    }
    async function publicado(stock = 10, cloudinary = true) {
      const p = await listo(cloudinary);
      const r = await publicar(p).expect(200);
      await prisma.variante.updateMany({
        where: { productoId: p.id },
        data: { existencias: stock },
      });
      return { ...(r.body.producto as Ficha), archivoId: p.archivoId };
    }
    function editar(
      p: Pick<Ficha, 'id' | 'version'>,
      cambios: Record<string, unknown> = { nombre: 'Nombre corregido' },
      cuenta = admin,
      key: string = randomUUID(),
    ) {
      return cuenta.cliente
        .patch(`/api/admin/productos/${p.id}/publicado`)
        .set('Origin', origen)
        .set('X-CSRF-Token', cuenta.csrf)
        .send({ claveSolicitud: key, version: p.version, ...cambios });
    }
    function gal(
      p: Pick<Ficha, 'id' | 'version'>,
      imagenes: Array<{ archivoId: string; textoAlternativo?: string }>,
      cuenta = admin,
      key: string = randomUUID(),
    ) {
      return cuenta.cliente
        .patch(`/api/admin/productos/${p.id}/galeria`)
        .set('Origin', origen)
        .set('X-CSRF-Token', cuenta.csrf)
        .send({ claveSolicitud: key, version: p.version, imagenes });
    }
    function cargar(
      p: Pick<Ficha, 'id' | 'version'>,
      key: string = randomUUID(),
      cuenta = admin,
    ) {
      return cuenta.cliente
        .post(`/api/admin/productos/${p.id}/fotografias`)
        .set('Origin', origen)
        .set('X-CSRF-Token', cuenta.csrf)
        .field('datos', JSON.stringify({ claveCarga: key, version: p.version }))
        .attach('archivo', imagenPrueba, {
          filename: 'frontal.png',
          contentType: 'image/png',
        });
    }
    async function protegidos() {
      return Promise.all(
        [
          'marcas',
          'categorias',
          'grupos_modelo',
          'producto_colores',
          'tallas',
          'variantes',
          'imagenes_producto_color',
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
        ].map(async (tabla) => ({
          tabla,
          filas: await prisma.$queryRawUnsafe(
            'SELECT * FROM `' + tabla + '` ORDER BY id',
          ),
        })),
      );
    }
    function identidad(p: Record<string, unknown>) {
      const {
        nombre: _n,
        descripcion: _d,
        categoriaId: _c,
        genero: _g,
        precio: _p,
        precioAnterior: _a,
        esNovedad: _e,
        ordenCatalogo: _o,
        ordenColor: _oc,
        actualizadoEn: _f,
        actualizadoPorId: _u,
        version: _v,
        ...fijos
      } = p;
      return fijos;
    }
    it('exige ADMIN, CSRF, origen permitido y JSON', async () => {
      const p = await publicado();
      const ruta = `/api/admin/productos/${p.id}/publicado`;
      await request(app.getHttpServer()).patch(ruta).send({}).expect(401);
      await editar(p, { nombre: 'Nombre' }, cliente).expect(403);
      await admin.cliente
        .patch(ruta)
        .set('Origin', origen)
        .send({})
        .expect(403);
      await admin.cliente
        .patch(ruta)
        .set('Origin', 'https://otro.test')
        .set('X-CSRF-Token', admin.csrf)
        .send({})
        .expect(403);
      await admin.cliente
        .patch(ruta)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .type('form')
        .send({ nombre: 'Nombre' })
        .expect(415);
    });
    it.each([
      'grupoModelo',
      'marcaId',
      'codigoModelo',
      'modelo',
      'color',
      'codigoColor',
      'colorNombre',
      'colorHexadecimal',
      'estado',
      'slug',
      'codigoInterno',
      'sku',
      'tallas',
      'variantes',
      'habilitada',
      'existencias',
      'cantidadReservada',
      'imagenes',
      'usuarioResponsableId',
    ])(
      'rechaza el campo protegido %s antes de cambiar la ficha',
      async (campo) => {
        const p = await publicado();
        const antes = await prisma.producto.findUniqueOrThrow({
          where: { id: p.id },
        });
        await editar(p, { [campo]: 'dato' }).expect(400);
        expect(
          await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
        ).toEqual(antes);
      },
    );
    it('valida la versión, el UUID y las consultas sin aceptar códigos comerciales', async () => {
      const p = await publicado();
      await editar({ ...p, version: 4294967295 }).expect(400);
      await editar(p, {}).expect(400);
      await editar({ ...p, id: 'SHO-0001' }).expect(400);
      await editar({ ...p, id: randomUUID() }).expect(404);
      await admin.cliente
        .patch(`/api/admin/productos/${p.id}/publicado?confirmar=true`)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send({
          claveSolicitud: randomUUID(),
          version: p.version,
          nombre: 'Nombre',
        })
        .expect(400);
    });
    it('edita los campos comerciales, conserva identidad y estado y registra una auditoría', async () => {
      const p = await publicado(0),
        key = randomUUID();
      const antes = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      const categoria = await prisma.categoria.create({
        data: { nombre: 'Nueva categoría publicada', slug: 'nueva-publicada' },
      });
      const cambios = {
        nombre: 'Nombre publicado corregido',
        descripcion: 'Descripción nueva',
        categoriaId: categoria.id,
        genero: 'MUJER',
        precio: '120.5',
        precioAnterior: '150',
        esNovedad: true,
        ordenCatalogo: 8,
        ordenColor: 3,
      };
      const r = await editar(p, cambios, otro, key).expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.producto).toMatchObject({
        id: p.id,
        estado: 'publicado',
        version: p.version + 1,
        nombre: cambios.nombre,
        genero: 'Mujer',
        precio: '120.50',
        precioAnterior: '150.00',
        categoria: { id: categoria.id },
        inventario: { fisico: 0 },
      });
      const actual = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      expect(identidad(actual)).toEqual(identidad(antes));
      expect(actual.actualizadoPorId).toBe(otro.usuarioId);
      const op = await prisma.operacionProducto.findUniqueOrThrow({
        where: { claveSolicitud: key },
      });
      expect(op).toMatchObject({
        tipo: 'ACTUALIZAR',
        productoId: p.id,
        usuarioResponsableId: otro.usuarioId,
        versionAnterior: p.version,
        versionPosterior: p.version + 1,
        respuesta: r.body,
      });
      expect(op.antes).toMatchObject({
        nombre: antes.nombre,
        precio: '100.00',
      });
      expect(op.despues).toMatchObject({
        nombre: cambios.nombre,
        precio: '120.50',
      });
      const pub = await request(app.getHttpServer())
        .get('/api/productos/' + p.slug)
        .expect(200);
      expect(JSON.stringify(pub.body)).toContain(cambios.nombre);
    });
    it('permite nombres repetidos manteniendo los slug y códigos distintos', async () => {
      const p = await publicado(),
        q = await publicado();
      const nombre = (
        await prisma.producto.findUniqueOrThrow({ where: { id: q.id } })
      ).nombre;
      await editar(p, { nombre }).expect(200);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).slug,
      ).toBe(p.slug);
    });
    it.each([
      { precio: null },
      { categoriaId: null },
      { categoriaId: randomUUID() },
      { precio: '100.00', precioAnterior: '99.00' },
    ])(
      'rechaza el resultado incompleto %j sin cambios ni auditoría',
      async (cambios) => {
        const p = await publicado(),
          key = randomUUID();
        const antes = await prisma.producto.findUniqueOrThrow({
          where: { id: p.id },
        });
        const r = await editar(p, cambios, admin, key).expect(422);
        expect(r.body.codigo).toBe('PRODUCTO_NO_PUBLICABLE');
        expect(
          await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }),
        ).toEqual(antes);
        expect(
          await prisma.operacionProducto.count({
            where: { claveSolicitud: key },
          }),
        ).toBe(0);
      },
    );
    it('exige una categoría activa y permite retirar el precio anterior', async () => {
      const p = await publicado();
      const cat = await prisma.categoria.create({
        data: {
          nombre: 'Inactiva publicada',
          slug: 'inactiva-publicada',
          activa: false,
        },
      });
      await editar(p, { categoriaId: cat.id }).expect(422);
      const r = await editar(p, { precioAnterior: '150.00' }).expect(200);
      const s = await editar(r.body.producto as Ficha, {
        precioAnterior: null,
      }).expect(200);
      expect(s.body.producto.precioAnterior).toBeNull();
    });
    it('no permite guardar un producto que perdió su última variante habilitada', async () => {
      const p = await publicado();
      await prisma.variante.updateMany({
        where: { productoId: p.id },
        data: { habilitada: false },
      });
      await editar(p).expect(422);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(p.version);
    });
    it.each(['BORRADOR', 'ARCHIVADO'] as const)(
      'mantiene separada la edición del estado %s',
      async (estado) => {
        const p = await publicado();
        await prisma.producto.update({ where: { id: p.id }, data: { estado } });
        await editar(p).expect(409);
      },
    );
    it('la ruta de borradores sigue rechazando publicados', async () => {
      const p = await publicado();
      await admin.cliente
        .patch(`/api/admin/productos/${p.id}/borrador`)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send({
          claveSolicitud: randomUUID(),
          version: p.version,
          nombre: 'Nombre',
        })
        .expect(409);
    });
    it('rechaza una versión obsoleta y el límite impide desbordamientos', async () => {
      const p = await publicado();
      await editar({ ...p, version: p.version - 1 }).expect(409);
      await prisma.producto.update({
        where: { id: p.id },
        data: { version: 4294967294 },
      });
      const r = await editar({ ...p, version: 4294967294 }).expect(200);
      expect(r.body.producto.version).toBe(4294967295);
      await editar(r.body.producto as Ficha).expect(400);
    });
    it('recupera COMMIT sin respuesta y no duplica ni vuelve a editar después del archivo', async () => {
      const p = await publicado(),
        key = randomUUID(),
        cambios = { precio: '125.00' };
      perderClave = key;
      await editar(p, cambios, admin, key).expect(503);
      const historica = await admin.cliente
        .get('/api/admin/productos/operaciones/' + key)
        .expect(200);
      await post(`/api/admin/productos/${p.id}/archivo`, {
        claveSolicitud: randomUUID(),
        version: p.version + 1,
      }).expect(200);
      expect((await editar(p, cambios, admin, key).expect(200)).body).toEqual(
        historica.body,
      );
      const actual = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      expect(actual.estado).toBe('ARCHIVADO');
      expect(actual.version).toBe(p.version + 2);
      expect(
        await prisma.operacionProducto.count({
          where: { claveSolicitud: key },
        }),
      ).toBe(1);
      await otro.cliente
        .get('/api/admin/productos/operaciones/' + key)
        .expect(404);
      await editar(p, cambios, otro, key).expect(409);
      await editar(p, { precio: '126.00' }, admin, key).expect(409);
    });
    it('la clave de una actualización de borrador no se recupera como actualización publicada', async () => {
      const p = await listo(),
        key = randomUUID(),
        cambios = { nombre: 'Nombre pendiente' };
      await admin.cliente
        .patch(`/api/admin/productos/${p.id}/borrador`)
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send({ claveSolicitud: key, version: p.version, ...cambios })
        .expect(200);
      await prisma.producto.update({
        where: { id: p.id },
        data: { estado: 'PUBLICADO' },
      });
      await editar(p, cambios, admin, key).expect(409);
    });
    it('dos solicitudes iguales concurrentes producen una sola versión', async () => {
      const p = await publicado(),
        key = randomUUID();
      const [a, b] = await Promise.all([
        editar(p, { precio: '120.00' }, admin, key),
        editar(p, { precio: '120.00' }, admin, key),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body).toEqual(b.body);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(p.version + 1);
    });
    it('la clave global protege la carrera entre productos diferentes', async () => {
      const p = await publicado(),
        q = await publicado(),
        key = randomUUID();
      const r = await Promise.all([
        editar(p, { precio: '120.00' }, admin, key),
        editar(q, { precio: '120.00' }, otro, key),
      ]);
      expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect(
        await prisma.operacionProducto.count({
          where: { claveSolicitud: key },
        }),
      ).toBe(1);
    });
    it('revierte la ficha si falla la auditoría', async () => {
      const p = await publicado(),
        key = randomUUID();
      const ext = prisma.$extends({
        query: {
          operacionProducto: {
            create() {
              throw Error('Fallo sintético de auditoría');
            },
          },
        },
      }) as unknown as PrismaService;
      const archivos = new ArchivosProductoService(
        ext,
        new EscrituraAutorizadaService(ext, auth),
        app.get(CloudinaryService),
        cloud,
        new PrepararFotografiaService(),
      );
      const antes = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      await expect(
        new PublicadosProductoService(archivos).actualizar(
          p.id,
          { claveSolicitud: key, version: p.version, precio: '120.00' },
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
    it('observa una revocación mientras espera el producto', async () => {
      const p = await publicado(),
        cuenta = await acceso('ADMIN');
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
      const llamada = editar(p, { nombre: 'Nombre' }, cuenta).then((r) => r);
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
      expect((await llamada).status).toBe(401);
    });
    it('relee una marca desactivada mientras esperaba el bloqueo compartido', async () => {
      const p = await publicado();
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
      const llamada = editar(p).then((r) => r);
      try {
        await esperarBloqueo('marcas');
      } finally {
        abrir();
        await bloqueo;
      }
      try {
        expect((await llamada).status).toBe(422);
      } finally {
        await prisma.marca.update({
          where: { id: marcaId },
          data: { activa: true },
        });
      }
    });
    it('dos administradores con la misma versión no sobrescriben el primer cambio', async () => {
      const p = await publicado();
      const r = await Promise.all([
        editar(p, { precio: '120.00' }),
        editar(p, { precio: '130.00' }, otro),
      ]);
      expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    });
    it('coordina edición comercial con archivo y con guardado de galería', async () => {
      const p = await publicado();
      const r = await Promise.all([
        editar(p),
        post(
          `/api/admin/productos/${p.id}/archivo`,
          { claveSolicitud: randomUUID(), version: p.version },
          otro,
        ),
      ]);
      expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
      const q = await publicado();
      const s = await Promise.all([
        editar(q),
        gal(
          q,
          [{ archivoId: q.archivoId, textoAlternativo: 'Portada corregida' }],
          otro,
        ),
      ]);
      expect(s.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    });
    it('cargar en publicado crea otro recurso sin cambiar la galería pública ni la versión', async () => {
      const p = await publicado(),
        antes = await prisma.imagenProducto.findMany({
          where: { productoId: p.id },
        });
      const carpeta = (
        await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })
      ).carpetaImagenes;
      const a = await cargar(p).expect(201);
      expect(a.body.archivo.id).not.toBe(p.archivoId);
      expect(
        await prisma.imagenProducto.findMany({ where: { productoId: p.id } }),
      ).toEqual(antes);
      const actual = await prisma.producto.findUniqueOrThrow({
        where: { id: p.id },
      });
      expect(actual.version).toBe(p.version);
      expect(actual.estado).toBe('PUBLICADO');
      expect(actual.carpetaImagenes).toBe(carpeta);
    });
    it('guarda portada, orden y texto alternativo conservando el estado publicado', async () => {
      const p = await publicado(),
        nueva = (await cargar(p).expect(201)).body.archivo.id as string;
      const r = await gal(p, [
        { archivoId: nueva, textoAlternativo: 'Nueva portada' },
        { archivoId: p.archivoId, textoAlternativo: 'Vista anterior' },
      ]).expect(200);
      expect(r.body.producto.estado).toBe('publicado');
      expect(r.body.producto.version).toBe(p.version + 1);
      expect(r.body.galeria[0]).toMatchObject({
        archivoId: nueva,
        textoAlternativo: 'Nueva portada',
        orden: 0,
      });
      const pub = await request(app.getHttpServer())
        .get('/api/productos/' + p.slug)
        .expect(200);
      expect(JSON.stringify(pub.body)).toContain(r.body.galeria[0].ruta);
    });
    it('rechaza retirar la última fotografía y revierte filas y limpieza programada', async () => {
      const p = await publicado(),
        key = randomUUID();
      const antes = await prisma.imagenProducto.findMany({
        where: { productoId: p.id },
      });
      const archivo = await prisma.archivoImagen.findUniqueOrThrow({
        where: { id: p.archivoId },
      });
      const r = await gal(p, [], admin, key).expect(422);
      expect(r.body.codigo).toBe('PRODUCTO_NO_PUBLICABLE');
      expect(
        await prisma.imagenProducto.findMany({ where: { productoId: p.id } }),
      ).toEqual(antes);
      expect(
        await prisma.archivoImagen.findUniqueOrThrow({
          where: { id: p.archivoId },
        }),
      ).toEqual(archivo);
      expect(
        await prisma.operacionProducto.count({
          where: { claveSolicitud: key },
        }),
      ).toBe(0);
    });
    it('admite ocho imágenes y rechaza nueve, archivos ajenos y repetidos', async () => {
      const p = await publicado(),
        ids = [p.archivoId];
      for (let i = 0; i < 7; i++)
        ids.push((await cargar(p).expect(201)).body.archivo.id as string);
      const r = await gal(
        p,
        ids.map((archivoId) => ({ archivoId })),
      ).expect(200);
      const q = r.body.producto as Ficha;
      await gal(
        q,
        [...ids, randomUUID()].map((archivoId) => ({ archivoId })),
      ).expect(400);
      await gal(q, [{ archivoId: ids[0] }, { archivoId: ids[0] }]).expect(400);
      const ajeno = await publicado();
      await gal(q, [{ archivoId: ajeno.archivoId }]).expect(404);
    });
    it('rechaza asociar un archivo no disponible y revalida el producto entero para guardar galería', async () => {
      const p = await publicado(),
        id = (await cargar(p).expect(201)).body.archivo.id as string;
      await prisma.archivoImagen.update({
        where: { id },
        data: { estado: 'ELIMINADO', eliminadoEn: new Date() },
      });
      await gal(p, [{ archivoId: id }]).expect(409);
      await prisma.marca.update({
        where: { id: marcaId },
        data: { activa: false },
      });
      try {
        await gal(p, [
          { archivoId: p.archivoId, textoAlternativo: 'Texto cambiado' },
        ]).expect(422);
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
    it('recupera la galería confirmada después de perder la respuesta y archivar', async () => {
      const p = await publicado(),
        key = randomUUID(),
        imagenes = [
          { archivoId: p.archivoId, textoAlternativo: 'Cambio confirmado' },
        ];
      perderClave = key;
      await gal(p, imagenes, admin, key).expect(503);
      const r = await admin.cliente
        .get('/api/admin/productos/operaciones/' + key)
        .expect(200);
      await post(`/api/admin/productos/${p.id}/archivo`, {
        claveSolicitud: randomUUID(),
        version: p.version + 1,
      }).expect(200);
      expect((await gal(p, imagenes, admin, key).expect(200)).body).toEqual(
        r.body,
      );
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .estado,
      ).toBe('ARCHIVADO');
    });
    it('una carga iniciada puede terminar tras archivar sin asociar ni publicar la fotografía', async () => {
      const p = await publicado(),
        key = randomUUID();
      let abrir!: () => void, inicio!: () => void;
      const espera = new Promise<void>((r) => (abrir = r)),
        entrada = new Promise<void>((r) => (inicio = r));
      proveedor.subidaEnEspera = async () => {
        inicio();
        await espera;
      };
      const carga = cargar(p, key).then((r) => r);
      await entrada;
      try {
        await post(`/api/admin/productos/${p.id}/archivo`, {
          claveSolicitud: randomUUID(),
          version: p.version,
        }).expect(200);
      } finally {
        proveedor.subidaEnEspera = undefined;
        abrir();
      }
      const r = await carga;
      expect(r.status, r.text).toBe(201);
      expect((await cargar(p, key).expect(201)).body.archivo.id).toBe(
        r.body.archivo.id,
      );
      await cargar({ ...p, version: p.version + 1 }).expect(409);
      await gal({ ...p, version: p.version + 1 }, [
        { archivoId: r.body.archivo.id },
      ]).expect(409);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .estado,
      ).toBe('ARCHIVADO');
      expect(
        (
          await prisma.imagenProducto.findFirstOrThrow({
            where: { productoId: p.id },
          })
        ).archivoId,
      ).toBe(p.archivoId);
    });
    it.each(['PENDIENTE', 'APROBADO'])(
      'mantiene datos e importes históricos y los 23 conjuntos protegidos al editar y cambiar portada con pago %s',
      async (estadoPago) => {
        const p = await publicado();
        const compra = await post(
          '/api/pedidos',
          await datosPedido(p.variantes[0].sku, '100.00', 2),
          cliente,
        ).expect(201);
        const nueva = (await cargar(p).expect(201)).body.archivo.id as string;
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
        const antes = await protegidos();
        const r = await editar(p, {
          nombre: 'Nombre actual distinto',
          precio: '125.00',
        }).expect(200);
        await gal(r.body.producto as Ficha, [{ archivoId: nueva }]).expect(200);
        expect(await protegidos()).toEqual(antes);
        const articulo = await prisma.pedidoArticulo.findFirstOrThrow({
          where: { pedido: { codigo: compra.body.pedido.codigo } },
        });
        expect(articulo.precioUnitario.toFixed(2)).toBe('100.00');
        expect(articulo.archivoImagenId).toBe(p.archivoId);
        const archivo = await prisma.archivoImagen.update({
          where: { id: p.archivoId },
          data: { limpiarDesde: new Date(Date.now() - 1000) },
        });
        const n = proveedor.peticiones.borrados;
        expect(
          await app.get(MantenimientoFotografiasService).limpiar(archivo),
        ).toBe(false);
        expect(proveedor.peticiones.borrados).toBe(n);
      },
    );
    it('precio frente a checkout conserva condiciones anteriores o pide actualizar sin sobreventa', async () => {
      const p = await publicado(),
        cuerpo = await datosPedido(p.variantes[0].sku, '100.00', 1);
      const [r, c] = await Promise.all([
        editar(p, { precio: '120.00' }),
        post('/api/pedidos', cuerpo, cliente),
      ]);
      expect(r.status, r.text).toBe(200);
      expect([201, 409], c.text).toContain(c.status);
      if (c.status === 201) {
        const a = await prisma.pedidoArticulo.findFirstOrThrow({
          where: { pedido: { codigo: c.body.pedido.codigo } },
        });
        expect(a.precioUnitario.toFixed(2)).toBe('100.00');
      }
      await post(
        '/api/pedidos',
        await datosPedido(p.variantes[0].sku, '100.00', 1),
        cliente,
      ).expect(409);
      await post(
        '/api/pedidos',
        await datosPedido(p.variantes[0].sku, '120.00', 1),
        cliente,
      ).expect(201);
      const v = await prisma.variante.findUniqueOrThrow({
        where: { id: p.variantes[0].id },
      });
      expect(v.existencias).toBe(10);
      expect(v.cantidadReservada).toBe(c.status === 201 ? 2 : 1);
    });
    it('portada frente a checkout guarda una referencia coherente y protegida', async () => {
      const p = await publicado(),
        nuevo = (await cargar(p).expect(201)).body.archivo.id as string;
      const [r, c] = await Promise.all([
        gal(p, [{ archivoId: nuevo }]),
        post(
          '/api/pedidos',
          await datosPedido(p.variantes[0].sku, '100.00', 1),
          cliente,
        ),
      ]);
      expect(r.status, r.text).toBe(200);
      expect(c.status, c.text).toBe(201);
      const a = await prisma.pedidoArticulo.findFirstOrThrow({
        where: { pedido: { codigo: c.body.pedido.codigo } },
      });
      expect([p.archivoId, nuevo]).toContain(a.archivoImagenId);
      const f = await prisma.archivoImagen.findUniqueOrThrow({
        where: { id: a.archivoImagenId! },
      });
      expect(a.imagen).toBe(f.urlEntrega);
      const paraLimpiar = await prisma.archivoImagen.update({
        where: { id: f.id },
        data: { limpiarDesde: new Date(Date.now() - 1000) },
      });
      expect(
        await app.get(MantenimientoFotografiasService).limpiar(paraLimpiar),
      ).toBe(false);
    });
    it('asociar una fotografía frente a limpieza nunca deja la galería con un archivo borrado', async () => {
      const p = await publicado(),
        id = (await cargar(p).expect(201)).body.archivo.id as string;
      const f = await prisma.archivoImagen.update({
        where: { id },
        data: { limpiarDesde: new Date(Date.now() - 1000) },
      });
      const [r, limpiado] = await Promise.all([
        gal(p, [{ archivoId: id }]),
        app.get(MantenimientoFotografiasService).limpiar(f),
      ]);
      if (r.status === 200) {
        expect(limpiado).toBe(false);
        expect(
          (await prisma.archivoImagen.findUniqueOrThrow({ where: { id } }))
            .estado,
        ).toBe('DISPONIBLE');
      } else {
        expect([404, 409]).toContain(r.status);
        expect(limpiado).toBe(true);
        expect(
          (
            await prisma.imagenProducto.findFirstOrThrow({
              where: { productoId: p.id },
            })
          ).archivoId,
        ).toBe(p.archivoId);
      }
    });
  },
);
