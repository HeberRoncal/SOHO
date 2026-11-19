import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
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
import { GaleriaProductoService } from '../src/productos/fotografias/galeria-producto.service.js';
import { MantenimientoFotografiasService } from '../src/productos/fotografias/mantenimiento-fotografias.service.js';
import { PrepararFotografiaService } from '../src/productos/fotografias/preparar-fotografia.service.js';
import { CloudinaryService } from '../src/productos/fotografias/cloudinary.service.js';
import { CloudinarySimulado } from './fotografias-proveedor.js';
import { datosPedido } from './pedidos-fixtures.js';

const url = process.env.TEST_FOTOGRAFIAS_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Fotografías requiere TEST_FOTOGRAFIAS_DATABASE_URL exclusiva, migrada y vacía con sufijo _test.',
  );
const prisma = crearClientePrisma(url),
  proveedor = new CloudinarySimulado(),
  configAuth = crearConfiguracionAuth({});
const config = new ConfiguracionCloudinary({
  CLOUDINARY_CLOUD_NAME: 'sintetico',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'secreto-sintetico',
  NODE_ENV: 'test',
});
const origen = 'http://localhost:4200',
  clave = 'Clave sintética fotografías 2026';
type Cuenta = {
  cliente: ReturnType<typeof request.agent>;
  csrf: string;
  usuarioId: string;
};
let app: INestApplication,
  privado: string,
  admin: Cuenta,
  otro: Cuenta,
  cliente: Cuenta,
  marcaId: string,
  categoriaId: string,
  png: Buffer,
  serie = 0;
let mantenimiento: MantenimientoFotografiasService,
  archivos: ArchivosProductoService;
