import {
  HttpException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { crearConfiguracionAuth } from '../../autenticacion/seguridad/configuracion-auth.js';
import { SesionesService } from '../../autenticacion/sesiones/sesiones.service.js';
import { LimitesAuthService } from '../../autenticacion/seguridad/limites-auth.service.js';
import {
  SesionPedidoGuard,
  type PeticionPedido,
} from './sesion-pedido.guard.js';

describe('Identidad opcional de pedidos y límites de creación', () => {
  const configurar = (cookie?: string, acceso?: string) => {
    const req = {
      headers: { cookie },
      get: (campo: string) =>
        campo === 'x-pedido-acceso' ? acceso : undefined,
    } as unknown as PeticionPedido;
    const res = { setHeader: vi.fn(), clearCookie: vi.fn() };
    const contexto = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    const sesiones = { autenticar: vi.fn().mockResolvedValue(null) };
    const guard = new SesionPedidoGuard(
      sesiones as unknown as SesionesService,
      crearConfiguracionAuth({}),
    );
    return { req, res, contexto, sesiones, guard };
  };
  it('almacena solo el hash del secreto de invitado', async () => {
    const secreto = 'b'.repeat(64),
      t = configurar(undefined, secreto);
    await expect(t.guard.canActivate(t.contexto)).resolves.toBe(true);
    expect(t.req.identidadPedido).toEqual({
      accesoInvitadoHash: createHash('sha256').update(secreto).digest('hex'),
    });
  });
  it.each([
    'soho_sesion=invalida',
    `soho_sesion=${'a'.repeat(43)}; soho_sesion=${'b'.repeat(43)}`,
    `soho_sesion=${'a'.repeat(43)}`,
  ])(
    'rechaza cookie presente inválida sin degradar a invitado: %s',
    async (cookie) => {
      const t = configurar(cookie, 'b'.repeat(64));
      await expect(t.guard.canActivate(t.contexto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(t.req.identidadPedido).toBeUndefined();
      expect(t.res.clearCookie).toHaveBeenCalled();
    },
  );
  it('rechaza ausencia o forma inválida del secreto de invitado', async () => {
    for (const secreto of [undefined, '', 'codigo-publico', 'B'.repeat(64)]) {
      const t = configurar(undefined, secreto);
      await expect(t.guard.canActivate(t.contexto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });
  it('limita a diez intentos de creación por IP y minuto, con Retry-After', () => {
    const limites = new LimitesAuthService(),
      req = { ip: '127.0.0.1' } as Request;
    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Response;
    for (let i = 0; i < 10; i++) limites.comprobar('crear-pedido', req, res);
    expect(() => limites.comprobar('crear-pedido', req, res)).toThrow(
      HttpException,
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });
});
