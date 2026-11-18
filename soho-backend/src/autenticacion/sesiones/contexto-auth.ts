import type { Request } from 'express';
import type { Prisma, RolUsuario } from '../../generated/prisma/client.js';

export const seleccionUsuario = {
  id: true,
  nombres: true,
  apellidos: true,
  correo: true,
  rol: true,
  correoVerificadoEn: true,
} as const satisfies Prisma.UsuarioSelect;

export interface UsuarioAutenticado {
  id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  rol: RolUsuario;
  correoVerificado: boolean;
}
export interface ContextoAuth {
  sesionId: string;
  usuario: UsuarioAutenticado;
}
export interface PeticionAuth extends Request {
  autenticacion?: ContextoAuth;
}

export function usuarioPublico(
  usuario: Prisma.UsuarioGetPayload<{ select: typeof seleccionUsuario }>,
): UsuarioAutenticado {
  return {
    id: usuario.id,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    correo: usuario.correo,
    rol: usuario.rol,
    correoVerificado: usuario.correoVerificadoEn !== null,
  };
}
