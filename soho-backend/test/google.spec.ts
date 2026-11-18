import { generateKeyPairSync, sign } from 'node:crypto';
import type { Response } from 'express';
import { crearConfiguracionAuth } from '../src/autenticacion/seguridad/configuracion-auth.js';
import type { PeticionAuth } from '../src/autenticacion/sesiones/contexto-auth.js';
import { DesafiosGoogleService } from '../src/autenticacion/google/desafios-google.service.js';
import { VerificadorGoogleService } from '../src/autenticacion/google/verificador-google.service.js';
import {
  leerGoogle,
  leerVinculacionGoogle,
} from '../src/autenticacion/google/datos-google.js';

const clientId = '123456-prueba.apps.googleusercontent.com';
const config = () => crearConfiguracionAuth({ GOOGLE_CLIENT_ID: clientId });
const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const base = () => ({
  iss: 'https://accounts.google.com',
  aud: clientId,
  sub: 'google-123',
  email: 'ana@gmail.com',
  email_verified: true,
  nonce: 'nonce-prueba',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300,
  given_name: 'Ana',
  family_name: 'Prueba',
});
const jwt = (
  cambios: Record<string, unknown> = {},
  algoritmo = 'RS256',
  otraFirma = false,
) => {
  const contenido = [
    Buffer.from(JSON.stringify({ alg: algoritmo, kid: 'prueba' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify({ ...base(), ...cambios })).toString(
      'base64url',
    ),
  ].join('.');
  return `${contenido}.${sign('RSA-SHA256', Buffer.from(contenido), otraFirma ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey : par.privateKey).toString('base64url')}`;
};

describe('Verificación criptográfica de Google con certificados sintéticos', () => {
  let verificador: VerificadorGoogleService;
  beforeEach(() => {
    verificador = new VerificadorGoogleService(config());
    type Certificados = Awaited<
      ReturnType<typeof verificador.cliente.getFederatedSignonCertsAsync>
    >;
    vi.spyOn(
      verificador.cliente,
      'getFederatedSignonCertsAsync',
    ).mockResolvedValue({
      certs: {
        prueba: par.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      },
      format: 'PEM' as Certificados['format'],
    });
  });
  it('valida la firma real, normaliza el correo y utiliza sub como identidad', async () => {
    expect(
      await verificador.verificar(
        jwt({ email: 'ANA@GMAIL.COM', rol: 'ADMIN' }),
        'nonce-prueba',
      ),
    ).toEqual({
      sub: 'google-123',
      correo: 'ana@gmail.com',
      correoConfiable: true,
      nombres: 'Ana',
      apellidos: 'Prueba',
    });
  });
  it.each([
    { aud: 'otro-cliente' },
    { iss: 'https://atacante.test' },
    { exp: Math.floor(Date.now() / 1000) - 10 },
    { iat: Math.floor(Date.now() / 1000) + 120 },
    { nonce: 'otro-nonce' },
    { email_verified: false },
    { sub: 'con espacio' },
    { email: 'sin-correo' },
  ])('rechaza las reclamaciones inválidas: %j', async (cambios) => {
    await expect(
      verificador.verificar(jwt(cambios), 'nonce-prueba'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rechaza una firma ajena y algoritmos diferentes de RS256', async () => {
    await expect(
      verificador.verificar(jwt({}, 'RS256', true), 'nonce-prueba'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      verificador.verificar(jwt({}, 'HS256'), 'nonce-prueba'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('distingue el correo administrado por Google de un correo externo', async () => {
    expect(
      (
        await verificador.verificar(
          jwt({ email: 'ana@externo.test' }),
          'nonce-prueba',
        )
      ).correoConfiable,
    ).toBe(false);
    expect(
      (
        await verificador.verificar(
          jwt({ email: 'ana@empresa.test', hd: 'empresa.test' }),
          'nonce-prueba',
        )
      ).correoConfiable,
    ).toBe(true);
  });
  it('no expone errores de red ni credenciales', async () => {
    vi.spyOn(
      verificador.cliente,
      'getFederatedSignonCertsAsync',
    ).mockRejectedValue(
      Object.assign(new Error('detalle privado'), { code: 'ETIMEDOUT' }),
    );
    await expect(
      verificador.verificar(jwt(), 'nonce-prueba'),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('permanece deshabilitado sin un cliente configurado', async () => {
    await expect(
      new VerificadorGoogleService(crearConfiguracionAuth({})).verificar(
        jwt(),
        'nonce-prueba',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('Desafíos de Google ligados al navegador', () => {
  let servicio: DesafiosGoogleService;
  let secreto: string;
  let res: Response;
  let guardarCookie: ReturnType<typeof vi.fn>;
  const req = (sesion = '') =>
    ({
      headers: {
        cookie: `soho_google=${secreto};${sesion ? ` soho_sesion=${sesion}` : ''}`,
      },
    }) as PeticionAuth;
  beforeEach(() => {
    servicio = new DesafiosGoogleService(config());
    guardarCookie = vi.fn((_nombre, valor) => {
      secreto = valor;
    });
    res = {
      cookie: guardarCookie,
      clearCookie: vi.fn(),
    } as unknown as Response;
  });
  afterEach(() => vi.restoreAllMocks());
  const emitir = (sesion = '') => servicio.emitir(req(sesion), res, 'acceso');
  it('separa el nonce público de la cookie HttpOnly y evita concurrencia y reutilización', () => {
    const d = emitir();
    expect(secreto).not.toBe(d.nonce);
    expect(guardarCookie).toHaveBeenCalledWith(
      'soho_google',
      secreto,
      expect.objectContaining({ httpOnly: true, maxAge: 300000 }),
    );
    const reserva = servicio.reservar(req(), 'acceso');
    expect(reserva.nonce).toBe(d.nonce);
    expect(() => servicio.reservar(req(), 'acceso')).toThrow();
    reserva.finalizar();
    expect(() => servicio.reservar(req(), 'acceso')).toThrow();
  });
  it('permite completar nombres con el mismo desafío después de un 422', () => {
    emitir();
    servicio.reservar(req(), 'acceso').finalizar(true);
    expect(() => servicio.reservar(req(), 'acceso')).not.toThrow();
  });
  it('rechaza un propósito diferente, otra sesión y desafíos vencidos', () => {
    emitir('a'.repeat(43));
    expect(() =>
      servicio.reservar(req('a'.repeat(43)), 'vinculacion'),
    ).toThrow();
    expect(() => servicio.reservar(req('b'.repeat(43)), 'acceso')).toThrow();
    const ahora = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(ahora + 300001);
    expect(() => servicio.reservar(req('a'.repeat(43)), 'acceso')).toThrow();
  });
  it('invalida el desafío anterior al volver a intentarlo o al cerrar sesión', () => {
    emitir();
    const anterior = req();
    emitir();
    expect(() => servicio.reservar(anterior, 'acceso')).toThrow();
    servicio.invalidar(req(), res);
    expect(() => servicio.reservar(req(), 'acceso')).toThrow();
  });
});

describe('Contrato de entrada Google', () => {
  it('rechaza roles, campos adicionales y credenciales mal formadas', () => {
    expect(() => leerGoogle({ credential: 'a.b.c', rol: 'ADMIN' })).toThrow();
    expect(() => leerGoogle({ credential: 'incorrecto' })).toThrow();
    expect(() =>
      leerGoogle({
        credential: 'a.b.c',
        perfil: { nombres: 'Ana', apellidos: 'Prueba', rol: 'ADMIN' },
      }),
    ).toThrow();
    expect(() =>
      leerVinculacionGoogle({ credential: 'a.b.c', clave: '' }),
    ).toThrow();
    expect(
      leerGoogle({
        credential: 'a.b.c',
        perfil: { nombres: ' Ana ', apellidos: ' Prueba ' },
      }),
    ).toEqual({
      credential: 'a.b.c',
      perfil: { nombres: 'Ana', apellidos: 'Prueba' },
    });
  });
});
