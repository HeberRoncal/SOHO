import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
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
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';
import { VerificacionService } from '../src/autenticacion/verificacion/verificacion.service.js';
import {
  generarIdentificador,
  hashIdentificador,
} from '../src/autenticacion/sesiones/cookies-auth.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test'))
  throw Error(
    'Verificacion requiere TEST_DATABASE_URL exclusiva con sufijo _test.',
  );
const prisma = crearClientePrisma(url);
const prefijo = `verificacion-${Date.now()}`;
let secuencia = 0;
const clave = 'contraseña sintética para verificación';
describe.sequential('Verificación con MySQL aislado', () => {
  let app: INestApplication, servicio: VerificacionService, claveHash: string;
  const creados = new Set<string>();
  const enviados: { correo: string; enlace: string }[] = [];
  const correos = {
    habilitado: vi.fn(() => true),
    enviarVerificacion: vi.fn(async (correo: string, enlace: string) => {
      enviados.push({ correo, enlace });
    }),
  };
  class Navegador {
    cliente = request.agent(app.getHttpServer());
    csrf = '';
    async preparar() {
      this.csrf = (await this.cliente.get('/api/auth/csrf').expect(200)).body
        .csrfToken as string;
    }
    async post(ruta: string, datos: object) {
      const r = await this.cliente
        .post('/api/auth/' + ruta)
        .set('Origin', 'http://localhost:4200')
        .set('X-CSRF-Token', this.csrf)
        .send(datos);
      if (r.body.csrfToken) this.csrf = r.body.csrfToken as string;
      return r;
    }
  }
  const navegador = async () => {
    const n = new Navegador();
    await n.preparar();
    return n;
  };
  const crear = async (
    extra: {
      activo?: boolean;
      claveHash?: string | null;
      correoVerificadoEn?: Date;
      rol?: 'ADMIN' | 'CLIENTE';
    } = {},
  ) => {
    const u = await prisma.usuario.create({
      data: {
        nombres: 'Ana',
        apellidos: 'Verificación',
        correo: `${prefijo}-${++secuencia}@verify.test`,
        claveHash,
        ...extra,
      },
    });
    creados.add(u.id);
    return u;
  };
  const entrar = async (correo: string) => {
    const n = await navegador();
    expect((await n.post('login', { correo, clave })).status).toBe(200);
    return n;
  };
  const tokenDe = (correo: string) =>
    new URLSearchParams(
      new URL(enviados.findLast((e) => e.correo === correo)!.enlace).hash.slice(
        1,
      ),
    ).get('token')!;
  const emitir = async (usuarioId: string, correo: string) => {
    servicio.solicitar(usuarioId);
    await servicio.esperarOciosidad();
    return tokenDe(correo);
  };
  const comprobar = async (token: string) => {
    const n = await navegador();
    const r = await n.post('verificacion/comprobar', { token });
    expect(r.status).toBe(200);
    return r.body.vigente as boolean;
  };
  beforeAll(async () => {
    claveHash = await new ClavesService().crear(clave);
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({}))
      .overrideProvider(CorreosService)
      .useValue(correos)
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: () => undefined })
      .compile();
    app = m.createNestApplication();
    await app.init();
    servicio = app.get(VerificacionService);
  });
  beforeEach(async () => {
    await servicio.esperarOciosidad();
    enviados.length = 0;
    correos.habilitado.mockReturnValue(true);
    correos.enviarVerificacion
      .mockReset()
      .mockImplementation(async (correo, enlace) => {
        enviados.push({ correo, enlace });
      });
  });
  afterAll(async () => {
    await servicio?.esperarOciosidad();
    await app?.close();
    const where = { usuarioId: { in: [...creados] } };
    await prisma.sesion.deleteMany({ where });
    await prisma.tokenUsuario.deleteMany({ where });
    await prisma.usuario.deleteMany({ where: { id: { in: [...creados] } } });
    await prisma.$disconnect();
  });
  it('programa correo al registrarse sin marcar verificado ni bloquear el acceso', async () => {
    const n = await navegador(),
      correo = `${prefijo}-${++secuencia}@verify.test`;
    const r = await n.post('registro', {
      nombres: 'Ana',
      apellidos: 'Registro',
      correo,
      clave,
    });
    expect(r.status).toBe(201);
    creados.add(r.body.usuario.id as string);
    expect(r.body.usuario).toMatchObject({
      rol: 'CLIENTE',
      correoVerificado: false,
    });
    await servicio.esperarOciosidad();
    expect(enviados.map((e) => e.correo)).toEqual([correo]);
    const token = tokenDe(correo);
    expect(token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const t = await prisma.tokenUsuario.findUniqueOrThrow({
      where: { id: token.split('.')[0] },
    });
    expect(t.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(t.tokenHash).not.toContain(token);
    expect(t.expiraEn.getTime() - t.creadoEn.getTime()).toBe(
      8 * 60 * 60 * 1000,
    );
    expect(t.tipo).toBe('VERIFICACION_CORREO');
    expect(new URL(enviados[0].enlace).search).toBe('');
    await n.cliente.get('/api/auth/me').expect(200);
  });
  it('comprueba sin consumir; confirma una sola vez, conserva rol y sesiones', async () => {
    const u = await crear({ rol: 'ADMIN' }),
      n = await entrar(u.correo),
      token = await emitir(u.id, u.correo);
    expect(await comprobar(token)).toBe(true);
    expect(await comprobar(token)).toBe(true);
    const sesiones = await prisma.sesion.count({
      where: { usuarioId: u.id, revocadaEn: null },
    });
    const r = await (
      await navegador()
    ).post('verificacion/confirmar', { token });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(['mensaje']);
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(
      (await n.cliente.get('/api/auth/me').expect(200)).body.usuario,
    ).toMatchObject({ id: u.id, rol: 'ADMIN', correoVerificado: true });
    expect(
      await prisma.sesion.count({
        where: { usuarioId: u.id, revocadaEn: null },
      }),
    ).toBe(sesiones);
    expect(
      (await (await navegador()).post('verificacion/confirmar', { token }))
        .status,
    ).toBe(400);
    expect(await comprobar(token)).toBe(false);
  });
  it('el reenvío requiere sesión, no acepta otro usuario y sustituye el enlace al aceptar SMTP', async () => {
    const u = await crear(),
      n = await entrar(u.correo),
      primero = await emitir(u.id, u.correo);
    expect(
      (await (await navegador()).post('verificacion/reenviar', {})).status,
    ).toBe(401);
    expect(
      (await n.post('verificacion/reenviar', { usuarioId: 'ajeno' })).status,
    ).toBe(400);
    expect((await n.post('verificacion/reenviar', {})).status).toBe(202);
    await servicio.esperarOciosidad();
    const segundo = tokenDe(u.correo);
    expect(segundo).not.toBe(primero);
    expect(await comprobar(primero)).toBe(false);
    expect(await comprobar(segundo)).toBe(true);
  });
  it('fallar SMTP conserva el enlace previo y no verifica al usuario', async () => {
    const u = await crear(),
      token = await emitir(u.id, u.correo);
    correos.enviarVerificacion.mockRejectedValueOnce(
      Error('detalle SMTP privado'),
    );
    const n = await entrar(u.correo);
    expect((await n.post('verificacion/reenviar', {})).status).toBe(202);
    await servicio.esperarOciosidad();
    expect(await comprobar(token)).toBe(true);
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
        .correoVerificadoEn,
    ).toBeNull();
    expect(
      await prisma.tokenUsuario.count({
        where: { usuarioId: u.id, revocadoEn: { not: null } },
      }),
    ).toBe(1);
  });
  it('un cambio de correo invalida la prueba dirigida a la dirección anterior', async () => {
    const u = await crear(),
      token = await emitir(u.id, u.correo);
    await prisma.usuario.update({
      where: { id: u.id },
      data: { correo: `${prefijo}-cambiado@verify.test` },
    });
    expect(await comprobar(token)).toBe(false);
    expect(
      (await (await navegador()).post('verificacion/confirmar', { token }))
        .status,
    ).toBe(400);
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
        .correoVerificadoEn,
    ).toBeNull();
  });
  it('rechaza vencimiento, revocación, propósito ajeno y secreto alterado', async () => {
    const u = await crear();
    let token = await emitir(u.id, u.correo);
    expect(
      await comprobar(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')),
    ).toBe(false);
    await prisma.tokenUsuario.update({
      where: { id: token.split('.')[0] },
      data: {
        creadoEn: new Date(Date.now() - 7200000),
        expiraEn: new Date(Date.now() - 3600000),
      },
    });
    expect(await comprobar(token)).toBe(false);
    token = await emitir(u.id, u.correo);
    await prisma.tokenUsuario.update({
      where: { id: token.split('.')[0] },
      data: { tipo: 'RECUPERACION_CLAVE' },
    });
    expect(await comprobar(token)).toBe(false);
    token = await emitir(u.id, u.correo);
    await prisma.tokenUsuario.update({
      where: { id: token.split('.')[0] },
      data: { revocadoEn: new Date() },
    });
    expect(await comprobar(token)).toBe(false);
    expect(
      (await (await navegador()).post('verificacion/confirmar', { token }))
        .status,
    ).toBe(400);
  });
  it('no envía para cuentas verificadas, inactivas o sin contraseña local', async () => {
    for (const extra of [
      { correoVerificadoEn: new Date() },
      { activo: false },
      { claveHash: null },
    ]) {
      const u = await crear(extra);
      servicio.solicitar(u.id);
    }
    await servicio.esperarOciosidad();
    expect(enviados).toEqual([]);
  });
  it('desactivar una cuenta invalida un enlace ya enviado', async () => {
    const u = await crear(),
      token = await emitir(u.id, u.correo);
    await prisma.usuario.update({
      where: { id: u.id },
      data: { activo: false },
    });
    expect(await comprobar(token)).toBe(false);
    expect(
      (await (await navegador()).post('verificacion/confirmar', { token }))
        .status,
    ).toBe(400);
  });
  it('dos confirmaciones simultáneas consumen el enlace una sola vez', async () => {
    const u = await crear(),
      token = await emitir(u.id, u.correo),
      a = await navegador(),
      b = await navegador();
    const r = await Promise.all([
      a.post('verificacion/confirmar', { token }),
      b.post('verificacion/confirmar', { token }),
    ]);
    expect(r.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 400]);
  });
  it('verificar no consume enlaces de recuperación ni cambia la contraseña', async () => {
    const u = await crear(),
      secreto = generarIdentificador();
    await prisma.tokenUsuario.create({
      data: {
        usuarioId: u.id,
        tipo: 'RECUPERACION_CLAVE',
        tokenHash: hashIdentificador(secreto),
        expiraEn: new Date(Date.now() + 600000),
      },
    });
    const token = await emitir(u.id, u.correo);
    expect(
      (await (await navegador()).post('verificacion/confirmar', { token }))
        .status,
    ).toBe(200);
    expect(
      (
        await prisma.tokenUsuario.findUniqueOrThrow({
          where: { tokenHash: hashIdentificador(secreto) },
        })
      ).revocadoEn,
    ).toBeNull();
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
        .claveHash,
    ).toBe(u.claveHash);
  });
  it('sin SMTP el registro continúa y reenviar informa indisponibilidad', async () => {
    correos.habilitado.mockReturnValue(false);
    const n = await navegador(),
      correo = `${prefijo}-${++secuencia}@verify.test`;
    const r = await n.post('registro', {
      nombres: 'Ana',
      apellidos: 'Sin SMTP',
      correo,
      clave,
    });
    expect(r.status).toBe(201);
    creados.add(r.body.usuario.id as string);
    expect((await n.post('verificacion/reenviar', {})).status).toBe(503);
    expect(enviados).toEqual([]);
  });
  it('las tres operaciones exigen CSRF y no aceptan tokens arbitrarios ni campos extras', async () => {
    const u = await crear(),
      n = await entrar(u.correo);
    for (const ruta of ['reenviar', 'comprobar', 'confirmar'])
      await n.cliente
        .post('/api/auth/verificacion/' + ruta)
        .set('Origin', 'http://localhost:4200')
        .send({})
        .expect(403);
    expect(
      (
        await (
          await navegador()
        ).post('verificacion/comprobar', { token: 'invalido' })
      ).status,
    ).toBe(400);
    expect(
      (
        await (
          await navegador()
        ).post('verificacion/confirmar', {
          token: randomUUID() + '.' + generarIdentificador(),
          rol: 'ADMIN',
        })
      ).status,
    ).toBe(400);
  });
});
