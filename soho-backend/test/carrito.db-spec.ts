import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CarritoModule } from '../src/carrito/carrito.module.js';
import { AutenticacionModule } from '../src/autenticacion/autenticacion.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { crearClientePrisma } from '../src/prisma/cliente-prisma.js';
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import {
  CONFIGURACION_AUTH,
  crearConfiguracionAuth,
} from '../src/autenticacion/seguridad/configuracion-auth.js';
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';

const url = process.env.TEST_CARRITO_DATABASE_URL;
if (
  !url ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
)
  throw Error(
    'Carrito exige TEST_CARRITO_DATABASE_URL local y exclusiva con sufijo _test.',
  );
const prisma = crearClientePrisma(url);
const origen = 'http://localhost:4200';
const clave = 'contraseña de prueba de carrito 2026';
const sku = 'NK-AF107-BL-40';
describe.sequential('Carrito MySQL y sesiones independientes', () => {
  let app: INestApplication;
  const usuarios: string[] = [];
  type Navegador = { cliente: ReturnType<typeof request.agent>; csrf: string };
  let a: Navegador, segundoDispositivo: Navegador, b: Navegador;
  async function acceder(correo: string): Promise<Navegador> {
    const cliente = request.agent(app.getHttpServer());
    const csrf = await cliente.get('/api/auth/csrf').expect(200);
    const login = await cliente
      .post('/api/auth/login')
      .set('Origin', origen)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ correo, clave })
      .expect(200);
    return { cliente, csrf: login.body.csrfToken };
  }
  const guardar = (n: Navegador, datos: object) =>
    n.cliente
      .put('/api/carrito')
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send(datos);
  const operacion = (version: number, cantidad = 1) => ({
    clave: randomUUID(),
    version,
    tipo: 'GUARDAR',
    articulos: [{ sku, cantidad }],
  });
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AutenticacionModule, CarritoModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({}))
      .overrideProvider(CorreosService)
      .useValue({ habilitado: () => false })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    const claveHash = await new ClavesService().crear(clave);
    const correos: string[] = [];
    for (let i = 0; i < 2; i++) {
      const usuario = await prisma.usuario.create({
        data: {
          nombres: 'Carrito',
          apellidos: 'Prueba',
          correo: `${randomUUID()}@carrito.test`,
          claveHash,
        },
      });
      usuarios.push(usuario.id);
      correos.push(usuario.correo);
    }
    a = await acceder(correos[0]);
    segundoDispositivo = await acceder(correos[0]);
    b = await acceder(correos[1]);
  });
  afterAll(async () => {
    await app?.close();
    await prisma.carritoUsuario.deleteMany({
      where: { usuarioId: { in: usuarios } },
    });
    await prisma.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });
  it('rechaza invitados y escrituras sin CSRF', async () => {
    await request(app.getHttpServer()).get('/api/carrito').expect(401);
    await a.cliente
      .put('/api/carrito')
      .set('Origin', origen)
      .send(operacion(0))
      .expect(403);
    await guardar(a, { ...operacion(0), usuarioId: usuarios[1] }).expect(400);
  });
  it('recupera las mismas líneas desde otra sesión sin compartir almacenamiento', async () => {
    const guardado = await guardar(a, operacion(0, 2)).expect(200);
    const otro = await segundoDispositivo.cliente
      .get('/api/carrito')
      .expect(200);
    expect(otro.body).toEqual(guardado.body);
    expect((await b.cliente.get('/api/carrito').expect(200)).body).toEqual({
      version: 0,
      articulos: [],
    });
  });
  it('evita repetir escrituras y rechaza reutilizar su clave con otro contenido', async () => {
    const datos = operacion(1, 3);
    const primera = await guardar(a, datos).expect(200);
    expect((await guardar(a, datos).expect(200)).body).toEqual(primera.body);
    await guardar(a, { ...datos, articulos: [{ sku, cantidad: 4 }] }).expect(
      409,
    );
    expect(
      await prisma.operacionCarrito.count({
        where: { usuarioId: usuarios[0], clave: datos.clave },
      }),
    ).toBe(1);
  });
  it('protege cambios simultáneos desde dos dispositivos', async () => {
    const { body } = await a.cliente.get('/api/carrito').expect(200);
    const resultados = await Promise.all([
      guardar(a, operacion(body.version, 4)),
      guardar(segundoDispositivo, operacion(body.version, 5)),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual([200, 409]);
    const actual = await a.cliente.get('/api/carrito').expect(200);
    expect(actual.body.version).toBe(body.version + 1);
  });
  it('combina sin duplicar cantidades y conserva variantes indisponibles para su revisión', async () => {
    const { body } = await a.cliente.get('/api/carrito').expect(200);
    const datos = {
      ...operacion(0, 2),
      tipo: 'COMBINAR',
      articulos: [
        { sku, cantidad: 2 },
        { sku: 'SKU-RETIRADO', cantidad: 1 },
      ],
    };
    const respuesta = await guardar(a, datos).expect(200);
    expect(respuesta.body.articulos).toEqual([
      { sku, cantidad: body.articulos[0].cantidad },
      { sku: 'SKU-RETIRADO', cantidad: 1 },
    ]);
    expect((await guardar(a, datos).expect(200)).body).toEqual(respuesta.body);
  });
  it('persiste el vaciado y lo muestra en ambos dispositivos', async () => {
    const { body } = await a.cliente.get('/api/carrito').expect(200);
    await guardar(segundoDispositivo, {
      ...operacion(body.version),
      articulos: [],
    }).expect(200);
    expect(
      (await a.cliente.get('/api/carrito').expect(200)).body.articulos,
    ).toEqual([]);
  });
});
