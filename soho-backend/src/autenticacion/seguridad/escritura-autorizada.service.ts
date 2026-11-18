import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConflictoTransaccion } from '../../prisma/conflicto-transaccion.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from './configuracion-auth.js';
import type { ContextoAuth } from '../sesiones/contexto-auth.js';

@Injectable()
export class EscrituraAutorizadaService {
  constructor(
    @Inject(PrismaService) protected readonly prisma: PrismaService,
    @Inject(CONFIGURACION_AUTH) protected readonly auth: ConfiguracionAuth,
  ) {}

  async comprobarSesion(
    tx: Prisma.TransactionClient,
    sesion: ContextoAuth | undefined,
    admin: boolean,
  ) {
    if (!sesion) {
      if (admin) throw new UnauthorizedException();
      return;
    }
    const ahora = new Date(),
      corte = new Date(ahora.getTime() - this.auth.inactividadMs);
    const filas = await tx.$queryRaw<
      Array<{ rol: string }>
    >`SELECT u.rol FROM sesiones s INNER JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ${sesion.sesionId} AND s.usuario_id = ${sesion.usuario.id} AND s.revocada_en IS NULL AND s.expira_en > ${ahora} AND s.ultima_actividad_en > ${corte} AND u.activo = TRUE FOR UPDATE`;
    if (!filas.length || (admin && filas[0].rol !== 'ADMIN'))
      throw new UnauthorizedException(
        'La sesión ya no autoriza esta operación.',
      );
  }

  transaccion<T>(
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const ejecutar = async (intento: number): Promise<T> => {
      try {
        return await this.prisma.$transaction(operacion, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 20000,
        });
      } catch (e) {
        if (ConflictoTransaccion.reintentable(e) && intento < 2)
          return ejecutar(intento + 1);
        throw e;
      }
    };
    return ejecutar(0);
  }
}
