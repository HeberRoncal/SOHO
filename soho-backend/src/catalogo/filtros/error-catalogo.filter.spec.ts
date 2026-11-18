import { ErrorCatalogoFilter } from './error-catalogo.filter.js';
import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

describe('ErrorCatalogoFilter', () => {
  it.each([
    new Prisma.PrismaClientKnownRequestError(
      'SELECT privado con credenciales',
      {
        code: 'P2002',
        clientVersion: 'prueba',
        meta: { token: 'secreto' },
      },
    ),
    new Prisma.PrismaClientUnknownRequestError(
      'Adaptador privado con credenciales',
      {
        clientVersion: 'prueba',
      },
    ),
    new Prisma.PrismaClientInitializationError(
      'mysql://usuario:clave@servidor/base',
      'prueba',
    ),
  ])(
    'oculta detalles internos de $name y responde con un error recuperable',
    (error) => {
      const json = vi.fn();
      const status = vi.fn(() => ({ json }));
      const host = {
        switchToHttp: () => ({ getResponse: () => ({ status }) }),
      } as unknown as ArgumentsHost;
      new ErrorCatalogoFilter().catch(error, host);
      expect(status).toHaveBeenCalledWith(503);
      expect(json).toHaveBeenCalledWith({
        statusCode: 503,
        message: 'No se pudo consultar el catálogo. Inténtalo nuevamente.',
        error: 'Service Unavailable',
      });
      const respuesta = JSON.stringify(json.mock.calls);
      for (const detalle of [
        'SELECT',
        'credenciales',
        'token',
        'secreto',
        'mysql://',
        'usuario:clave',
      ])
        expect(respuesta).not.toContain(detalle);
    },
  );
});
