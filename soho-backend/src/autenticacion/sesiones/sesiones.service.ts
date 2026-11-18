import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../seguridad/configuracion-auth.js';
import { generarIdentificador, hashIdentificador } from './cookies-auth.js';
import {
  seleccionUsuario,
  usuarioPublico,
  type ContextoAuth,
} from './contexto-auth.js';

@Injectable()
export class SesionesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
  ) {}

  async crear(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    anterior?: string,
  ) {
    const ahora = new Date();
    if (anterior)
      await tx.sesion.updateMany({
        where: { tokenHash: hashIdentificador(anterior), revocadaEn: null },
        data: { revocadaEn: ahora },
      });
    const token = generarIdentificador();
    const expiraEn = new Date(ahora.getTime() + this.config.duracionMs);
    await tx.sesion.create({
      data: {
        usuarioId,
        tokenHash: hashIdentificador(token),
        creadaEn: ahora,
        ultimaActividadEn: ahora,
        expiraEn,
      },
    });
    return { token, expiraEn };
  }

  async autenticar(token: string): Promise<ContextoAuth | null> {
    const ahora = new Date();
    const corte = new Date(ahora.getTime() - this.config.inactividadMs);
    return this.prisma.$transaction(async (tx) => {
      const sesion = await tx.sesion.findUnique({
        where: { tokenHash: hashIdentificador(token) },
        select: {
          id: true,
          revocadaEn: true,
          expiraEn: true,
          ultimaActividadEn: true,
          usuario: { select: { ...seleccionUsuario, activo: true } },
        },
      });
      if (!sesion || sesion.revocadaEn) return null;
      if (
        !sesion.usuario.activo ||
        sesion.expiraEn <= ahora ||
        sesion.ultimaActividadEn <= corte
      ) {
        await tx.sesion.updateMany({
          where: { id: sesion.id, revocadaEn: null },
          data: { revocadaEn: ahora },
        });
        return null;
      }
      // El UPDATE condicional impide reactivar una sesión revocada concurrentemente.
      const actualizada = await tx.sesion.updateMany({
        where: {
          id: sesion.id,
          revocadaEn: null,
          expiraEn: { gt: ahora },
          ultimaActividadEn: { gt: corte },
          usuario: { activo: true },
        },
        data: { ultimaActividadEn: ahora },
      });
      if (!actualizada.count) return null;
      return { sesionId: sesion.id, usuario: usuarioPublico(sesion.usuario) };
    });
  }

  async revocar(sesionId: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { id: sesionId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }
}
