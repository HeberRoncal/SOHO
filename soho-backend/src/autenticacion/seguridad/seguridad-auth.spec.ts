import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { crearConfiguracionAuth } from './configuracion-auth.js';
import { leerCookie } from '../sesiones/cookies-auth.js';
import { CsrfService } from './csrf.service.js';
import { ClavesService } from './claves.service.js';
import { LimitesAuthService } from './limites-auth.service.js';

describe('Configuración de autenticación', () => {
  it('exige orígenes HTTPS y secreto explícito en producción', () => {
    expect(() => crearConfiguracionAuth({ NODE_ENV: 'production' })).toThrow();
    expect(() =>
      crearConfiguracionAuth({
        NODE_ENV: 'production',
        AUTH_ORIGENES: 'http://soho.test',
        AUTH_SECRETO_CSRF: 'a'.repeat(48),
      }),
    ).toThrow();
    const config = crearConfiguracionAuth({
      NODE_ENV: 'production',
      AUTH_ORIGENES: 'https://soho.test',
      AUTH_SECRETO_CSRF: randomBytes(48).toString('base64url'),
    });
    expect(config.cookies).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(config.cookieSesion).toBe('__Host-soho_sesion');
    expect(config.cookies.domain).toBeUndefined();
  });
  it.each([
    'https://soho.test/',
    'https://soho.test/ruta',
    '*',
    'https://usuario:clave@soho.test',
  ])('rechaza un origen ambiguo: %s', (origen) => {
    expect(() => crearConfiguracionAuth({ AUTH_ORIGENES: origen })).toThrow();
  });
  it('rechaza secretos de ejemplo o demasiado cortos', () => {
    expect(() =>
      crearConfiguracionAuth({ AUTH_SECRETO_CSRF: 'corto' }),
    ).toThrow();
    expect(() =>
      crearConfiguracionAuth({
        AUTH_SECRETO_CSRF: 'REEMPLAZAR_CON_EL_SECRETO_GENERADO',
      }),
    ).toThrow();
  });
});

describe('Cookies y CSRF', () => {
  const config = crearConfiguracionAuth({});
  const csrf = new CsrfService(config);
  const nonce = 'a'.repeat(43);
  const sesion = 'b'.repeat(43);
  const peticion = (cookie: string, cabeceras: Record<string, string> = {}) =>
    ({
      headers: { cookie },
      get: (nombre: string) => cabeceras[nombre],
      is: () => 'application/json',
    }) as unknown as Request;
  it('rechaza cookies repetidas y valores ajenos al formato de sesión', () => {
    expect(
      leerCookie(
        peticion(`soho_sesion=${sesion}; soho_sesion=${sesion}`),
        'soho_sesion',
      ),
    ).toBeUndefined();
    expect(
      leerCookie(peticion('soho_sesion=%00'), 'soho_sesion'),
    ).toBeUndefined();
    expect(
      leerCookie(peticion(`otra=x; soho_sesion=${sesion}`), 'soho_sesion'),
    ).toBe(sesion);
  });
  it('vincula el token CSRF a la sesión y exige origen y cabecera', () => {
    const cookie = `soho_csrf=${nonce}; soho_sesion=${sesion}`;
    const res = { cookie: vi.fn() } as unknown as Response;
    const token = csrf.emitir(peticion(cookie), res);
    const headers = { origin: 'http://localhost:4200', 'x-csrf-token': token };
    expect(() => csrf.validar(peticion(cookie, headers))).not.toThrow();
    expect(() =>
      csrf.validar(
        peticion(`soho_csrf=${nonce}; soho_sesion=${'c'.repeat(43)}`, headers),
      ),
    ).toThrow();
    expect(() =>
      csrf.validar(
        peticion(cookie, { ...headers, origin: 'https://ajeno.test' }),
      ),
    ).toThrow();
    expect(() =>
      csrf.validar(peticion(cookie, { 'x-csrf-token': token })),
    ).toThrow();
    expect(() =>
      csrf.validar(peticion(cookie, { origin: headers.origin })),
    ).toThrow();
    expect(() =>
      csrf.validar(
        peticion(cookie, { ...headers, 'sec-fetch-site': 'cross-site' }),
      ),
    ).toThrow();
  });
  it('admite multipart solo cuando la ruta lo autoriza y conserva el token y el origen', () => {
    const cookie = `soho_csrf=${nonce}; soho_sesion=${sesion}`,
      token = csrf.emitir(peticion(cookie), {
        cookie: vi.fn(),
      } as unknown as Response);
    const req = peticion(cookie, {
      origin: 'http://localhost:4200',
      'x-csrf-token': token,
    });
    const esMultipart = ((tipo: string) =>
      tipo === 'multipart/form-data'
        ? 'multipart/form-data'
        : false) as Request['is'];
    req.is = esMultipart;
    expect(() => csrf.validar(req, true)).not.toThrow();
    expect(() => csrf.validar(req)).toThrow();
    const ajena = peticion(cookie, {
      origin: 'https://ajeno.test',
      'x-csrf-token': token,
    });
    ajena.is = esMultipart;
    expect(() => csrf.validar(ajena, true)).toThrow();
    const sinToken = peticion(cookie, { origin: 'http://localhost:4200' });
    sinToken.is = esMultipart;
    expect(() => csrf.validar(sinToken, true)).toThrow();
  });
});

describe('Contraseñas Argon2id', () => {
  it('usa salts distintos y verifica credenciales sin aceptar ausencia de hash', async () => {
    const servicio = new ClavesService();
    const clave = ' contraseña de prueba segura ';
    const [a, b] = await Promise.all([
      servicio.crear(clave),
      servicio.crear(clave),
    ]);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(await servicio.verificar(a, clave)).toBe(true);
    expect(await servicio.verificar(a, clave.trim())).toBe(false);
    expect(await servicio.verificar(null, clave)).toBe(false);
    expect(
      await servicio.verificar(a.replace('m=19456', 'm=999999999'), clave),
    ).toBe(false);
  });
});

describe('Límites de acceso', () => {
  afterEach(() => vi.restoreAllMocks());
  it('limita por cuenta incluso cambiando de IP y libera la ventana al vencer', () => {
    let ahora = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => ahora);
    const limites = new LimitesAuthService();
    const req = (ip: string) =>
      ({ ip, body: { correo: ' ANA@SOHO.TEST ' } }) as Request;
    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Response;
    for (let i = 0; i < 10; i++)
      limites.comprobar('login', req(String(i)), res);
    expect(() => limites.comprobar('login', req('otra'), res)).toThrow();
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 900);
    ahora += 900001;
    expect(() => limites.comprobar('login', req('otra'), res)).not.toThrow();
  });
  it('limita los registros por IP aunque se cambie de correo', () => {
    const limites = new LimitesAuthService();
    const res = { setHeader: vi.fn() } as unknown as Response;
    for (let i = 0; i < 10; i++)
      limites.comprobar(
        'registro',
        { ip: 'local', body: { correo: `${i}@soho.test` } } as Request,
        res,
      );
    expect(() =>
      limites.comprobar('registro', { ip: 'local', body: {} } as Request, res),
    ).toThrow();
  });
});
