import { randomUUID } from 'node:crypto';
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

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Direcciones requiere TEST_DATABASE_URL exclusiva con sufijo _test.',
  );
const prisma = crearClientePrisma(url);
const prefijo = `direcciones-${Date.now()}`;
const clave = 'contraseña sintética para direcciones';
const origen = 'http://localhost:4200';
const ruta = '/api/direcciones';
const datos = {
  etiqueta: ' Casa ',
  destinatario: ' Ana Pérez ',
  celular: '987654321',
  distrito: 'la-esperanza',
  direccion: ' Av. Perú 123 ',
  referencia: '',
  predeterminada: false,
};

describe.sequential('Direcciones protegidas con MySQL aislado', () => {
  let app: INestApplication,
    claveHash: string,
    secuencia = 0;
  const creados: string[] = [];
  const crear = async (rol: 'ADMIN' | 'CLIENTE' = 'CLIENTE') => {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Ana',
        apellidos: 'Prueba',
        correo: `${prefijo}-${++secuencia}@direcciones.test`,
        claveHash,
        rol,
      },
    });
    creados.push(usuario.id);
    const cliente = request.agent(app.getHttpServer());
    const proteccion = await cliente.get('/api/auth/csrf').expect(200);
    const login = await cliente
      .post('/api/auth/login')
      .set('Origin', origen)
      .set('X-CSRF-Token', proteccion.body.csrfToken as string)
      .send({ correo: usuario.correo, clave })
      .expect(200);
    return { usuario, cliente, csrf: login.body.csrfToken as string };
  };
  type Navegador = Awaited<ReturnType<typeof crear>>;
  const escribir = (
    n: Navegador,
    metodo: 'post' | 'patch' | 'delete',
    destino: string,
    cuerpo: object = {},
  ) =>
    n.cliente[metodo](destino)
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send(cuerpo);
  const agregar = async (n: Navegador, extra: object = {}) => {
    const r = await escribir(n, 'post', ruta, { ...datos, ...extra }).expect(
      201,
    );
    return r.body.direcciones as Array<typeof datos & { id: string }>;
  };
  const agenda = (n: Navegador) =>
    prisma.direccionUsuario.findMany({
      where: { usuarioId: n.usuario.id },
      orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
    });
  beforeAll(async () => {
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
  afterAll(async () => {
    await app?.close();
    const where = { usuarioId: { in: creados } };
    await prisma.direccionUsuario.deleteMany({ where });
    await prisma.sesion.deleteMany({ where });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    await prisma.$disconnect();
  });
  it('exige sesión en todas las operaciones', async () => {
    for (const [metodo, destino] of [
      ['get', ruta],
      ['get', `${ruta}/${randomUUID()}`],
      ['post', ruta],
      ['patch', `${ruta}/${randomUUID()}`],
      ['patch', `${ruta}/${randomUUID()}/predeterminada`],
      ['delete', `${ruta}/${randomUUID()}`],
    ] as const) {
      await request(app.getHttpServer())[metodo](destino).expect(401);
    }
  });
  it('crea la primera como predeterminada, normaliza y conserva los datos al volver a consultar', async () => {
    const n = await crear();
    await n.cliente.get(ruta).expect(200, { direcciones: [] });
    const [direccion] = await agregar(n);
    expect(direccion).toEqual({
      ...datos,
      id: expect.any(String),
      etiqueta: 'Casa',
      destinatario: 'Ana Pérez',
      direccion: 'Av. Perú 123',
      predeterminada: true,
    });
    const r = await n.cliente.get(ruta).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.direcciones).toEqual([direccion]);
    await n.cliente.get(`${ruta}/${direccion.id}`).expect(200, { direccion });
    expect((await agenda(n))[0].usuarioId).toBe(n.usuario.id);
  });
  it('permite varias secundarias y cambia o elimina la predeterminada sin perder el resto', async () => {
    const n = await crear();
    const [casa] = await agregar(n);
    await agregar(n, { etiqueta: 'Trabajo' });
    const lista = await agregar(n, { etiqueta: 'Familia' });
    expect(lista.filter((d) => d.predeterminada)).toHaveLength(1);
    const trabajo = lista.find((d) => d.etiqueta === 'Trabajo')!;
    const cambio = await escribir(
      n,
      'patch',
      `${ruta}/${trabajo.id}/predeterminada`,
    ).expect(200);
    expect(cambio.body.direcciones[0].id).toBe(trabajo.id);
    const editada = await escribir(n, 'patch', `${ruta}/${trabajo.id}`, {
      referencia: 'Puerta azul',
      predeterminada: false,
    }).expect(200);
    expect(editada.body.direcciones[0]).toMatchObject({
      id: trabajo.id,
      referencia: 'Puerta azul',
      predeterminada: true,
    });
    const borrada = await escribir(n, 'delete', `${ruta}/${trabajo.id}`).expect(
      200,
    );
    expect(borrada.body.direcciones[0]).toMatchObject({
      id: casa.id,
      predeterminada: true,
    });
    for (const d of borrada.body.direcciones as Array<{ id: string }>)
      await escribir(n, 'delete', `${ruta}/${d.id}`).expect(200);
    await n.cliente.get(ruta).expect(200, { direcciones: [] });
  });
  it('aísla las direcciones entre clientes y administradores con el mismo 404 para ajenas e inexistentes', async () => {
    const propietario = await crear(),
      ajeno = await crear('ADMIN');
    const [direccion] = await agregar(propietario);
    await ajeno.cliente.get(ruta).expect(200, { direcciones: [] });
    for (const id of [direccion.id, randomUUID()]) {
      await ajeno.cliente.get(`${ruta}/${id}`).expect(404);
      await escribir(ajeno, 'patch', `${ruta}/${id}`, {
        etiqueta: 'Robo',
      }).expect(404);
      await escribir(ajeno, 'patch', `${ruta}/${id}/predeterminada`).expect(
        404,
      );
      await escribir(ajeno, 'delete', `${ruta}/${id}`).expect(404);
    }
    expect((await agenda(propietario))[0]).toMatchObject({
      etiqueta: 'Casa',
      predeterminada: true,
    });
    expect((await agregar(ajeno))[0].predeterminada).toBe(true);
  });
  it('rechaza atributos de propietario y otros campos ajenos al contrato', async () => {
    const n = await crear();
    for (const extra of [
      { usuarioId: randomUUID() },
      { id: randomUUID() },
      { rol: 'ADMIN' },
      { creadoEn: new Date().toISOString() },
    ])
      await escribir(n, 'post', ruta, { ...datos, ...extra }).expect(400);
    expect(await agenda(n)).toEqual([]);
  });
  it('bloquea escrituras sin CSRF o con origen ajeno y no altera la agenda', async () => {
    const n = await crear();
    const [d] = await agregar(n);
    await n.cliente.post(ruta).set('Origin', origen).send(datos).expect(403);
    await n.cliente
      .patch(`${ruta}/${d.id}`)
      .set('Origin', origen)
      .send({ etiqueta: 'Alterada' })
      .expect(403);
    await n.cliente
      .delete(`${ruta}/${d.id}`)
      .set('Origin', origen)
      .send({})
      .expect(403);
    await n.cliente
      .patch(`${ruta}/${d.id}/predeterminada`)
      .set('Origin', 'https://ajeno.test')
      .set('X-CSRF-Token', n.csrf)
      .send({})
      .expect(403);
    expect((await agenda(n))[0].etiqueta).toBe('Casa');
  });
  it('rechaza UUID y cuerpos inválidos antes de modificar datos', async () => {
    const n = await crear();
    const [d] = await agregar(n);
    await n.cliente.get(`${ruta}/123`).expect(400);
    await escribir(n, 'patch', `${ruta}/${d.id}`).expect(400);
    await escribir(n, 'patch', `${ruta}/${d.id}/predeterminada`, {
      usuarioId: n.usuario.id,
    }).expect(400);
    await escribir(n, 'patch', `${ruta}/${d.id}`, { celular: '123' }).expect(
      400,
    );
    expect((await agenda(n))[0].celular).toBe(datos.celular);
  });
  it('serializa creaciones simultáneas incluso cuando la agenda comienza vacía', async () => {
    const n = await crear();
    const respuestas = await Promise.all(
      [1, 2, 3].map((i) =>
        escribir(n, 'post', ruta, { ...datos, etiqueta: `Casa ${i}` }),
      ),
    );
    expect(respuestas.map((r) => r.status)).toEqual([201, 201, 201]);
    const direcciones = await agenda(n);
    expect(direcciones).toHaveLength(3);
    expect(direcciones.filter((d) => d.predeterminada)).toHaveLength(1);
    await Promise.all(
      direcciones.map((d) =>
        escribir(n, 'patch', `${ruta}/${d.id}/predeterminada`).expect(200),
      ),
    );
    expect((await agenda(n)).filter((d) => d.predeterminada)).toHaveLength(1);
  });
  it('resuelve el borrado y la selección concurrentes conservando una predeterminada', async () => {
    const n = await crear();
    const [casa] = await agregar(n);
    const trabajo = (await agregar(n, { etiqueta: 'Trabajo' })).find(
      (d) => d.etiqueta === 'Trabajo',
    )!;
    await Promise.all([
      escribir(n, 'delete', `${ruta}/${casa.id}`).expect(200),
      escribir(n, 'patch', `${ruta}/${trabajo.id}/predeterminada`).expect(200),
    ]);
    expect(await agenda(n)).toMatchObject([
      { id: trabajo.id, predeterminada: true },
    ]);
  });
  it('restringe cuentas desactivadas aunque conserven la cookie', async () => {
    const n = await crear();
    await prisma.usuario.update({
      where: { id: n.usuario.id },
      data: { activo: false },
    });
    await n.cliente.get(ruta).expect(401);
    expect(await agenda(n)).toEqual([]);
  });
});
