import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { RolUsuario } from '../../generated/prisma/client.js';
import { ES_PUBLICO, LIMITE_AUTH, ROLES } from './auth.decoradores.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from './configuracion-auth.js';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';
import { leerCookie, limpiarCookies } from '../sesiones/cookies-auth.js';
import { CsrfService } from './csrf.service.js';
import {
  LimitesAuthService,
  type TipoLimiteAuth,
} from './limites-auth.service.js';
import { SesionesService } from '../sesiones/sesiones.service.js';
import { FORMATO_MULTIPART_CSRF } from './multipart-csrf.decorator.js';

@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
  ) {}
  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<PeticionAuth>();
    const res = contexto.switchToHttp().getResponse<Response>();
    const publico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!publico || req.path.startsWith('/api/auth/'))
      res.setHeader('Cache-Control', 'no-store');
    if (publico) return true;
    const token = leerCookie(req, this.config.cookieSesion);
    const autenticacion = token ? await this.sesiones.autenticar(token) : null;
    if (!autenticacion) {
      limpiarCookies(res, this.config);
      throw new UnauthorizedException('Inicia sesión para continuar.');
    }
    req.autenticacion = autenticacion;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(contexto: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RolUsuario[]>(ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (roles === undefined) return true;
    const usuario = contexto.switchToHttp().getRequest<PeticionAuth>()
      .autenticacion?.usuario;
    if (!usuario || !roles.includes(usuario.rol))
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción.',
      );
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(CsrfService) private readonly csrf: CsrfService) {}
  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<PeticionAuth>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
      this.csrf.validar(
        req,
        Reflect.getMetadata(FORMATO_MULTIPART_CSRF, contexto.getHandler()) ===
          true,
      );
    return true;
  }
}

@Injectable()
export class LimiteAccesoGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(LimitesAuthService) private readonly limites: LimitesAuthService,
  ) {}
  canActivate(contexto: ExecutionContext): boolean {
    const tipo = this.reflector.getAllAndOverride<TipoLimiteAuth>(LIMITE_AUTH, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (tipo)
      this.limites.comprobar(
        tipo,
        contexto.switchToHttp().getRequest(),
        contexto.switchToHttp().getResponse(),
      );
    return true;
  }
}
