import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AutenticacionModule } from '../src/autenticacion/autenticacion.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma } from '../src/generated/prisma/client.js';

describe('Protecciones HTTP de autenticación sin base de datos', () => {
  let app: INestApplication;
  let cookie: string;
  let csrf: string;
  const buscar = vi.fn();
  const transaccion = vi.fn();
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AutenticacionModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ usuario: { findUnique: buscar }, $transaction: transaccion })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    const respuesta = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .expect(200);
    cookie = (respuesta.headers['set-cookie'] as unknown as string[])
      .map((valor) => valor.split(';')[0])
      .join('; ');
    csrf = respuesta.body.csrfToken as string;
    expect(respuesta.headers['cache-control']).toBe('no-store');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    buscar.mockReset().mockResolvedValue(null);
    transaccion.mockReset();
  });

  it('exige sesión para consultar /me', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });
  it('bloquea login sin CSRF antes de consultar usuarios', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:4200')
      .send({ correo: 'ana@http.test', clave: 'prueba de contraseña' })
      .expect(403);
    expect(buscar).not.toHaveBeenCalled();
  });
  it('bloquea orígenes ajenos incluso con un token válido', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://ajeno.test')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ correo: 'ana@http.test', clave: 'prueba de contraseña' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Origin', 'https://ajeno.test')
      .expect(403);
  });
  it('rechaza formularios simples aunque presenten el token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .type('form')
      .send({ correo: 'ana@http.test', clave: 'prueba de contraseña' })
      .expect(415);
  });
  it('oculta errores de persistencia tanto en login como en el guard de sesión', async () => {
    const error = () =>
      new Prisma.PrismaClientKnownRequestError(
        'mysql://dato-privado SQL interno',
        { code: 'P1001', clientVersion: '7.10.1' },
      );
    buscar.mockRejectedValue(error());
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ correo: 'error@http.test', clave: 'prueba de contraseña' })
      .expect(503);
    transaccion.mockRejectedValue(error());
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `soho_sesion=${'x'.repeat(43)}`)
      .expect(503);
    for (const respuesta of [login, me]) {
      expect(JSON.stringify(respuesta.body)).not.toMatch(/mysql|privado|SQL/);
      expect(respuesta.headers['cache-control']).toBe('no-store');
    }
  });
  it('responde 429 y Retry-After al superar diez intentos para una cuenta', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:4200')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .send({ correo: 'limite@http.test', clave: 'incorrecta' })
        .expect(401);
    }
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ correo: 'limite@http.test', clave: 'incorrecta' })
      .expect(429);
    expect(Number(respuesta.headers['retry-after'])).toBeGreaterThan(0);
  });
});
