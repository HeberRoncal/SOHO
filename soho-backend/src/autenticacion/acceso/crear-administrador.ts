import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  RolUsuario,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import type { ClavesService } from '../seguridad/claves.service.js';
import { seleccionUsuario, usuarioPublico } from '../sesiones/contexto-auth.js';
import { leerRegistro } from './datos-auth.js';

export async function crearAdministrador(
  prisma: PrismaClient,
  claves: ClavesService,
  entrada: unknown,
) {
  const datos = leerRegistro(entrada);
  const claveHash = await claves.crear(datos.clave);
  try {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        correo: datos.correo,
        claveHash,
        rol: RolUsuario.ADMIN,
      },
      select: seleccionUsuario,
    });
    return usuarioPublico(usuario);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Ya existe una cuenta con ese correo. No se modificó su rol ni su contraseña.',
      );
    }
    throw error;
  }
}
