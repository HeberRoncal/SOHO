import { Controller, Get, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response as RespuestaPrueba } from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  crearClientePrisma,
  obtenerUrlBaseDatos,
} from '../src/prisma/cliente-prisma.js';
import { RolUsuario } from '../src/generated/prisma/client.js';
import { Roles } from '../src/autenticacion/seguridad/auth.decoradores.js';
import { ClavesService } from '../src/autenticacion/seguridad/claves.service.js';
import { hashIdentificador } from '../src/autenticacion/sesiones/cookies-auth.js';
import { crearAdministrador } from '../src/autenticacion/acceso/crear-administrador.js';
import { LimitesAuthService } from '../src/autenticacion/seguridad/limites-auth.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(obtenerUrlBaseDatos(url)).pathname.endsWith('_test')) {
  throw new Error(
    'TEST_DATABASE_URL debe apuntar a una base vacía exclusiva de pruebas con sufijo _test.',
  );
}
const prisma = crearClientePrisma(url);

// Superficie exclusiva de pruebas: verifica que los guards se aplican globalmente.
@Controller('pruebas-rbac')
class PruebaRbacController {
  @Roles(RolUsuario.ADMIN)
  @Get('admin')
  admin() {
    return { permitido: true };
  }
  @Roles(RolUsuario.CLIENTE)
  @Get('cliente')
  cliente() {
    return { permitido: true };
  }
  @Get('privado') privado() {
    return { permitido: true };
  }
}
@Module({ imports: [AppModule], controllers: [PruebaRbacController] })
class PruebasAuthModule {}

