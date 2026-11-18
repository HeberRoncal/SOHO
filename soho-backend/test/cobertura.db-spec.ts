import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { Prisma } from '../src/generated/prisma/client.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Cobertura requiere TEST_DATABASE_URL exclusiva con sufijo _test.',
  );
const prisma = crearClientePrisma(url);
const ruta = '/api/admin/cobertura',
  publica = '/api/cobertura',
  origen = 'http://localhost:4200';
const prefijo = `cobertura-${Date.now()}`,
  clave = 'contraseña sintética de cobertura';
describe.sequential('Cobertura con API y MySQL aislado', () => {
  let app: INestApplication, claveHash: string;
  const usuarios: string[] = [];
  type Respuesta = {
    version: string;
    zonas: Array<{
      codigo: string;
      tarifa: string | null;
      plazo: string | null;
      habilitada: boolean;
      nombre: string;
      orden: number;
    }>;
  };
  const crear = async (rol: 'ADMIN' | 'CLIENTE' = 'ADMIN') => {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Ana',
        apellidos: 'Cobertura',
        correo: `${prefijo}-${usuarios.length}@cobertura.test`,
        claveHash,
        rol,
      },
    });
    usuarios.push(usuario.id);
    const cliente = request.agent(app.getHttpServer());
    const proteccion = await cliente.get('/api/auth/csrf').expect(200);
    const acceso = await cliente
      .post('/api/auth/login')
      .set('Origin', origen)
      .set('X-CSRF-Token', proteccion.body.csrfToken as string)
      .send({ correo: usuario.correo, clave })
      .expect(200);
    return { usuario, cliente, csrf: acceso.body.csrfToken as string };
  };
  type Navegador = Awaited<ReturnType<typeof crear>>;
  const leer = async (n: Navegador): Promise<Respuesta> =>
    (await n.cliente.get(ruta).expect(200)).body as Respuesta;
  const cuerpo = (r: Respuesta) => ({
    version: r.version,
    zonas: r.zonas.map((z) => ({
      codigo: z.codigo,
      tarifa: z.tarifa,
      plazo: z.plazo,
      habilitada: z.habilitada,
    })),
  });
  const guardar = (n: Navegador, datos: object) =>
    n.cliente
      .patch(ruta)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send(datos);
  const deshabilitarTrujillo = async (n: Navegador) => {
    const cambio = cuerpo(await leer(n));
    cambio.zonas[1].habilitada = false;
    await guardar(n, cambio).expect(200);
    return leer(n);
  };
  const iniciales = () =>
    prisma.zonaEntrega.findMany({ orderBy: { codigo: 'asc' } });
  let originales: Awaited<ReturnType<typeof iniciales>>;
  beforeAll(async () => {
    originales = await iniciales();
    if (originales.length !== 7)
      throw Error('La base de prueba debe tener las siete zonas migradas.');
    claveHash = await new ClavesService().crear(clave);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({}))
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    for (const z of originales)
      await prisma.zonaEntrega.update({
        where: { id: z.id },
        data: {
          tarifa: z.tarifa,
          plazo: z.plazo,
          habilitada: z.habilitada,
          actualizadoEn: z.actualizadoEn,
        },
      });
  });
  afterAll(async () => {
    await app?.close();
    await prisma.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });
  it('ofrece el listado y la cotización gratuita sin sesión y no filtra datos internos', async () => {
    const r = await request(app.getHttpServer()).get(publica).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.zonas).toHaveLength(7);
    expect(r.body.zonas[0]).toEqual({
      codigo: 'la-esperanza',
      nombre: 'La Esperanza',
      tarifa: '0.00',
      plazo: null,
      habilitada: true,
      orden: 0,
      cotizable: true,
    });
    expect(r.body.zonas[1]).toMatchObject({ tarifa: null, cotizable: false });
    const cotizacion = await request(app.getHttpServer())
      .get(`${publica}/la-esperanza/cotizacion`)
      .expect(200);
    expect(cotizacion.body).toEqual({
      cotizacion: {
        distrito: 'la-esperanza',
        nombreDistrito: 'La Esperanza',
        costo: '0.00',
        plazo: null,
        moneda: 'PEN',
      },
    });
    expect(JSON.stringify(r.body)).not.toMatch(
      /actualizadoEn|creadoEn|"id"|version/,
    );
  });
  it('distingue tarifa pendiente, zona deshabilitada y código desconocido', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get(`${publica}/trujillo/cotizacion`)
          .expect(422)
      ).body.codigo,
    ).toBe('COBERTURA_TARIFA_PENDIENTE');
    expect(
      (
        await request(app.getHttpServer())
          .get(`${publica}/moche/cotizacion`)
          .expect(422)
      ).body.codigo,
    ).toBe('COBERTURA_DESHABILITADA');
    await request(app.getHttpServer())
      .get(`${publica}/desconocido/cotizacion`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${publica}/Trujillo/cotizacion`)
      .expect(400);
  });
  it('exige ADMIN y rechaza clientes y sesiones desactivadas', async () => {
    await request(app.getHttpServer()).get(ruta).expect(401);
    await request(app.getHttpServer()).patch(ruta).send({}).expect(401);
    const cliente = await crear('CLIENTE');
    await cliente.cliente.get(ruta).expect(403);
    await guardar(cliente, {}).expect(403);
    const admin = await crear();
    await prisma.usuario.update({
      where: { id: admin.usuario.id },
      data: { activo: false },
    });
    await admin.cliente.get(ruta).expect(401);
  });
  it('guarda tarifas y plazos en conjunto, conserva los distritos y actualiza la cotización pública', async () => {
    const n = await crear(),
      antes = await deshabilitarTrujillo(n),
      cambio = cuerpo(antes);
    Object.assign(cambio.zonas[1], {
      tarifa: '7.25',
      plazo: '  Dos días hábiles  ',
    });
    const r = await guardar(n, cambio).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.version).not.toBe(antes.version);
    expect((await leer(n)).zonas[1]).toMatchObject({
      codigo: 'trujillo',
      tarifa: '7.25',
      plazo: 'Dos días hábiles',
    });
    const habilitar = cuerpo(await leer(n));
    habilitar.zonas[1].habilitada = true;
    await guardar(n, habilitar).expect(200);
    expect(
      (
        await request(app.getHttpServer())
          .get(`${publica}/trujillo/cotizacion`)
          .expect(200)
      ).body.cotizacion.costo,
    ).toBe('7.25');
    const despues = await iniciales();
    expect(despues.map((z) => [z.id, z.codigo, z.nombre, z.orden])).toEqual(
      originales.map((z) => [z.id, z.codigo, z.nombre, z.orden]),
    );
  });
  it('permite mantener una tarifa pendiente y deshabilitar una zona con tarifa definida', async () => {
    const n = await crear(),
      cambio = cuerpo(await deshabilitarTrujillo(n));
    Object.assign(cambio.zonas[1], { tarifa: '8.00', habilitada: false });
    await guardar(n, cambio).expect(200);
    await request(app.getHttpServer())
      .get(`${publica}/trujillo/cotizacion`)
      .expect(422);
    expect((await leer(n)).zonas[2].tarifa).toBeNull();
  });
  it('rechaza datos inválidos sin guardar parcialmente las demás zonas', async () => {
    const n = await crear(),
      antes = await iniciales(),
      cambio = cuerpo(await leer(n));
    cambio.zonas[1].tarifa = '7.25';
    cambio.zonas[2].tarifa = '5.123';
    await guardar(n, cambio).expect(400);
    expect(await iniciales()).toEqual(antes);
    cambio.zonas[2].tarifa = null;
    cambio.zonas[0].tarifa = '1.00';
    await guardar(n, cambio).expect(400);
    expect(await iniciales()).toEqual(antes);
  });
  it('rechaza cambios de identidad o listas incompletas y códigos desconocidos', async () => {
    const n = await crear(),
      cambio = cuerpo(await leer(n));
    await guardar(n, { ...cambio, rol: 'ADMIN' }).expect(400);
    await guardar(n, { ...cambio, zonas: cambio.zonas.slice(1) }).expect(400);
    await guardar(n, {
      ...cambio,
      zonas: cambio.zonas.map((z, i) =>
        i === 1 ? { ...z, nombre: 'Otra' } : z,
      ),
    }).expect(400);
    cambio.zonas[1].codigo = 'otro-distrito';
    await guardar(n, cambio).expect(400);
  });
  it('exige CSRF, JSON y origen permitido antes de cambiar datos', async () => {
    const n = await crear(),
      cambio = cuerpo(await leer(n)),
      antes = await iniciales();
    await n.cliente.patch(ruta).set('Origin', origen).send(cambio).expect(403);
    await n.cliente
      .patch(ruta)
      .set('Origin', 'https://ajeno.test')
      .set('X-CSRF-Token', n.csrf)
      .send(cambio)
      .expect(403);
    await n.cliente
      .patch(ruta)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .type('form')
      .send({ version: cambio.version })
      .expect(415);
    expect(await iniciales()).toEqual(antes);
  });
  it('devuelve 409 al guardar una versión anterior y conserva el cambio confirmado', async () => {
    const n = await crear(),
      deshabilitada = await deshabilitarTrujillo(n),
      antiguo = cuerpo(deshabilitada),
      vigente = cuerpo(await leer(n));
    vigente.zonas[1].tarifa = '9.00';
    await guardar(n, vigente).expect(200);
    antiguo.zonas[1].tarifa = '6.00';
    await guardar(n, antiguo).expect(409);
    expect((await leer(n)).zonas[1].tarifa).toBe('9.00');
  });
  it('serializa dos guardados concurrentes y solo acepta uno con la misma versión', async () => {
    const uno = await crear(),
      dos = await crear(),
      a = cuerpo(await deshabilitarTrujillo(uno)),
      b = cuerpo(await leer(dos));
    a.zonas[1].tarifa = '7.25';
    b.zonas[1].tarifa = '8.50';
    const resultados = await Promise.all([guardar(uno, a), guardar(dos, b)]);
    expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(['7.25', '8.50']).toContain((await leer(uno)).zonas[1].tarifa);
  });
  it('oculta errores de persistencia en rutas públicas', async () => {
    const buscar = vi
      .spyOn(prisma.zonaEntrega, 'findMany')
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(
          'SQL privado mysql://secreto',
          { code: 'P1001', clientVersion: '7.10.1' },
        ),
      );
    try {
      const r = await request(app.getHttpServer()).get(publica).expect(503);
      expect(JSON.stringify(r.body)).not.toMatch(/SQL|mysql|secreto/);
    } finally {
      buscar.mockRestore();
    }
  });
});
