import type { Response } from 'express';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';
import { LimitesAuthService } from '../seguridad/limites-auth.service.js';
import { leerVerificacion } from './datos-verificacion.js';

describe('Entradas y límites de verificación', () => {
  const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.' + 'a'.repeat(43);
  afterEach(() => vi.restoreAllMocks());
  it('acepta únicamente el token completo sin parámetros privilegiados', () => {
    expect(leerVerificacion({ token })).toEqual({ token });
    for (const datos of [
      null,
      {},
      [],
      { token: 'a'.repeat(43) },
      { token: token + ' ' },
      { token, usuarioId: 'ajeno' },
      { token, rol: 'ADMIN' },
    ])
      expect(() => leerVerificacion(datos)).toThrow();
  });
  it('limita reenvíos por usuario aunque cambie la IP', () => {
    const limites = new LimitesAuthService();
    const req = (ip: string) =>
      ({
        ip,
        body: {},
        autenticacion: { usuario: { id: 'cuenta' } },
      }) as PeticionAuth;
    const res = { setHeader: vi.fn() } as unknown as Response;
    for (let i = 0; i < 3; i++)
      limites.comprobar('reenviar-verificacion', req('ip-' + i), res);
    expect(() =>
      limites.comprobar('reenviar-verificacion', req('otra'), res),
    ).toThrow();
  });
  it.each([
    ['comprobar-verificacion', 60],
    ['confirmar-verificacion', 10],
  ] as const)('limita %s por IP', (tipo, maximo) => {
    const limites = new LimitesAuthService(),
      req = { ip: 'ip' } as PeticionAuth,
      res = { setHeader: vi.fn() } as unknown as Response;
    for (let i = 0; i < maximo; i++) limites.comprobar(tipo, req, res);
    expect(() => limites.comprobar(tipo, req, res)).toThrow();
  });
});
