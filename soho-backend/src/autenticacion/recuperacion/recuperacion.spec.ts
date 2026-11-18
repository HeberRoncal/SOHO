import type { Request, Response } from 'express';
import { LimitesAuthService } from '../seguridad/limites-auth.service.js';
import {
  leerSolicitudRecuperacion,
  leerTokenRecuperacion,
  leerRestablecimiento,
} from './datos-recuperacion.js';

describe('Datos de recuperación', () => {
  const token = 'a'.repeat(43);
  it('normaliza únicamente el correo y conserva espacios significativos de la contraseña', () => {
    expect(leerSolicitudRecuperacion({ correo: ' ANA@SOHO.TEST ' })).toEqual({
      correo: 'ana@soho.test',
    });
    expect(leerTokenRecuperacion({ token })).toEqual({ token });
    const clave = ' contraseña nueva con espacios ';
    expect(leerRestablecimiento({ token, clave })).toEqual({ token, clave });
  });
  it.each([
    null,
    [],
    {},
    { correo: 'sin-correo' },
    { correo: 'ana@soho.test', rol: 'ADMIN' },
    { correo: 'ana@soho.test\r\nBcc:ajeno@soho.test' },
  ])('rechaza una solicitud inválida: %j', (datos) => {
    expect(() => leerSolicitudRecuperacion(datos)).toThrow();
  });
  it.each([
    '',
    'a'.repeat(42),
    'a'.repeat(44),
    'a'.repeat(42) + '=',
    'a'.repeat(42) + ' ',
    123,
  ])('rechaza tokens fuera del formato opaco: %j', (valor) => {
    expect(() => leerTokenRecuperacion({ token: valor })).toThrow();
  });
  it('rechaza contraseñas débiles, excesivas, con NUL o parámetros privilegiados', () => {
    for (const clave of [
      'corta',
      'a'.repeat(129),
      '😀'.repeat(129),
      'contraseña válida\0',
    ])
      expect(() => leerRestablecimiento({ token, clave })).toThrow();
    expect(() =>
      leerRestablecimiento({
        token,
        clave: 'contraseña válida de prueba',
        rol: 'ADMIN',
      }),
    ).toThrow();
    expect(
      leerRestablecimiento({ token, clave: '😀'.repeat(128) }).clave,
    ).toHaveLength(256);
  });
});

describe('Límites de recuperación', () => {
  let ahora = 1_000_000;
  const respuesta = () => ({ setHeader: vi.fn() }) as unknown as Response;
  const peticion = (ip: string, correo = 'ana@recovery.test') =>
    ({ ip, body: { correo } }) as Request;
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockImplementation(() => ahora);
  });
  afterEach(() => {
    ahora = 1_000_000;
    vi.restoreAllMocks();
  });
  it('limita el mismo correo a tres solicitudes por hora aunque cambie la IP', () => {
    const limites = new LimitesAuthService();
    const res = respuesta();
    const cabecera = vi.spyOn(res, 'setHeader');
    for (let i = 0; i < 3; i++)
      limites.comprobar(
        'recuperacion',
        peticion(
          `ip-${i}`,
          i === 0 ? ' ANA@RECOVERY.TEST ' : 'ana@recovery.test',
        ),
        res,
      );
    expect(() =>
      limites.comprobar('recuperacion', peticion('otra-ip'), res),
    ).toThrow();
    expect(cabecera).toHaveBeenCalledWith('Retry-After', 3600);
    ahora += 3_600_001;
    expect(() =>
      limites.comprobar('recuperacion', peticion('otra-ip'), res),
    ).not.toThrow();
  });
  it('limita una IP a diez solicitudes por hora aunque cambie el correo', () => {
    const limites = new LimitesAuthService();
    const res = respuesta();
    for (let i = 0; i < 10; i++)
      limites.comprobar(
        'recuperacion',
        peticion('misma-ip', `ana-${i}@recovery.test`),
        res,
      );
    expect(() =>
      limites.comprobar(
        'recuperacion',
        peticion('misma-ip', 'otra@recovery.test'),
        res,
      ),
    ).toThrow();
  });
  it.each([
    ['comprobar-recuperacion', 60],
    ['restablecer', 10],
  ] as const)(
    'limita %s por minuto sin depender de que el token exista',
    (tipo, maximo) => {
      const limites = new LimitesAuthService();
      const req = peticion('misma-ip');
      const res = respuesta();
      for (let i = 0; i < maximo; i++) limites.comprobar(tipo, req, res);
      expect(() => limites.comprobar(tipo, req, res)).toThrow();
      ahora += 60_001;
      expect(() => limites.comprobar(tipo, req, res)).not.toThrow();
    },
  );
});
