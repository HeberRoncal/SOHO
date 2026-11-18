import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../../autenticacion/seguridad/configuracion-auth.js';
import {
  leerCookie,
  limpiarCookies,
} from '../../autenticacion/sesiones/cookies-auth.js';
import type {
  ContextoAuth,
  PeticionAuth,
} from '../../autenticacion/sesiones/contexto-auth.js';
import { SesionesService } from '../../autenticacion/sesiones/sesiones.service.js';

export interface IdentidadPedido {
  sesion?: ContextoAuth;
  accesoInvitadoHash?: string;
}
export interface PeticionPedido extends PeticionAuth {
  identidadPedido: IdentidadPedido;
}

@Injectable()
export class SesionPedidoGuard implements CanActivate {
  constructor(
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<PeticionPedido>();
    const res = contexto.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const tieneCookie = (req.headers.cookie ?? '')
      .split(';')
      .some((p) => p.trim().split('=')[0] === this.config.cookieSesion);
    if (!req.autenticacion && tieneCookie) {
      const token = leerCookie(req, this.config.cookieSesion);
      const sesion = token ? await this.sesiones.autenticar(token) : null;
      if (!sesion) {
        limpiarCookies(res, this.config);
        throw new UnauthorizedException(
          'La sesión venció. Inicia sesión nuevamente antes de continuar.',
        );
      }
      req.autenticacion = sesion;
    }
    if (req.autenticacion) {
      req.identidadPedido = { sesion: req.autenticacion };
      return true;
    }
    const acceso = req.get('x-pedido-acceso');
    if (!acceso || !/^[0-9a-f]{64}$/.test(acceso))
      throw new UnauthorizedException(
        'Se requiere la credencial privada del pedido de invitado.',
      );
    req.identidadPedido = {
      accesoInvitadoHash: createHash('sha256').update(acceso).digest('hex'),
    };
    return true;
  }
}
