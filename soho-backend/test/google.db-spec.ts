import { BadRequestException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';
import {
  VerificadorGoogleService,
  type IdentidadGoogleVerificada,
} from '../src/autenticacion/google/verificador-google.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw new Error(
    'Google requiere TEST_DATABASE_URL exclusiva con sufijo _test.',
  );
const prisma = crearClientePrisma(url);
const clientId = '123456-prueba.apps.googleusercontent.com';
const clave = 'contraseña sintética para Google';
let secuencia = 0;
const identidad = (
  extra: Partial<IdentidadGoogleVerificada> = {},
): IdentidadGoogleVerificada => {
  const id = ++secuencia;
  return {
    sub: `google-db-${id}`,
    correo: `google-${id}@google.test`,
    correoConfiable: true,
    nombres: 'Ana',
    apellidos: 'Google',
    ...extra,
  };
};
// Solo este módulo de pruebas sustituye la verificación externa. La firma real se prueba en google.spec.ts.
const credencial = (datos: IdentidadGoogleVerificada, nonce: string) =>
  `e30.${Buffer.from(JSON.stringify({ datos, nonce })).toString('base64url')}.cHJ1ZWJh`;

describe.sequential('Google, sesiones y vinculación con MySQL aislado', () => {
  let app: INestApplication;
  let claveHash: string;
  const creados = new Set<string>();
  class Navegador {
    cliente = request.agent(app.getHttpServer());
    csrf = '';
    async preparar() {
      const r = await this.cliente.get('/api/auth/csrf').expect(200);
      this.csrf = r.body.csrfToken as string;
    }
    async post(ruta: string, datos: object) {
      const r = await this.cliente
        .post('/api/auth/' + ruta)
        .set('Origin', 'http://localhost:4200')
        .set('X-CSRF-Token', this.csrf)
        .send(datos);
      if (r.body.csrfToken) this.csrf = r.body.csrfToken as string;
      if (r.body.usuario?.id) creados.add(r.body.usuario.id as string);
      return r;
    }
    async desafio(vincular = false) {
      const r = await this.post(
        `google/${vincular ? 'vinculacion/' : ''}desafio`,
        {},
      );
      expect(r.status).toBe(200);
      return r.body.nonce as string;
    }
    async google(datos: IdentidadGoogleVerificada) {
      return this.post('google', {
        credential: credencial(datos, await this.desafio()),
      });
    }
  }
  const navegador = async () => {
    const n = new Navegador();
    await n.preparar();
    return n;
  };
  const local = async (rol: 'ADMIN' | 'CLIENTE' = 'CLIENTE') => {
    const datos = identidad();
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Nombre local',
        apellidos: 'Apellido local',
        correo: datos.correo,
        claveHash,
        rol,
      },
    });
    const n = await navegador();
    expect(
      (await n.post('login', { correo: usuario.correo, clave })).status,
    ).toBe(200);
    return { n, usuario, datos };
  };
  beforeAll(async () => {
    claveHash = await new ClavesService().crear(clave);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({ GOOGLE_CLIENT_ID: clientId }))
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: () => undefined })
      .overrideProvider(VerificadorGoogleService)
      .useValue({
        verificar: async (token: string, nonce: string) => {
          const contenido = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64url').toString(),
          ) as { datos: IdentidadGoogleVerificada; nonce: string };
          if (contenido.nonce !== nonce)
            throw new BadRequestException('Nonce incorrecto.');
          return contenido.datos;
        },
      })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    const where = { usuarioId: { in: [...creados] } };
    await prisma.sesion.deleteMany({ where });
    await prisma.tokenUsuario.deleteMany({ where });
    await prisma.identidadExterna.deleteMany({ where });
    await prisma.usuario.deleteMany({ where: { id: { in: [...creados] } } });
    await prisma.$disconnect();
  });

  it('publica únicamente la configuración pública', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/auth/google/configuracion')
      .expect(200);
    expect(r.body).toEqual({ habilitado: true, clientId });
  });
  it('crea un CLIENTE sin contraseña, guarda la identidad y reconoce la sesión', async () => {
    const n = await navegador();
    const datos = identidad();
    const r = await n.google(datos);
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({
      correo: datos.correo,
      rol: 'CLIENTE',
      correoVerificado: true,
    });
    expect(Object.keys(r.body).sort()).toEqual(['csrfToken', 'usuario']);
    const u = await prisma.usuario.findUniqueOrThrow({
      where: { correo: datos.correo },
      include: { identidadesExternas: true, sesiones: true },
    });
    expect(u.claveHash).toBeNull();
    expect(u.identidadesExternas[0].identificadorProveedor).toBe(datos.sub);
    expect(u.sesiones[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await n.cliente.get('/api/auth/me').expect(200)).body.usuario.id,
    ).toBe(u.id);
    expect((await n.post('logout', {})).status).toBe(204);
    await n.cliente.get('/api/auth/me').expect(401);
  });
  it('identifica por sub aunque cambie Google; conserva los datos y el rol local', async () => {
    const n = await navegador();
    const datos = identidad();
    const r = await n.google(datos);
    await prisma.usuario.update({
      where: { id: r.body.usuario.id as string },
      data: { rol: 'ADMIN' },
    });
    const posterior = await n.google({
      ...datos,
      correo: 'cambio@google.test',
      nombres: 'Otro',
      apellidos: 'Nombre',
    });
    expect(posterior.status).toBe(200);
    expect(posterior.body.usuario).toMatchObject({
      id: r.body.usuario.id,
      correo: datos.correo,
      nombres: 'Ana',
      rol: 'ADMIN',
    });
    expect(
      await prisma.usuario.count({ where: { correo: 'cambio@google.test' } }),
    ).toBe(0);
    expect(
      await prisma.sesion.count({
        where: { usuarioId: r.body.usuario.id as string, revocadaEn: null },
      }),
    ).toBe(1);
  });
  it('exige vinculación explícita cuando el correo ya existe', async () => {
    const { usuario, datos } = await local();
    const n = await navegador();
    const r = await n.google(datos);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('GOOGLE_VINCULACION_REQUERIDA');
    expect(
      await prisma.identidadExterna.count({ where: { usuarioId: usuario.id } }),
    ).toBe(0);
    await n.cliente.get('/api/auth/me').expect(401);
  });
  it('vincula con contraseña, verifica el correo coincidente y conserva ADMIN y sus nombres', async () => {
    const { n, usuario, datos } = await local('ADMIN');
    expect(
      (await n.cliente.get('/api/auth/google/vinculacion').expect(200)).body
        .vinculado,
    ).toBe(false);
    const r = await n.post('google/vinculacion', {
      credential: credencial(datos, await n.desafio(true)),
      clave,
    });
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({
      id: usuario.id,
      rol: 'ADMIN',
      nombres: usuario.nombres,
      correoVerificado: true,
    });
    expect(
      (await n.cliente.get('/api/auth/google/vinculacion').expect(200)).body
        .vinculado,
    ).toBe(true);
    expect(
      await prisma.sesion.count({
        where: { usuarioId: usuario.id, revocadaEn: null },
      }),
    ).toBe(1);
  });
  it('rechaza una contraseña incorrecta sin vincular ni cerrar la sesión', async () => {
    const { n, usuario, datos } = await local();
    const r = await n.post('google/vinculacion', {
      credential: credencial(datos, await n.desafio(true)),
      clave: 'incorrecta',
    });
    expect(r.status).toBe(403);
    expect(r.body.codigo).toBe('GOOGLE_REAUTENTICACION_REQUERIDA');
    expect(
      await prisma.identidadExterna.count({ where: { usuarioId: usuario.id } }),
    ).toBe(0);
    await n.cliente.get('/api/auth/me').expect(200);
  });
  it('impide vincular una identidad ajena o añadir una segunda identidad Google', async () => {
    const { n, datos } = await local();
    expect(
      (
        await n.post('google/vinculacion', {
          credential: credencial(datos, await n.desafio(true)),
          clave,
        })
      ).status,
    ).toBe(200);
    const otro = await local();
    const ocupado = await otro.n.post('google/vinculacion', {
      credential: credencial(datos, await otro.n.desafio(true)),
      clave,
    });
    expect(ocupado.status).toBe(409);
    expect(ocupado.body.codigo).toBe('GOOGLE_IDENTIDAD_OCUPADA');
    const segundo = await n.post('google/vinculacion', {
      credential: credencial(identidad(), await n.desafio(true)),
      clave,
    });
    expect(segundo.status).toBe(409);
    expect(segundo.body.codigo).toBe('GOOGLE_YA_VINCULADO');
  });
  it('solicita los nombres que faltan y completa con el mismo nonce una sola vez', async () => {
    const n = await navegador();
    const datos = identidad({ apellidos: undefined });
    const token = credencial(datos, await n.desafio());
    const pendiente = await n.post('google', { credential: token });
    expect(pendiente.status).toBe(422);
    expect(pendiente.body.codigo).toBe('GOOGLE_COMPLETAR_PERFIL');
    expect(
      await prisma.usuario.count({ where: { correo: datos.correo } }),
    ).toBe(0);
    const completo = await n.post('google', {
      credential: token,
      perfil: { nombres: 'Ana', apellidos: 'Completado' },
    });
    expect(completo.status).toBe(200);
    expect(completo.body.usuario.apellidos).toBe('Completado');
    expect((await n.post('google', { credential: token })).status).toBe(400);
  });
  it('impide repetir una credencial o presentarla con otro nonce', async () => {
    const n = await navegador();
    const datos = identidad();
    const viejo = credencial(datos, await n.desafio());
    await n.desafio();
    expect((await n.post('google', { credential: viejo })).status).toBe(400);
    const nuevo = credencial(datos, await n.desafio());
    expect((await n.post('google', { credential: nuevo })).status).toBe(200);
    expect((await n.post('google', { credential: nuevo })).status).toBe(400);
  });
  it('exige CSRF y autenticación para vincular, y rechaza campos privilegiados', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/google/desafio')
      .set('Origin', 'http://localhost:4200')
      .send({})
      .expect(403);
    const n = await navegador();
    expect((await n.post('google/vinculacion/desafio', {})).status).toBe(401);
    await n.preparar();
    expect(
      (await n.post('google', { credential: 'a.b.c', rol: 'ADMIN' })).status,
    ).toBe(400);
  });
  it('no registra un correo externo no fiable; permite vincularlo con prueba local', async () => {
    const n = await navegador();
    const datos = identidad({ correoConfiable: false });
    const r = await n.google(datos);
    expect(r.status).toBe(403);
    expect(r.body.codigo).toBe('GOOGLE_CORREO_NO_VERIFICABLE');
    const propia = await local();
    const vinculo = await propia.n.post('google/vinculacion', {
      credential: credencial(datos, await propia.n.desafio(true)),
      clave,
    });
    expect(vinculo.status).toBe(200);
    expect(vinculo.body.usuario.correo).toBe(propia.usuario.correo);
    expect(vinculo.body.usuario.correoVerificado).toBe(false);
  });
  it('impide acceder a una cuenta desactivada mediante su identidad Google', async () => {
    const n = await navegador();
    const datos = identidad();
    const r = await n.google(datos);
    await prisma.usuario.update({
      where: { id: r.body.usuario.id as string },
      data: { activo: false },
    });
    expect((await (await navegador()).google(datos)).status).toBe(403);
  });
});