describe.sequential('Autenticación y RBAC con MySQL real aislado', () => {
  let app: INestApplication;
  const clave = 'contraseña sintética para pruebas';
  const claves = new ClavesService();
  let claveHash: string;
  let secuencia = 0;
  const correoNuevo = () => `cuenta-${++secuencia}@auth.test`;
  const datos = () => ({
    nombres: 'Ana',
    apellidos: 'Prueba',
    correo: correoNuevo(),
    clave,
  });

  class Navegador {
    cliente = request.agent(app.getHttpServer());
    csrf = '';
    async preparar() {
      const r = await this.cliente.get('/api/auth/csrf').expect(200);
      this.csrf = r.body.csrfToken as string;
    }
    async post(ruta: string, cuerpo: Record<string, unknown>) {
      const r = await this.cliente
        .post(ruta)
        .set('Origin', 'http://localhost:4200')
        .set('X-CSRF-Token', this.csrf)
        .send(cuerpo);
      if (r.body.csrfToken) this.csrf = r.body.csrfToken as string;
      return r;
    }
  }
  const navegador = async () => {
    const n = new Navegador();
    await n.preparar();
    return n;
  };
  const cookieSesion = (r: RespuestaPrueba) =>
    (r.headers['set-cookie'] as unknown as string[])
      .find((valor) => valor.startsWith('soho_sesion='))!
      .split(';')[0];
  const buscarSesion = (r: RespuestaPrueba) =>
    prisma.sesion.findUniqueOrThrow({
      where: {
        tokenHash: hashIdentificador(
          cookieSesion(r).slice('soho_sesion='.length),
        ),
      },
    });
  const crearUsuario = (
    extra: {
      activo?: boolean;
      claveHash?: string | null;
      rol?: RolUsuario;
    } = {},
  ) =>
    prisma.usuario.create({
      data: {
        nombres: 'Ana',
        apellidos: 'Prueba',
        correo: correoNuevo(),
        claveHash,
        ...extra,
      },
    });
  const entrar = async () => {
    const usuario = await crearUsuario();
    const n = await navegador();
    const respuesta = await n.post('/api/auth/login', {
      correo: usuario.correo,
      clave,
    });
    expect(respuesta.status).toBe(200);
    return { n, usuario, respuesta, sesion: await buscarSesion(respuesta) };
  };

  beforeAll(async () => {
    if (await prisma.usuario.count())
      throw new Error(
        'Las pruebas requieren una base sin cuentas; no se borraron datos.',
      );
    claveHash = await claves.crear(clave);
    const modulo = await Test.createTestingModule({
      imports: [PruebasAuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      // Los límites se verifican con los guards reales en las pruebas HTTP sin BD.
      .overrideProvider(LimitesAuthService)
      .useValue({ comprobar: () => undefined })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('mantiene público el catálogo y exige autenticación por defecto', async () => {
    await request(app.getHttpServer())
      .get('/api/productos?limite=1')
      .expect(200);
    await request(app.getHttpServer()).get('/pruebas-rbac/privado').expect(401);
    await request(app.getHttpServer()).get('/pruebas-rbac/admin').expect(401);
  });
  it('registra un CLIENTE, inicia sesión y guarda solo el hash del identificador', async () => {
    const n = await navegador();
    const entrada = datos();
    const r = await n.post('/api/auth/registro', {
      ...entrada,
      correo: entrada.correo.toUpperCase(),
    });
    expect(r.status).toBe(201);
    expect(r.body.usuario).toMatchObject({
      correo: entrada.correo,
      rol: 'CLIENTE',
      correoVerificado: false,
    });
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { correo: entrada.correo },
    });
    expect(await claves.verificar(usuario.claveHash, clave)).toBe(true);
    const sesion = await buscarSesion(r);
    expect(sesion.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sesion.tokenHash).not.toBe(
      cookieSesion(r).slice('soho_sesion='.length),
    );
    expect(sesion.expiraEn.getTime() - sesion.creadaEn.getTime()).toBe(
      12 * 60 * 60 * 1000,
    );
    const cookies = r.headers['set-cookie'] as unknown as string[];
    expect(cookies.find((valor) => valor.startsWith('soho_sesion='))).toMatch(
      /HttpOnly; SameSite=Lax/,
    );
    expect(JSON.stringify(r.body)).not.toMatch(
      /claveHash|clave_hash|tokenHash|revocadaEn|argon2/,
    );
    const me = await n.cliente.get('/api/auth/me').expect(200);
    expect(me.body.usuario.id).toBe(usuario.id);
  });
  it('rechaza roles enviados por el navegador y contraseñas débiles', async () => {
    const n = await navegador();
    const entrada = datos();
    expect(
      (await n.post('/api/auth/registro', { ...entrada, rol: 'ADMIN' })).status,
    ).toBe(400);
    expect(
      (await n.post('/api/auth/registro', { ...entrada, clave: 'corta' }))
        .status,
    ).toBe(400);
    expect(
      await prisma.usuario.findUnique({ where: { correo: entrada.correo } }),
    ).toBeNull();
  });
  it('un correo duplicado no sobrescribe contraseña ni rol', async () => {
    const usuario = await crearUsuario({ rol: RolUsuario.ADMIN });
    const n = await navegador();
    const r = await n.post('/api/auth/registro', {
      ...datos(),
      correo: usuario.correo.toUpperCase(),
    });
    expect(r.status).toBe(409);
    expect(
      await prisma.usuario.findUnique({ where: { id: usuario.id } }),
    ).toEqual(usuario);
  });
  it('usa el mismo error para clave incorrecta, cuenta inexistente, inactiva y solo Google', async () => {
    const normal = await crearUsuario();
    const inactivo = await crearUsuario({ activo: false });
    const google = await crearUsuario({ claveHash: null });
    await prisma.identidadExterna.create({
      data: {
        usuarioId: google.id,
        proveedor: 'GOOGLE',
        identificadorProveedor: 'sub-sintetico-solo-google',
      },
    });
    const n = await navegador();
    for (const correo of [
      normal.correo,
      inactivo.correo,
      google.correo,
      'no-existe@auth.test',
    ]) {
      const r = await n.post('/api/auth/login', {
        correo,
        clave: correo === normal.correo ? 'incorrecta' : clave,
      });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Correo o contraseña incorrectos.');
    }
    expect(
      await prisma.sesion.count({
        where: { usuarioId: { in: [normal.id, inactivo.id, google.id] } },
      }),
    ).toBe(0);
  });
  it('rota la sesión al volver a entrar y vincula el nuevo CSRF a ella', async () => {
    const { n, usuario, respuesta, sesion } = await entrar();
    const csrfAnterior = n.csrf;
    const nueva = await n.post('/api/auth/login', {
      correo: usuario.correo,
      clave,
    });
    expect(nueva.status).toBe(200);
    expect(cookieSesion(nueva)).not.toBe(cookieSesion(respuesta));
    expect(
      (await prisma.sesion.findUniqueOrThrow({ where: { id: sesion.id } }))
        .revocadaEn,
    ).not.toBeNull();
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookieSesion(respuesta))
      .expect(401);
    await n.cliente
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:4200')
      .set('X-CSRF-Token', csrfAnterior)
      .send({})
      .expect(403);
    await n.cliente.get('/api/auth/me').expect(200);
  });
  it('devuelve siempre la cuenta de la sesión y no acepta un usuario elegido en la URL', async () => {
    const { n, usuario } = await entrar();
    const otro = await crearUsuario();
    const r = await n.cliente
      .get(`/api/auth/me?usuarioId=${otro.id}`)
      .expect(200);
    expect(r.body.usuario.id).toBe(usuario.id);
  });
  it('bloquea CLIENTE en rutas ADMIN y aplica los cambios de rol sin volver a entrar', async () => {
    const { n, usuario } = await entrar();
    await n.cliente.get('/pruebas-rbac/admin').expect(403);
    await n.cliente.get('/pruebas-rbac/cliente').expect(200);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { rol: 'ADMIN' },
    });
    await n.cliente.get('/pruebas-rbac/admin').expect(200);
    await n.cliente.get('/pruebas-rbac/cliente').expect(403);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { rol: 'CLIENTE' },
    });
    await n.cliente.get('/pruebas-rbac/admin').expect(403);
  });
  it('revoca y rechaza la sesión cuando se desactiva la cuenta', async () => {
    const { n, usuario, sesion } = await entrar();
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { activo: false },
    });
    await n.cliente.get('/api/auth/me').expect(401);
    expect(
      (await prisma.sesion.findUniqueOrThrow({ where: { id: sesion.id } }))
        .revocadaEn,
    ).not.toBeNull();
  });
  it.each(['absoluto', 'inactividad'] as const)(
    'rechaza vencimiento por %s y no renueva la vigencia absoluta',
    async (tipo) => {
      const { n, sesion } = await entrar();
      const ahora = Date.now();
      await prisma.sesion.update({
        where: { id: sesion.id },
        data:
          tipo === 'absoluto'
            ? {
                creadaEn: new Date(ahora - 7200000),
                ultimaActividadEn: new Date(ahora - 7200000),
                expiraEn: new Date(ahora - 3600000),
              }
            : {
                creadaEn: new Date(ahora - 3600000),
                ultimaActividadEn: new Date(ahora - 31 * 60000),
              },
      });
      await n.cliente.get('/api/auth/me').expect(401);
      expect(
        (await prisma.sesion.findUniqueOrThrow({ where: { id: sesion.id } }))
          .revocadaEn,
      ).not.toBeNull();
    },
  );
  it('el cierre de sesión exige CSRF, revoca en BD y retira las cookies', async () => {
    const { n, sesion, respuesta } = await entrar();
    await n.cliente
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:4200')
      .send({})
      .expect(403);
    const r = await n.post('/api/auth/logout', {});
    expect(r.status).toBe(204);
    expect(
      (r.headers['set-cookie'] as unknown as string[]).join(';'),
    ).toContain('Expires=Thu, 01 Jan 1970');
    expect(
      (await prisma.sesion.findUniqueOrThrow({ where: { id: sesion.id } }))
        .revocadaEn,
    ).not.toBeNull();
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookieSesion(respuesta))
      .expect(401);
  });
  it('rechaza identificadores inventados, duplicados y sesiones revocadas', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `soho_sesion=${'z'.repeat(43)}`)
      .expect(401);
    const { respuesta, sesion } = await entrar();
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${cookieSesion(respuesta)}; ${cookieSesion(respuesta)}`)
      .expect(401);
    await prisma.sesion.update({
      where: { id: sesion.id },
      data: { revocadaEn: new Date() },
    });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookieSesion(respuesta))
      .expect(401);
  });
  it('crea administradores mediante el comando compartido sin promover cuentas existentes', async () => {
    const entrada = datos();
    const admin = await crearAdministrador(prisma, claves, entrada);
    expect(admin.rol).toBe('ADMIN');
    const n = await navegador();
    expect(
      (await n.post('/api/auth/login', { correo: entrada.correo, clave }))
        .status,
    ).toBe(200);
    await n.cliente.get('/pruebas-rbac/admin').expect(200);
    const cliente = await crearUsuario();
    await expect(
      crearAdministrador(prisma, claves, {
        ...datos(),
        correo: cliente.correo,
      }),
    ).rejects.toThrow('Ya existe una cuenta');
    expect(
      await prisma.usuario.findUnique({ where: { id: cliente.id } }),
    ).toEqual(cliente);
  });
});
