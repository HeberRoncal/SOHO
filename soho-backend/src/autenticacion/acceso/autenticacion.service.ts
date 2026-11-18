import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, RolUsuario } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClavesService } from '../seguridad/claves.service.js';
import { SesionesService } from '../sesiones/sesiones.service.js';
import { seleccionUsuario, usuarioPublico } from '../sesiones/contexto-auth.js';
import type { DatosLogin, DatosPerfil, DatosRegistro } from './datos-auth.js';

@Injectable()
export class AutenticacionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClavesService) private readonly claves: ClavesService,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
  ) {}

  async registrar(datos: DatosRegistro, anterior?: string) {
    const claveHash = await this.claves.crear(datos.clave);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            nombres: datos.nombres,
            apellidos: datos.apellidos,
            correo: datos.correo,
            claveHash,
            rol: RolUsuario.CLIENTE,
          },
          select: seleccionUsuario,
        });
        const sesion = await this.sesiones.crear(tx, usuario.id, anterior);
        return { usuario: usuarioPublico(usuario), ...sesion };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'No se pudo registrar la cuenta con esos datos.',
        );
      }
      throw error;
    }
  }

  async actualizarPerfil(usuarioId: string, datos: DatosPerfil) {
    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.usuario.updateMany({
        where: { id: usuarioId, activo: true },
        data: { nombres: datos.nombres, apellidos: datos.apellidos },
      });
      if (actualizado.count !== 1)
        throw new UnauthorizedException('Inicia sesión para continuar.');
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: seleccionUsuario,
      });
      return usuarioPublico(usuario);
    });
  }

  async acceder(datos: DatosLogin, anterior?: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: datos.correo },
      select: { id: true, claveHash: true, activo: true },
    });
    const valida = await this.claves.verificar(usuario?.claveHash, datos.clave);
    const fallo = () =>
      new UnauthorizedException('Correo o contraseña incorrectos.');
    if (!usuario || !valida || !usuario.activo) throw fallo();
    return this.prisma.$transaction(async (tx) => {
      // Una recuperación concurrente debe revocar esta sesión o impedir que
      // una contraseña anterior cree otra después de cambiar el hash.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM usuarios WHERE id = ${usuario.id} FOR UPDATE`,
      );
      const actual = await tx.usuario.findUnique({
        where: { id: usuario.id },
        select: { ...seleccionUsuario, claveHash: true, activo: true },
      });
      if (!actual?.activo || actual.claveHash !== usuario.claveHash)
        throw fallo();
      const sesion = await this.sesiones.crear(tx, actual.id, anterior);
      return { usuario: usuarioPublico(actual), ...sesion };
    });
  }
}
