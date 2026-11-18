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
  throw Error('Perfil requiere TEST_DATABASE_URL exclusiva con sufijo _test.');
const prisma = crearClientePrisma(url);
const prefijo = `perfil-${Date.now()}`;
const clave = 'contraseña sintética para perfil';
const origen = 'http://localhost:4200';

describe.sequential('Edición de perfil con MySQL aislado', () => {
  let app: INestApplication,
    claveHash: string,
    secuencia = 0;
  const creados: string[] = [];
  class Navegador {
    cliente = request.agent(app.getHttpServer());
    csrf = '';
    async preparar() {
      this.csrf = (await this.cliente.get('/api/auth/csrf').expect(200)).body
        .csrfToken as string;
    }
    async entrar(correo: string) {
      await this.preparar();
      const r = await this.cliente
        .post('/api/auth/login')
        .set('Origin', origen)
        .set('X-CSRF-Token', this.csrf)
        .send({ correo, clave })
        .expect(200);
      this.csrf = r.body.csrfToken as string;
    }
    guardar(datos: object) {
      return this.cliente
        .patch('/api/auth/me')
        .set('Origin', origen)
        .set('X-CSRF-Token', this.csrf)
        .send(datos);
    }
  }
  const crear = async (rol: 'CLIENTE' | 'ADMIN' = 'CLIENTE') => {
    const u = await prisma.usuario.create({
      data: {
        nombres: 'Ana',
        apellidos: 'Original',
        correo: `${prefijo}-${++secuencia}@perfil.test`,
        claveHash,
        rol,
        correoVerificadoEn: new Date('2026-01-01T00:00:00Z'),
      },
    });
    creados.push(u.id);
    const n = new Navegador();
    await n.entrar(u.correo);
    return { u, n };
  };
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
    await prisma.identidadExterna.deleteMany({ where });
    await prisma.sesion.deleteMany({ where });
    await prisma.tokenUsuario.deleteMany({ where });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    await prisma.$disconnect();
  });
  it('guarda nombres normalizados de la cuenta propia y los conserva tras cerrar sesión y volver a entrar', async () => {
    const { u, n } = await crear(),
      otra = await crear();
    const antes = await prisma.sesion.findMany({ where: { usuarioId: u.id } });
    const datos = {
      nombres: '  María José  ',
      apellidos: '  O’Connor Pérez  ',
    };
    const r = await n.guardar(datos).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(r.body).toEqual({
      usuario: {
        id: u.id,
        nombres: 'María José',
        apellidos: 'O’Connor Pérez',
        correo: u.correo,
        rol: 'CLIENTE',
        correoVerificado: true,
      },
    });
    const actual = await prisma.usuario.findUniqueOrThrow({
      where: { id: u.id },
    });
    expect(actual).toMatchObject({
      claveHash: u.claveHash,
      correo: u.correo,
      rol: u.rol,
      activo: true,
      correoVerificadoEn: u.correoVerificadoEn,
    });
    expect(
      await prisma.usuario.findUnique({ where: { id: otra.u.id } }),
    ).toEqual(otra.u);
    const despues = await prisma.sesion.findMany({
      where: { usuarioId: u.id },
    });
    expect(
      despues.map((s) => ({
        id: s.id,
        tokenHash: s.tokenHash,
        revocadaEn: s.revocadaEn,
      })),
    ).toEqual(
      antes.map((s) => ({
        id: s.id,
        tokenHash: s.tokenHash,
        revocadaEn: s.revocadaEn,
      })),
    );
    expect((await n.cliente.get('/api/auth/me').expect(200)).body).toEqual(
      r.body,
    );
    await n.cliente
      .post('/api/auth/logout')
      .set('Origin', origen)
      .set('X-CSRF-Token', n.csrf)
      .send({})
      .expect(204);
    await n.entrar(u.correo);
    expect((await n.cliente.get('/api/auth/me').expect(200)).body).toEqual(
      r.body,
    );
  });
  it('permite editar al ADMIN sin alterar su rol ni una identidad Google vinculada', async () => {
    const { u, n } = await crear('ADMIN');
    const identidad = await prisma.identidadExterna.create({
      data: {
        usuarioId: u.id,
        proveedor: 'GOOGLE',
        identificadorProveedor: 'perfil-sub-' + u.id,
      },
    });
    await prisma.usuario.update({
      where: { id: u.id },
      data: { claveHash: null },
    });
    const r = await n
      .guardar({ nombres: 'Nombre local', apellidos: 'Cuenta Google' })
      .expect(200);
    expect(r.body.usuario).toMatchObject({
      id: u.id,
      rol: 'ADMIN',
      correoVerificado: true,
    });
    expect(
      await prisma.identidadExterna.findUnique({ where: { id: identidad.id } }),
    ).toEqual(identidad);
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
        .claveHash,
    ).toBeNull();
  });
  it('rechaza destinatarios ajenos y campos fuera del contrato sin actualizar parcialmente', async () => {
    const { u, n } = await crear(),
      otra = await crear();
    for (const extra of [
      { id: otra.u.id },
      { usuarioId: otra.u.id },
      { rol: 'ADMIN' },
      { correo: 'otro@perfil.test' },
      { activo: false },
      { claveHash: 'secreto' },
      { correoVerificado: true },
      { celular: '987654321' },
    ]) {
      await n
        .guardar({ nombres: 'Cambio', apellidos: 'Denegado', ...extra })
        .expect(400);
    }
    expect(await prisma.usuario.findUnique({ where: { id: u.id } })).toEqual(u);
    expect(
      await prisma.usuario.findUnique({ where: { id: otra.u.id } }),
    ).toEqual(otra.u);
  });
  it('rechaza campos faltantes, vacíos, extensos y controles invisibles sin perder los datos previos', async () => {
    const { u, n } = await crear();
    for (const datos of [
      {},
      { nombres: 'Ana' },
      { nombres: 'Ana', apellidos: ' ' },
      { nombres: 'A', apellidos: 'Pérez' },
      { nombres: 'a'.repeat(81), apellidos: 'Pérez' },
      { nombres: 'Ana', apellidos: 'Pé\u200brez' },
      { nombres: 42, apellidos: 'Pérez' },
    ])
      await n.guardar(datos).expect(400);
    expect(await prisma.usuario.findUnique({ where: { id: u.id } })).toEqual(u);
    await n
      .guardar({ nombres: '名'.repeat(80), apellidos: 'Á'.repeat(80) })
      .expect(200);
  });
  it('exige sesión, CSRF y origen permitido antes de escribir', async () => {
    const datos = { nombres: 'Cambio', apellidos: 'Denegado' };
    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .send(datos)
      .expect(401);
    const { u, n } = await crear();
    await n.cliente
      .patch('/api/auth/me')
      .set('Origin', origen)
      .send(datos)
      .expect(403);
    await n.cliente
      .patch('/api/auth/me')
      .set('Origin', 'https://ajeno.test')
      .set('X-CSRF-Token', n.csrf)
      .send(datos)
      .expect(403);
    expect(await prisma.usuario.findUnique({ where: { id: u.id } })).toEqual(u);
    await prisma.usuario.update({
      where: { id: u.id },
      data: { activo: false },
    });
    await n.guardar(datos).expect(401);
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } })).nombres,
    ).toBe(u.nombres);
  });
});
