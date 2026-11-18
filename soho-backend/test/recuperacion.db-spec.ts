import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
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
import { hashIdentificador } from '../src/autenticacion/sesiones/cookies-auth.js';
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';
import { CorreosService } from '../src/autenticacion/correo/correos.service.js';
import { RecuperacionService } from '../src/autenticacion/recuperacion/recuperacion.service.js';
import { TipoTokenUsuario } from '../src/generated/prisma/client.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test')) {
  throw new Error(
    'Recuperación requiere TEST_DATABASE_URL exclusiva con sufijo _test.',
  );
}
const prisma = crearClientePrisma(url);
const mensajeSolicitud =
  'Si existe una cuenta con contraseña para ese correo, recibirás instrucciones para restablecerla.';
const clave = 'contraseña sintética de recuperación';
const nuevaClave = ' nueva contraseña sintética de recuperación ';
const prefijo = `recuperacion-${Date.now()}`;
let secuencia = 0;

describe.sequential('Recuperación de contraseña con MySQL aislado', () => {
  let app: INestApplication;
  let servicio: RecuperacionService;
  const claves = new ClavesService();
  let claveHash: string;
  const creados = new Set<string>();
  const enviados: { correo: string; enlace: string }[] = [];
  const correos = {
    habilitado: vi.fn(() => true),
    enviar: vi.fn(async (correo: string, enlace: string) => {
      enviados.push({ correo, enlace });
    }),
  };
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
      return r;
    }
  }
  const navegador = async () => {
    const n = new Navegador();
    await n.preparar();
    return n;
  };
  const usuario = async (
    extra: {
      activo?: boolean;
      claveHash?: string | null;
      rol?: 'CLIENTE' | 'ADMIN';
      correoVerificadoEn?: Date;
    } = {},
  ) => {
    const u = await prisma.usuario.create({
      data: {
        nombres: 'Ana',
        apellidos: 'Recuperación',
        correo: `${prefijo}-${++secuencia}@recovery.test`,
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
  const tokenEnlace = (enlace: string) =>
    new URLSearchParams(new URL(enlace).hash.slice(1)).get('token')!;
  const solicitar = async (correo: string) => {
    const n = await navegador();
    const r = await n.post('recuperacion', { correo });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ mensaje: mensajeSolicitud });
    await servicio.esperarOciosidad();
    return {
      n,
      r,
      token: tokenEnlace(enviados.findLast((e) => e.correo === correo)!.enlace),
    };
  };
  const tokenManual = async (
    usuarioId: string,
    tipo: TipoTokenUsuario = TipoTokenUsuario.RECUPERACION_CLAVE,
  ) => {
    const token = randomBytes(32).toString('base64url');
    const registro = await prisma.tokenUsuario.create({
      data: {
        usuarioId,
        tipo,
        tokenHash: hashIdentificador(token),
        expiraEn: new Date(Date.now() + 30 * 60_000),
      },
    });
    return { token, registro };
  };
  const vigente = async (token: string) => {
    const n = await navegador();
    const r = await n.post('recuperacion/comprobar', { token });
    expect(r.status).toBe(200);
    return r.body.vigente as boolean;
  };

  beforeAll(async () => {
    claveHash = await claves.crear(clave);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CONFIGURACION_AUTH)
      .useValue(crearConfiguracionAuth({}))
      .overrideProvider(CorreosService)
      .useValue(correos)
      // La suite unitaria verifica los límites sin interferir con las demás pruebas HTTP.
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: () => undefined })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    servicio = app.get(RecuperacionService);
  });
  beforeEach(async () => {
    await servicio.esperarOciosidad();
    enviados.length = 0;
    correos.habilitado.mockReturnValue(true);
    correos.enviar.mockReset().mockImplementation(async (correo, enlace) => {
      enviados.push({ correo, enlace });
    });
  });
  afterAll(async () => {
    await servicio?.esperarOciosidad();
    await app?.close();
    const where = { usuarioId: { in: [...creados] } };
    await prisma.sesion.deleteMany({ where });
    await prisma.tokenUsuario.deleteMany({ where });
    await prisma.identidadExterna.deleteMany({ where });
    await prisma.usuario.deleteMany({ where: { id: { in: [...creados] } } });
    await prisma.$disconnect();
  });

  it('devuelve la misma respuesta para cuenta local, inexistente, desactivada y solo Google', async () => {
    const local = await usuario();
    const inactivo = await usuario({ activo: false });
    const google = await usuario({ claveHash: null });
    for (const correo of [
      local.correo,
      `${prefijo}-inexistente@recovery.test`,
      inactivo.correo,
      google.correo,
    ]) {
      const n = await navegador();
      const r = await n.post('recuperacion', { correo });
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ mensaje: mensajeSolicitud });
      expect(r.headers['cache-control']).toBe('no-store');
    }
    await servicio.esperarOciosidad();
    expect(enviados.map((e) => e.correo)).toEqual([local.correo]);
    expect(
      await prisma.tokenUsuario.count({
        where: { usuarioId: { in: [inactivo.id, google.id] } },
      }),
    ).toBe(0);
  });
  it('responde antes de terminar SMTP sin revelar que existe una cuenta', async () => {
    const u = await usuario();
    let terminar!: () => void;
    let inicio!: () => void;
    const iniciado = new Promise<void>((resolve) => {
      inicio = resolve;
    });
    const pendiente = new Promise<void>((resolve) => {
      terminar = resolve;
    });
    correos.enviar.mockImplementation(async (correo, enlace) => {
      enviados.push({ correo, enlace });
      inicio();
      await pendiente;
    });
    const n = await navegador();
    try {
      const r = await n.post('recuperacion', { correo: u.correo });
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ mensaje: mensajeSolicitud });
      await iniciado;
      expect(
        await claves.verificar(
          (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
            .claveHash,
          clave,
        ),
      ).toBe(true);
    } finally {
      terminar();
      await servicio.esperarOciosidad();
    }
  });
  it('guarda únicamente SHA-256 y envía un enlace con fragmento y vencimiento de treinta minutos', async () => {
    const u = await usuario();
    const { r, token } = await solicitar(u.correo);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(r.body)).not.toContain(token);
    const enlace = new URL(enviados[0].enlace);
    expect(enlace.pathname).toBe('/restablecer-contrasena');
    expect(enlace.search).toBe('');
    expect(enlace.username).toBe('');
    expect(enlace.password).toBe('');
    const t = await prisma.tokenUsuario.findUniqueOrThrow({
      where: { tokenHash: hashIdentificador(token) },
    });
    expect(t.usuarioId).toBe(u.id);
    expect(t.tipo).toBe('RECUPERACION_CLAVE');
    expect(t.tokenHash).not.toBe(token);
    expect(t.usadoEn).toBeNull();
    expect(t.revocadoEn).toBeNull();
    expect(t.expiraEn.getTime() - t.creadoEn.getTime()).toBe(30 * 60_000);
    expect(await vigente(token)).toBe(true);
    expect(await vigente(token)).toBe(true);
    expect(
      (await prisma.tokenUsuario.findUniqueOrThrow({ where: { id: t.id } }))
        .usadoEn,
    ).toBeNull();
  });
  it('un nuevo envío correcto revoca enlaces anteriores sin cambiar contraseña ni sesiones', async () => {
    const u = await usuario();
    const sesion = await entrar(u.correo);
    const primero = await solicitar(u.correo);
    const segundo = await solicitar(u.correo);
    expect(segundo.token).not.toBe(primero.token);
    expect(await vigente(primero.token)).toBe(false);
    expect(await vigente(segundo.token)).toBe(true);
    expect(
      await claves.verificar(
        (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
          .claveHash,
        clave,
      ),
    ).toBe(true);
    await sesion.cliente.get('/api/auth/me').expect(200);
  });
  it('un fallo SMTP revoca el token nuevo y conserva el enlace enviado anteriormente', async () => {
    const u = await usuario();
    const anterior = await solicitar(u.correo);
    correos.enviar.mockImplementation(async (correo, enlace) => {
      enviados.push({ correo, enlace });
      throw new Error('detalle SMTP privado');
    });
    const n = await navegador();
    const r = await n.post('recuperacion', { correo: u.correo });
    expect(r.status).toBe(202);
    expect(JSON.stringify(r.body)).not.toContain('SMTP');
    await servicio.esperarOciosidad();
    expect(await vigente(anterior.token)).toBe(true);
    expect(await vigente(tokenEnlace(enviados.at(-1)!.enlace))).toBe(false);
  });
  it('si el envío está deshabilitado responde 503 tanto para una cuenta existente como inexistente', async () => {
    const u = await usuario();
    correos.habilitado.mockReturnValue(false);
    const respuestas = [];
    for (const correo of [u.correo, `${prefijo}-ausente@recovery.test`]) {
      const n = await navegador();
      const r = await n.post('recuperacion', { correo });
      expect(r.status).toBe(503);
      respuestas.push(r.body);
    }
    expect(respuestas[0]).toEqual(respuestas[1]);
    expect(correos.enviar).not.toHaveBeenCalled();
    expect(
      await prisma.tokenUsuario.count({ where: { usuarioId: u.id } }),
    ).toBe(0);
  });
  it('consume una sola vez, cambia el hash y revoca todas las sesiones sin autenticar automáticamente', async () => {
    const u = await usuario({ rol: 'ADMIN' });
    const a = await entrar(u.correo);
    const b = await entrar(u.correo);
    const { token } = await solicitar(u.correo);
    const n = await navegador();
    const r = await n.post('recuperacion/restablecer', {
      token,
      clave: nuevaClave,
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      mensaje:
        'Tu contraseña se actualizó. Inicia sesión con la nueva contraseña.',
    });
    expect(Object.keys(r.body)).not.toContain('usuario');
    const cambiado = await prisma.usuario.findUniqueOrThrow({
      where: { id: u.id },
    });
    expect(cambiado.rol).toBe('ADMIN');
    expect(cambiado.correoVerificadoEn).toBeNull();
    expect(cambiado.correo).toBe(u.correo);
    expect(cambiado.claveHash).not.toBe(claveHash);
    expect(await claves.verificar(cambiado.claveHash, nuevaClave)).toBe(true);
    expect(await claves.verificar(cambiado.claveHash, clave)).toBe(false);
    expect(
      await prisma.sesion.count({
        where: { usuarioId: u.id, revocadaEn: null },
      }),
    ).toBe(0);
    await a.cliente.get('/api/auth/me').expect(401);
    await b.cliente.get('/api/auth/me').expect(401);
    await n.cliente.get('/api/auth/me').expect(401);
    expect(await vigente(token)).toBe(false);
    const usado = await prisma.tokenUsuario.findUniqueOrThrow({
      where: { tokenHash: hashIdentificador(token) },
    });
    expect(usado.usadoEn).not.toBeNull();
    await n.preparar();
    const repetido = await n.post('recuperacion/restablecer', {
      token,
      clave: 'otra contraseña sintética de prueba',
    });
    expect(repetido.status).toBe(400);
    expect(repetido.body.codigo).toBe('RECUPERACION_ENLACE_INVALIDO');
    const login = await navegador();
    expect(
      (await login.post('login', { correo: u.correo, clave })).status,
    ).toBe(401);
    await login.preparar();
    expect(
      (await login.post('login', { correo: u.correo, clave: nuevaClave }))
        .status,
    ).toBe(200);
  });
  it('restablecer revoca los demás tokens de recuperación, sin consumir los de verificación', async () => {
    const u = await usuario();
    const a = await tokenManual(u.id);
    const b = await tokenManual(u.id);
    const verificacion = await tokenManual(
      u.id,
      TipoTokenUsuario.VERIFICACION_CORREO,
    );
    const n = await navegador();
    expect(
      (
        await n.post('recuperacion/restablecer', {
          token: a.token,
          clave: nuevaClave,
        })
      ).status,
    ).toBe(200);
    expect(await vigente(b.token)).toBe(false);
    const v = await prisma.tokenUsuario.findUniqueOrThrow({
      where: { id: verificacion.registro.id },
    });
    expect(v.usadoEn).toBeNull();
    expect(v.revocadoEn).toBeNull();
  });
  it('rechaza un enlace vencido, revocado o de otro propósito sin cambiar la contraseña', async () => {
    const u = await usuario();
    const expirado = await tokenManual(u.id);
    const revocado = await tokenManual(u.id);
    const verificacion = await tokenManual(
      u.id,
      TipoTokenUsuario.VERIFICACION_CORREO,
    );
    await prisma.tokenUsuario.update({
      where: { id: expirado.registro.id },
      data: {
        creadoEn: new Date(Date.now() - 40 * 60_000),
        expiraEn: new Date(Date.now() - 10 * 60_000),
      },
    });
    await prisma.tokenUsuario.update({
      where: { id: revocado.registro.id },
      data: { revocadoEn: new Date() },
    });
    for (const token of [
      expirado.token,
      revocado.token,
      verificacion.token,
      randomBytes(32).toString('base64url'),
    ]) {
      expect(await vigente(token)).toBe(false);
      const n = await navegador();
      const r = await n.post('recuperacion/restablecer', {
        token,
        clave: nuevaClave,
      });
      expect(r.status).toBe(400);
      expect(r.body.codigo).toBe('RECUPERACION_ENLACE_INVALIDO');
    }
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
        .claveHash,
    ).toBe(claveHash);
  });
  it('rechaza tokens de cuentas desactivadas o sin contraseña local, aunque existan en la tabla', async () => {
    for (const extra of [{ activo: false }, { claveHash: null }]) {
      const u = await usuario(extra);
      const { token } = await tokenManual(u.id);
      expect(await vigente(token)).toBe(false);
      const n = await navegador();
      const r = await n.post('recuperacion/restablecer', {
        token,
        clave: nuevaClave,
      });
      expect(r.status).toBe(400);
      expect(r.body.codigo).toBe('RECUPERACION_ENLACE_INVALIDO');
      expect(
        (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } }))
          .claveHash,
      ).toBe(u.claveHash);
    }
  });
  it('serializa dos restablecimientos concurrentes para que solo uno cambie la contraseña', async () => {
    const u = await usuario();
    const { token } = await solicitar(u.correo);
    const a = await navegador();
    const b = await navegador();
    const clavesNuevas = [
      'primera contraseña sintética nueva',
      'segunda contraseña sintética nueva',
    ];
    const respuestas = await Promise.all([
      a.post('recuperacion/restablecer', { token, clave: clavesNuevas[0] }),
      b.post('recuperacion/restablecer', { token, clave: clavesNuevas[1] }),
    ]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 400,
    ]);
    const hash = (
      await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } })
    ).claveHash;
    for (let i = 0; i < respuestas.length; i++)
      expect(await claves.verificar(hash, clavesNuevas[i])).toBe(
        respuestas[i].status === 200,
      );
  });
  it('impide que un login que ya verificó el hash anterior cree una sesión después del cambio', async () => {
    const u = await usuario();
    const { token } = await solicitar(u.correo);
    const login = await navegador();
    const cambio = await navegador();
    const verificador = app.get(ClavesService);
    const verificarOriginal = verificador.verificar.bind(verificador);
    let continuar!: () => void;
    let avisar!: () => void;
    const bloqueado = new Promise<void>((resolve) => {
      continuar = resolve;
    });
    const verificado = new Promise<void>((resolve) => {
      avisar = resolve;
    });
    const verificar = vi
      .spyOn(verificador, 'verificar')
      .mockImplementation(async (hash, valor) => {
        const correcto = await verificarOriginal(hash, valor);
        if (correcto && hash === claveHash && valor === clave) {
          avisar();
          await bloqueado;
        }
        return correcto;
      });
    const pendiente = login.post('login', { correo: u.correo, clave });
    try {
      await verificado;
      expect(
        (
          await cambio.post('recuperacion/restablecer', {
            token,
            clave: nuevaClave,
          })
        ).status,
      ).toBe(200);
    } finally {
      continuar();
      verificar.mockRestore();
    }
    expect((await pendiente).status).toBe(401);
    expect(
      await prisma.sesion.count({
        where: { usuarioId: u.id, revocadaEn: null },
      }),
    ).toBe(0);
  });
  it('exige CSRF en las tres operaciones y rechaza datos privilegiados o mal formados', async () => {
    for (const ruta of [
      'recuperacion',
      'recuperacion/comprobar',
      'recuperacion/restablecer',
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/' + ruta)
        .set('Origin', 'http://localhost:4200')
        .send({})
        .expect(403);
    }
    const n = await navegador();
    for (const datos of [
      { correo: 'sin-correo' },
      { correo: 'ana@recovery.test', rol: 'ADMIN' },
    ])
      expect((await n.post('recuperacion', datos)).status).toBe(400);
    expect(
      (await n.post('recuperacion/comprobar', { token: 'incorrecto' })).status,
    ).toBe(400);
    expect(
      (
        await n.post('recuperacion/restablecer', {
          token: 'a'.repeat(43),
          clave: 'corta',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await n.post('recuperacion/restablecer', {
          token: 'a'.repeat(43),
          clave: nuevaClave,
          usuarioId: 'ajeno',
        })
      ).status,
    ).toBe(400);
  });
});
