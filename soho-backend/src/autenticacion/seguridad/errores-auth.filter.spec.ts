import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { ErroresAuthFilter } from './errores-auth.filter.js';

describe('ErroresAuthFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    new Prisma.PrismaClientKnownRequestError(
      'SELECT privado con credenciales',
      {
        code: 'P2021',
        clientVersion: 'prueba',
        meta: { token: 'secreto' },
      },
    ),
    new Prisma.PrismaClientUnknownRequestError(
      'Adaptador privado con credenciales',
      { clientVersion: 'prueba' },
    ),
    new Prisma.PrismaClientInitializationError(
      'mysql://usuario:clave@servidor/base',
      'prueba',
      'P1001',
    ),
  ])('registra solo el tipo y código seguros de $name', (error) => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new ErroresAuthFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      message: 'No se pudo completar la operación. Inténtalo nuevamente.',
      error: 'Service Unavailable',
    });
    const diagnostico = log.mock.calls
      .map(([mensaje]) => String(mensaje))
      .join(' ');
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      expect(diagnostico).toContain(error.code);
    if (error instanceof Prisma.PrismaClientInitializationError)
      expect(diagnostico).toContain(error.errorCode);
    for (const detalle of [
      'SELECT',
      'credenciales',
      'token',
      'secreto',
      'mysql://',
      'usuario:clave',
    ])
      expect(diagnostico).not.toContain(detalle);
  });
});