let perderClaveGaleria: string | undefined;
async function acceso(rol: 'ADMIN' | 'CLIENTE'): Promise<Cuenta> {
  const u = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Fotografías',
      correo: randomUUID() + '@fotos.test',
      rol,
      claveHash: await new ClavesService().crear(clave),
    },
  });
  const agente = request.agent(app.getHttpServer()),
    csrf = (await agente.get('/api/auth/csrf').expect(200)).body
      .csrfToken as string;
  const login = await agente
    .post('/api/auth/login')
    .set('Origin', origen)
    .set('X-CSRF-Token', csrf)
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
      apellidos: 'Fotos',
      correo: 'sintetico@fotos.test',
      rol: 'ADMIN',
      correoVerificado: false,
    },
  };
}
async function borrador() {
  serie++;
  const r = await admin.cliente
    .post('/api/admin/productos')
    .set('Origin', origen)
    .set('X-CSRF-Token', admin.csrf)
    .send({
      claveSolicitud: randomUUID(),
      nombre: 'Modelo fotos ' + serie,
      grupoModelo: {
        marcaId,
        codigoModelo: 'FOTOS' + serie,
        modelo: 'Modelo fotos ' + serie,
      },
      color: { codigo: 'BL', nombre: 'Blanco', hexadecimal: '#FFFFFF' },
      categoriaId,
      precio: '100.00',
      tallas: ['40'],
    })
    .expect(201);
  return r.body.producto as {
    id: string;
    version: number;
    codigoInterno: string;
    slug: string;
    variantes: Array<{ id: string; sku: string }>;
  };
}
function carga(
  id: string,
  version = 1,
  claveCarga = randomUUID(),
  cuenta = admin,
  buffer = png,
  nombre = 'frontal.png',
  tipo = 'image/png',
) {
  return cuenta.cliente
    .post('/api/admin/productos/' + id + '/fotografias')
    .set('Origin', origen)
    .set('X-CSRF-Token', cuenta.csrf)
    .field('datos', JSON.stringify({ claveCarga, version }))
    .attach('archivo', buffer, { filename: nombre, contentType: tipo });
}
function galeria(
  id: string,
  version: number,
  imagenes: Array<{ archivoId: string; textoAlternativo?: string }>,
  claveSolicitud = randomUUID(),
  cuenta = admin,
) {
  return cuenta.cliente
    .patch('/api/admin/productos/' + id + '/galeria')
    .set('Origin', origen)
    .set('X-CSRF-Token', cuenta.csrf)
    .send({ claveSolicitud, version, imagenes });
}
async function vencida(
  id: string,
  campo: 'limpiarDesde' | 'proximaRevisionEn' = 'proximaRevisionEn',
) {
  return prisma.archivoImagen.update({
    where: { id },
    data: { [campo]: new Date(Date.now() - 1000) },
  });
}
describe.sequential(
  'Fotografías con HTTP, MySQL exclusivo y REST externo simulado',
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
      categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
      privado = await mkdtemp(path.join(tmpdir(), 'soho-fotografias-test-'));
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(CONFIGURACION_AUTH)
        .useValue(configAuth)
        .overrideProvider(ConfiguracionCloudinary)
        .useValue(config)
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
              req.path.endsWith('/galeria') &&
              req.body?.claveSolicitud === perderClaveGaleria &&
              res.statusCode === 200
            ) {
              perderClaveGaleria = undefined;
              res.destroy();
              return res;
            }
            return json(body);
          };
          next();
        },
      );
      await app.init();
      mantenimiento = app.get(MantenimientoFotografiasService);
      archivos = app.get(ArchivosProductoService);
      admin = await acceso('ADMIN');
      otro = await acceso('ADMIN');
      cliente = await acceso('CLIENTE');
      png = await sharp({
        create: { width: 16, height: 12, channels: 3, background: '#ffffff' },
      })
        .png()
        .toBuffer();
    });
    afterEach(() => {
      proveedor.falloSubida = null;
      proveedor.falloBorrado = false;
      proveedor.contenidoIncorrecto = false;
      proveedor.subidaEnEspera = undefined;
      proveedor.borradoEnEspera = undefined;
      proveedor.busquedaEnEspera = undefined;
    });
    afterAll(async () => {
      await app?.close();
      await prisma.$disconnect();
      if (privado) {
        const objetivo = await realpath(privado),
          raiz = await realpath(tmpdir());
        expect(
          objetivo.startsWith(raiz + path.sep) &&
            path.basename(objetivo).startsWith('soho-fotografias-test-'),
        ).toBe(true);
        await rm(objetivo, { recursive: true, force: true });
      }
    });

    it('informa capacidades sin exponer credenciales', async () => {
      const r = await admin.cliente
        .get('/api/admin/productos/fotografias/configuracion')
        .expect(200);
      expect(r.body).toMatchObject({
        configurada: true,
        modoCarpetas: 'dynamic',
        maximoImagenes: 10,
      });
      expect(r.text).not.toContain('secreto-sintetico');
      expect(r.text).not.toContain('apiKey');
    });
    it('sube binario real, verifica contenido y reserva una carpeta sin modificar la galería', async () => {
      const p = await borrador(),
        antes = await prisma.variante.findMany({ where: { productoId: p.id } });
      const r = await carga(p.id).expect(201),
        a = await prisma.archivoImagen.findUniqueOrThrow({
          where: { id: r.body.archivo.id },
        });
      expect(r.body.archivo).toMatchObject({
        estado: 'DISPONIBLE',
        proveedor: 'CLOUDINARY',
        ancho: 16,
        alto: 12,
        versionCloudinary: '1700000000',
      });
      expect(a.carpetaCloudinary).toBe(
        'SOHO/productos/nike-modelo-fotos-' +
          serie +
          '/' +
          p.codigoInterno +
          '-blanco',
      );
      expect(a.publicId).toBe('soho-' + a.id);
      expect(a.creadoPorId).toBe(admin.usuarioId);
      expect(a.limpiarDesde!.getTime()).toBeGreaterThan(Date.now());
      expect(a.tokenCarga).toBeNull();
      expect(
        await prisma.imagenProducto.count({ where: { productoId: p.id } }),
      ).toBe(0);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(1);
      expect(
        await prisma.variante.findMany({ where: { productoId: p.id } }),
      ).toEqual(antes);
    });
    it('repite la carga con la misma clave sin otra petición de subida y la recupera por clave', async () => {
      const p = await borrador(),
        claveCarga = randomUUID(),
        n = proveedor.peticiones.subidas;
      const r = await carga(p.id, 1, claveCarga).expect(201);
      const repetida = await carga(p.id, 1, claveCarga).expect(201);
      expect(repetida.body).toEqual(r.body);
      expect(proveedor.peticiones.subidas).toBe(n + 1);
      expect(
        (
          await admin.cliente
            .get('/api/admin/productos/' + p.id + '/cargas/' + claveCarga)
            .expect(200)
        ).body,
      ).toEqual(r.body);
    });
    it('vincula la clave a producto, contenido y administrador', async () => {
      const p = await borrador(),
        otroP = await borrador(),
        key = randomUUID();
      await carga(p.id, 1, key).expect(201);
      await carga(p.id, 1, key, otro).expect(409);
      await carga(otroP.id, 1, key).expect(409);
      await carga(p.id, 1, key, admin, png, 'otro-nombre.png').expect(409);
      await otro.cliente
        .get('/api/admin/productos/' + p.id + '/cargas/' + key)
        .expect(404);
    });
    it('dos intentos concurrentes de una clave producen una sola subida', async () => {
      const p = await borrador(),
        key = randomUUID(),
        n = proveedor.peticiones.subidas;
      const [a, b] = await Promise.all([
        carga(p.id, 1, key),
        carga(p.id, 1, key),
      ]);
      expect([a.status, b.status].every((s) => s === 201 || s === 202)).toBe(
        true,
      );
      expect(a.body.archivo.id).toBe(b.body.archivo.id);
      expect(proveedor.peticiones.subidas).toBe(n + 1);
    });
    it('rechaza versión antigua, producto incompleto y producto archivado antes de subir', async () => {
      const p = await borrador(),
        n = proveedor.peticiones.subidas;
      await carga(p.id, 2).expect(409);
      const minimo = await admin.cliente
        .post('/api/admin/productos')
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send({ claveSolicitud: randomUUID(), nombre: 'Sin identidad' })
        .expect(201);
      await carga(minimo.body.producto.id).expect(422);
      await prisma.producto.update({
        where: { id: p.id },
        data: { estado: 'ARCHIVADO' },
      });
      await carga(p.id).expect(409);
      expect(proveedor.peticiones.subidas).toBe(n);
    });
    it('rechaza archivos falsos, MIME falso, campos extra y tamaño excesivo sin filas pendientes', async () => {
      const p = await borrador(),
        n = await prisma.archivoImagen.count();
      await carga(
        p.id,
        1,
        randomUUID(),
        admin,
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        'foto.svg',
        'image/svg+xml',
      ).expect(400);
      await carga(
        p.id,
        1,
        randomUUID(),
        admin,
        png,
        'foto.jpg',
        'image/jpeg',
      ).expect(400);
      await carga(
        p.id,
        1,
        randomUUID(),
        admin,
        Buffer.alloc(5242881),
        'grande.png',
      ).expect(413);
      await admin.cliente
        .post('/api/admin/productos/' + p.id + '/fotografias')
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .field(
          'datos',
          JSON.stringify({
            claveCarga: randomUUID(),
            version: 1,
            url: 'https://otra.example',
          }),
        )
        .attach('archivo', png, 'frontal.png')
        .expect(400);
      expect(await prisma.archivoImagen.count()).toBe(n);
    });
    it('protege la carga con sesión, ADMIN y CSRF antes de decodificar', async () => {
      const p = await borrador(),
        n = proveedor.peticiones.subidas;
      await request(app.getHttpServer())
        .post('/api/admin/productos/' + p.id + '/fotografias')
        .expect(401);
      await carga(p.id, 1, randomUUID(), cliente).expect(403);
      await admin.cliente
        .post('/api/admin/productos/' + p.id + '/fotografias')
        .set('Origin', origen)
        .attach('archivo', png, 'frontal.png')
        .expect(403);
      expect(proveedor.peticiones.subidas).toBe(n);
    });
    it('concilia una respuesta externa perdida sin volver a subir', async () => {
      const p = await borrador(),
        n = proveedor.peticiones.subidas;
      proveedor.falloSubida = 'despues';
      const r = await carga(p.id).expect(202),
        a = await vencida(r.body.archivo.id);
      expect(r.body.archivo.estado).toBe('CONCILIANDO');
      expect(await mantenimiento.conciliar(a)).toBe(true);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('DISPONIBLE');
      expect(proveedor.peticiones.subidas).toBe(n + 1);
    });
    it('conserva la incertidumbre ante 404 y recupera una terminación tardía', async () => {
      const p = await borrador(),
        n = proveedor.peticiones.subidas;
      proveedor.falloSubida = 'antes';
      const r = await carga(p.id).expect(202),
        body = proveedor.respuestaPerdida!,
        a = await vencida(r.body.archivo.id);
      expect(await mantenimiento.conciliar(a)).toBe(false);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('CONCILIANDO');
      await proveedor.materializar(body);
      expect(await mantenimiento.conciliar(await vencida(a.id))).toBe(true);
      expect(proveedor.peticiones.subidas).toBe(n + 1);
    });
    it('no acepta contenido externo cambiado aunque su contexto coincida', async () => {
      const p = await borrador();
      proveedor.contenidoIncorrecto = true;
      const r = await carga(p.id).expect(202);
      expect(r.body.archivo.estado).toBe('CONCILIANDO');
      proveedor.contenidoIncorrecto = false;
      expect(
        await mantenimiento.conciliar(await vencida(r.body.archivo.id)),
      ).toBe(true);
    });
    it('coordina dos conciliadores con una reclamación y token', async () => {
      const p = await borrador();
      proveedor.falloSubida = 'despues';
      const r = await carga(p.id).expect(202),
        a = await vencida(r.body.archivo.id);
      let abrir!: () => void, listo!: () => void;
      const espera = new Promise<void>((resolve) => (abrir = resolve)),
        entrada = new Promise<void>((resolve) => (listo = resolve));
      proveedor.busquedaEnEspera = async () => {
        listo();
        await espera;
      };
      const primero = mantenimiento.conciliar(a);
      await entrada;
      try {
        expect(await mantenimiento.conciliar(a)).toBe(false);
      } finally {
        abrir();
      }
      expect(await primero).toBe(true);
    });
    it('no limpia ni vuelve a subir cargas pendientes por antigüedad', async () => {
      const p = await borrador();
      proveedor.falloSubida = 'antes';
      const r = await carga(p.id).expect(202),
        a = await vencida(r.body.archivo.id, 'limpiarDesde');
      const n = proveedor.peticiones.subidas,
        b = proveedor.peticiones.borrados;
      expect(await mantenimiento.limpiar(a)).toBe(false);
      await mantenimiento.conciliar(await vencida(a.id));
      expect(proveedor.peticiones.subidas).toBe(n);
      expect(proveedor.peticiones.borrados).toBe(b);
    });
    it('guarda portada, orden y texto alternativo con auditoría y una sola versión', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo,
        b = (await carga(p.id).expect(201)).body.archivo;
      const key = randomUUID(),
        r = await galeria(
          p.id,
          1,
          [
            { archivoId: b.id, textoAlternativo: 'Portada' },
            { archivoId: a.id, textoAlternativo: 'Lateral' },
          ],
          key,
        ).expect(200);
      expect(r.body.producto.version).toBe(2);
      expect(
        r.body.galeria.map((i: { archivoId: string }) => i.archivoId),
      ).toEqual([b.id, a.id]);
      expect(r.body.galeria[0]).toMatchObject({
        orden: 0,
        textoAlternativo: 'Portada',
      });
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .limpiarDesde,
      ).toBeNull();
      expect(
        await prisma.operacionProducto.findUniqueOrThrow({
          where: { claveSolicitud: key },
        }),
      ).toMatchObject({
        tipo: 'ACTUALIZAR_GALERIA',
        usuarioResponsableId: admin.usuarioId,
        versionAnterior: 1,
        versionPosterior: 2,
      });
      const consulta = await admin.cliente
        .get('/api/admin/productos/' + p.id + '/fotografias')
        .expect(200);
      expect(consulta.body.galeria).toHaveLength(2);
    });
    it('retira la asociación y concede plazo de limpieza sin eliminar la foto inmediatamente', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo,
        n = proveedor.peticiones.borrados;
      await galeria(p.id, 1, [{ archivoId: a.id }]).expect(200);
      await galeria(p.id, 2, []).expect(200);
      const fila = await prisma.archivoImagen.findUniqueOrThrow({
        where: { id: a.id },
      });
      expect(fila.estado).toBe('DISPONIBLE');
      expect(fila.limpiarDesde!.getTime()).toBeGreaterThan(Date.now());
      expect(proveedor.peticiones.borrados).toBe(n);
    });
    it('rechaza archivos ajenos, pendientes, repetidos y más de diez asociaciones', async () => {
      const p = await borrador(),
        otroP = await borrador(),
        a = (await carga(otroP.id).expect(201)).body.archivo;
      await galeria(p.id, 1, [{ archivoId: a.id }]).expect(404);
      proveedor.falloSubida = 'antes';
      const pendiente = (await carga(p.id).expect(202)).body.archivo;
      await galeria(p.id, 1, [{ archivoId: pendiente.id }]).expect(409);
      await galeria(p.id, 1, [
        { archivoId: pendiente.id },
        { archivoId: pendiente.id },
      ]).expect(400);
      await galeria(
        p.id,
        1,
        Array.from({ length: 11 }, () => ({ archivoId: randomUUID() })),
      ).expect(400);
    });
    it('recupera un guardado de galería sin respuesta y no pisa una edición posterior', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo,
        key = randomUUID(),
        imagenes = [{ archivoId: a.id }];
      perderClaveGaleria = key;
      await expect(galeria(p.id, 1, imagenes, key)).rejects.toThrow();
      const recuperada = await admin.cliente
        .get('/api/admin/productos/operaciones/' + key)
        .expect(200);
      await galeria(p.id, 2, []).expect(200);
      expect((await galeria(p.id, 1, imagenes, key).expect(200)).body).toEqual(
        recuperada.body,
      );
      expect(
        await prisma.imagenProducto.count({ where: { productoId: p.id } }),
      ).toBe(0);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(3);
    });
    it('resuelve dos guardados concurrentes y mantiene el ganador', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo;
      const [x, y] = await Promise.all([
        galeria(p.id, 1, [{ archivoId: a.id, textoAlternativo: 'Uno' }]),
        galeria(
          p.id,
          1,
          [{ archivoId: a.id, textoAlternativo: 'Dos' }],
          randomUUID(),
          otro,
        ),
      ]);
      expect([x.status, y.status].sort((a, b) => a - b)).toEqual([200, 409]);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(2);
    });
    it('conserva orden y versión si falla el registro final de auditoría', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo;
      await galeria(p.id, 1, [{ archivoId: a.id }]).expect(200);
      const antes = await prisma.imagenProducto.findMany({
          where: { productoId: p.id },
        }),
        extendido = prisma.$extends({
          query: {
            operacionProducto: {
              create() {
                throw Error('Fallo sintético de auditoría');
              },
            },
          },
        }) as unknown as PrismaService;
      const servicio = new GaleriaProductoService(
        new ArchivosProductoService(
          extendido,
          new EscrituraAutorizadaService(extendido, configAuth),
          app.get(CloudinaryService),
          config,
          new PrepararFotografiaService(),
        ),
      );
      await expect(
        servicio.actualizar(
          p.id,
          { claveSolicitud: randomUUID(), version: 2, imagenes: [] },
          await contexto(),
        ),
      ).rejects.toThrow('Fallo sintético');
      expect(
        await prisma.imagenProducto.findMany({ where: { productoId: p.id } }),
      ).toEqual(antes);
      expect(
        (await prisma.producto.findUniqueOrThrow({ where: { id: p.id } }))
          .version,
      ).toBe(2);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .limpiarDesde,
      ).toBeNull();
    });
    it('retira un huérfano confirmado por asset_id y confirma su desaparición', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo,
        n = proveedor.peticiones.borrados;
      expect(
        await mantenimiento.limpiar(await vencida(a.id, 'limpiarDesde')),
      ).toBe(true);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('ELIMINADO');
      expect(proveedor.peticiones.borrados).toBe(n + 1);
    });
    it('mantiene ELIMINANDO para reintento si falla el borrado externo', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo;
      proveedor.falloBorrado = true;
      expect(
        await mantenimiento.limpiar(await vencida(a.id, 'limpiarDesde')),
      ).toBe(false);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('ELIMINANDO');
      proveedor.falloBorrado = false;
      const fila = await prisma.archivoImagen.update({
        where: { id: a.id },
        data: { bloqueoLimpiezaHasta: new Date(Date.now() - 1000) },
      });
      expect(await mantenimiento.limpiar(fila)).toBe(true);
    });
    it('impide volver a asociar una fotografía mientras se elimina externamente', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo;
      let abrir!: () => void, listo!: () => void;
      const espera = new Promise<void>((resolve) => (abrir = resolve)),
        entrada = new Promise<void>((resolve) => (listo = resolve));
      proveedor.borradoEnEspera = async () => {
        listo();
        await espera;
      };
      const limpieza = mantenimiento.limpiar(
        await vencida(a.id, 'limpiarDesde'),
      );
      await entrada;
      try {
        await galeria(p.id, 1, [{ archivoId: a.id }]).expect(409);
      } finally {
        abrir();
      }
      expect(await limpieza).toBe(true);
      expect(
        await prisma.imagenProducto.count({ where: { archivoId: a.id } }),
      ).toBe(0);
    });
    it('resuelve la carrera entre asociar y reclamar limpieza sin referencias eliminadas', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo,
        fila = await vencida(a.id, 'limpiarDesde');
      const [guardado, limpiado] = await Promise.all([
        galeria(p.id, 1, [{ archivoId: a.id }]),
        mantenimiento.limpiar(fila),
      ]);
      const estado = (
        await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } })
      ).estado;
      if (guardado.status === 200) {
        expect(limpiado).toBe(false);
        expect(estado).toBe('DISPONIBLE');
      } else {
        expect(guardado.status).toBe(409);
        expect(limpiado).toBe(true);
        expect(estado).toBe('ELIMINADO');
      }
    });
    it('checkout referencia la foto disponible y la conserva al retirarla después de la galería', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo;
      await galeria(p.id, 1, [{ archivoId: a.id }]).expect(200);
      await prisma.producto.update({
        where: { id: p.id },
        data: { estado: 'PUBLICADO' },
      });
      await prisma.variante.update({
        where: { id: p.variantes[0].id },
        data: { existencias: 2 },
      });
      const invitado = request.agent(app.getHttpServer()),
        csrf = (await invitado.get('/api/auth/csrf').expect(200)).body
          .csrfToken as string,
        datos = await datosPedido(p.variantes[0].sku, '100.00', 1);
      const compra = invitado
        .post('/api/pedidos')
        .set('Origin', origen)
        .set('X-CSRF-Token', csrf)
        .set('X-Pedido-Acceso', randomBytes(32).toString('hex'))
        .send(datos)
        .then((r) => r);
      const [r, limpiado] = await Promise.all([
        compra,
        mantenimiento.limpiar(await vencida(a.id, 'limpiarDesde')),
      ]);
      expect(r.status, r.text).toBe(201);
      expect(limpiado).toBe(false);
      const articulo = await prisma.pedidoArticulo.findFirstOrThrow({
        where: { archivoImagenId: a.id },
      });
      expect(articulo.imagen).toBe(a.url);
      await prisma.producto.update({
        where: { id: p.id },
        data: { estado: 'BORRADOR' },
      });
      await galeria(p.id, 2, []).expect(200);
      const n = proveedor.peticiones.borrados;
      expect(
        await mantenimiento.limpiar(await vencida(a.id, 'limpiarDesde')),
      ).toBe(false);
      expect(proveedor.peticiones.borrados).toBe(n);
      expect(
        (
          await prisma.pedidoArticulo.findUniqueOrThrow({
            where: { id: articulo.id },
          })
        ).imagen,
      ).toBe(a.url);
    });
    it('conserva archivos heredados y evita que referencias bloqueadas frenen todo el lote', async () => {
      const legado = await prisma.archivoImagen.findFirstOrThrow({
          where: { proveedor: 'LEGADO' },
        }),
        n = proveedor.peticiones.borrados;
      expect(await mantenimiento.limpiar(legado)).toBe(false);
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo;
      await vencida(a.id, 'limpiarDesde');
      const r = await mantenimiento.procesarLote();
      expect(r.retiradas).toBeGreaterThan(0);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('ELIMINADO');
      expect(proveedor.peticiones.borrados).toBeGreaterThan(n);
    });
    it('recupera un borrado confirmado sin respuesta sin emitir otro DELETE', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo,
        n = proveedor.peticiones.borrados;
      proveedor.perderRespuestaBorrado = true;
      expect(
        await mantenimiento.limpiar(await vencida(a.id, 'limpiarDesde')),
      ).toBe(false);
      const fila = await prisma.archivoImagen.update({
        where: { id: a.id },
        data: { bloqueoLimpiezaHasta: new Date(Date.now() - 1000) },
      });
      expect(await mantenimiento.limpiar(fila)).toBe(true);
      expect(proveedor.peticiones.borrados).toBe(n + 1);
    });
    it('descarta una confirmación tardía cuyo token ya pertenece a otra revisión', async () => {
      const p = await borrador();
      proveedor.falloSubida = 'despues';
      const r = await carga(p.id).expect(202),
        token = randomUUID();
      const a = await prisma.archivoImagen.update({
          where: { id: r.body.archivo.id },
          data: {
            tokenCarga: token,
            bloqueoCargaHasta: new Date(Date.now() + 120000),
          },
        }),
        recurso = proveedor.recursos.get(a.publicId!)!.datos;
      await archivos.confirmar(a, randomUUID(), recurso);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('CONCILIANDO');
      await archivos.confirmar(a, token, recurso);
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } }))
          .estado,
      ).toBe('DISPONIBLE');
    });
    it('mantiene la carpeta reservada al corregir la etiqueta visible del color', async () => {
      const p = await borrador(),
        a = (await carga(p.id).expect(201)).body.archivo,
        carpeta = (
          await prisma.archivoImagen.findUniqueOrThrow({ where: { id: a.id } })
        ).carpetaCloudinary;
      await admin.cliente
        .patch('/api/admin/productos/' + p.id + '/borrador')
        .set('Origin', origen)
        .set('X-CSRF-Token', admin.csrf)
        .send({
          claveSolicitud: randomUUID(),
          version: 1,
          color: {
            codigo: 'BL',
            nombre: 'Blanco hueso',
            hexadecimal: '#FFFFEE',
          },
        })
        .expect(200);
      const b = (await carga(p.id, 2).expect(201)).body.archivo;
      expect(
        (await prisma.archivoImagen.findUniqueOrThrow({ where: { id: b.id } }))
          .carpetaCloudinary,
      ).toBe(carpeta);
    });
    it('admite diez asociaciones consecutivas con una sola portada', async () => {
      const p = await borrador(),
        imagenes: Array<{ archivoId: string }> = [];
      for (let i = 0; i < 10; i++)
        imagenes.push({
          archivoId: (await carga(p.id).expect(201)).body.archivo.id,
        });
      const r = await galeria(p.id, 1, imagenes).expect(200);
      expect(r.body.galeria.map((i: { orden: number }) => i.orden)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);
      expect(
        await prisma.imagenProducto.count({
          where: { productoId: p.id, orden: 0 },
        }),
      ).toBe(1);
    });
    it('revalida la sesión después de esperar el bloqueo antes de iniciar la subida', async () => {
      const cuenta = await acceso('ADMIN'),
        p = await borrador(),
        n = proveedor.peticiones.subidas,
        filas = await prisma.archivoImagen.count();
      let abrir!: () => void, listo!: () => void;
      const espera = new Promise<void>((resolve) => (abrir = resolve)),
        entrada = new Promise<void>((resolve) => (listo = resolve));
      const bloqueo = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM productos WHERE id=${p.id} FOR UPDATE`;
          listo();
          await espera;
        },
        { timeout: 20000 },
      );
      await entrada;
      const pendiente = carga(p.id, 1, randomUUID(), cuenta).then((r) => r);
      try {
        let esperando = false;
        for (let i = 0; i < 100; i++) {
          const [r] = await prisma.$queryRaw<
            Array<{ n: bigint }>
          >`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE d.OBJECT_SCHEMA=DATABASE() AND d.OBJECT_NAME='productos'`;
          if (Number(r.n) > 0) {
            esperando = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(esperando).toBe(true);
        await prisma.sesion.updateMany({
          where: { usuarioId: cuenta.usuarioId },
          data: { revocadaEn: new Date() },
        });
      } finally {
        abrir();
        await bloqueo;
      }
      expect((await pendiente).status).toBe(401);
      expect(proveedor.peticiones.subidas).toBe(n);
      expect(await prisma.archivoImagen.count()).toBe(filas);
    });
  },
);
