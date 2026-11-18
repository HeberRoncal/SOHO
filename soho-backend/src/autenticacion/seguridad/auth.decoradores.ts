import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { RolUsuario } from '../../generated/prisma/client.js';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';
import type { TipoLimiteAuth } from './limites-auth.service.js';

export const ES_PUBLICO = Symbol('ES_PUBLICO');
export const ROLES = Symbol('ROLES');
export const LIMITE_AUTH = Symbol('LIMITE_AUTH');
export const Publico = () => SetMetadata(ES_PUBLICO, true);
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES, roles);
export const LimitarAcceso = (tipo: TipoLimiteAuth) =>
  SetMetadata(LIMITE_AUTH, tipo);
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext) => {
    const usuario = contexto.switchToHttp().getRequest<PeticionAuth>()
      .autenticacion?.usuario;
    if (!usuario)
      throw new UnauthorizedException('Inicia sesión para continuar.');
    return usuario;
  },
);
