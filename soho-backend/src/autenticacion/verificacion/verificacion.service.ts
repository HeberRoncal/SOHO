import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  generarIdentificador,
  hashIdentificador,
} from '../sesiones/cookies-auth.js';
import {
  CONFIGURACION_CORREO,
  type ConfiguracionCorreo,
} from '../correo/configuracion-correo.js';
import { CorreosService } from '../correo/correos.service.js';
import {
  FORMATO_TOKEN_VERIFICACION,
  enlaceVerificacionInvalido,
} from './datos-verificacion.js';

const DURACION = 8 * 60 * 60 * 1000;
type Enlace = Prisma.TokenUsuarioGetPayload<{
  include: {
    usuario: {
      select: {
        correo: true;
        activo: true;
        claveHash: true;
        correoVerificadoEn: true;
      };
    };
  };
}>;
const hashEnlace = (id: string, secreto: string, correo: string) =>
  hashIdentificador(
    JSON.stringify(['VERIFICACION_CORREO', id, secreto, correo]),
  );
const seleccion = {
  usuario: {
    select: {
      correo: true,
      activo: true,
      claveHash: true,
      correoVerificadoEn: true,
    },
  },
} as const;
function vigente(enlace: Enlace | null, token: string, ahora = new Date()) {
  const partes = FORMATO_TOKEN_VERIFICACION.exec(token);
  if (
    !partes ||
    !enlace ||
    enlace.id !== partes[1] ||
    enlace.tipo !== 'VERIFICACION_CORREO' ||
    enlace.expiraEn <= ahora ||
    enlace.usadoEn ||
    enlace.revocadoEn ||
    !enlace.usuario.activo ||
    !enlace.usuario.claveHash ||
    enlace.usuario.correoVerificadoEn
  )
    return false;
  // Vincula la prueba al correo que recibió el mensaje, incluso si la dirección
  // cambia después. No requiere guardar otro campo ni un secreto de proceso.
  const esperado = hashEnlace(enlace.id, partes[2], enlace.usuario.correo);
  return timingSafeEqual(
    Buffer.from(enlace.tokenHash, 'hex'),
    Buffer.from(esperado, 'hex'),
  );
}

@Injectable()
export class VerificacionService implements OnModuleDestroy {
  private readonly logger = new Logger(VerificacionService.name);
  private readonly pendientes: string[] = [];
  private trabajo?: Promise<void>;
  private cerrando = false;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CorreosService)
    private readonly correos: CorreosService,
    @Inject(CONFIGURACION_CORREO) private readonly config: ConfiguracionCorreo,
  ) {}
  solicitarAutomatica(usuarioId: string) {
    if (!this.correos.habilitado()) return;
    try {
      this.solicitar(usuarioId);
    } catch {
      this.logger.warn(
        'No se pudo programar la verificación de una cuenta nueva. Se puede solicitar nuevamente desde Mi cuenta.',
      );
    }
  }
  solicitar(usuarioId: string) {
    if (
      !this.correos.habilitado() ||
      this.cerrando ||
      this.pendientes.length >= 100
    )
      throw new ServiceUnavailableException(
        'La verificación de correo no está disponible por el momento. Inténtalo más tarde.',
      );
    this.pendientes.push(usuarioId);
    this.trabajo ??= Promise.resolve().then(() => this.procesar());
  }
  async esperarOciosidad() {
    while (this.trabajo) await this.trabajo;
  }
  async onModuleDestroy() {
    this.cerrando = true;
    await this.esperarOciosidad();
  }
  private async procesar() {
    try {
      let id: string | undefined;
      while ((id = this.pendientes.shift()) !== undefined) {
        try {
          await this.enviar(id);
        } catch {
          this.logger.warn(
            'No se pudo completar un envío de verificación. Revisa persistencia y SMTP.',
          );
        }
      }
    } finally {
      this.trabajo = undefined;
    }
  }
  private async enviar(usuarioId: string) {
    const id = randomUUID(),
      secreto = generarIdentificador();
    const creado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM usuarios WHERE id = ${usuarioId} FOR UPDATE`,
      );
      const usuario = await tx.usuario.findUnique({
        where: { id: usuarioId },
        select: {
          correo: true,
          activo: true,
          claveHash: true,
          correoVerificadoEn: true,
        },
      });
      if (!usuario?.activo || !usuario.claveHash || usuario.correoVerificadoEn)
        return null;
      const ahora = new Date();
      await tx.tokenUsuario.create({
        data: {
          id,
          usuarioId,
          tipo: 'VERIFICACION_CORREO',
          tokenHash: hashEnlace(id, secreto, usuario.correo),
          creadoEn: ahora,
          expiraEn: new Date(ahora.getTime() + DURACION),
        },
      });
      return { correo: usuario.correo };
    });
    if (!creado) return;
    const token = `${id}.${secreto}`;
    try {
      const enlace = new URL('/verificar-correo', this.config.origenTienda);
      enlace.hash = new URLSearchParams({ token }).toString();
      await this.correos.enviarVerificacion(creado.correo, enlace.toString());
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM usuarios WHERE id = ${usuarioId} FOR UPDATE`,
        );
        const nuevo = await tx.tokenUsuario.findUnique({
          where: { id },
          include: seleccion,
        });
        if (!vigente(nuevo, token)) return;
        await tx.tokenUsuario.updateMany({
          where: {
            usuarioId,
            id: { not: id },
            tipo: 'VERIFICACION_CORREO',
            usadoEn: null,
            revocadoEn: null,
          },
          data: { revocadoEn: new Date() },
        });
      });
    } catch (error) {
      await this.prisma.tokenUsuario.updateMany({
        where: { id, usadoEn: null, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      throw error;
    }
  }
  async comprobar(token: string) {
    const id = FORMATO_TOKEN_VERIFICACION.exec(token)?.[1];
    if (!id) return { vigente: false };
    const enlace = await this.prisma.tokenUsuario.findUnique({
      where: { id },
      include: seleccion,
    });
    return { vigente: vigente(enlace, token) };
  }
  async confirmar(token: string) {
    const id = FORMATO_TOKEN_VERIFICACION.exec(token)?.[1];
    if (!id) throw enlaceVerificacionInvalido();
    const anterior = await this.prisma.tokenUsuario.findUnique({
      where: { id },
      include: seleccion,
    });
    if (!vigente(anterior, token)) throw enlaceVerificacionInvalido();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM usuarios WHERE id = ${anterior!.usuarioId} FOR UPDATE`,
      );
      const enlace = await tx.tokenUsuario.findUnique({
        where: { id },
        include: seleccion,
      });
      const ahora = new Date();
      if (!vigente(enlace, token, ahora)) throw enlaceVerificacionInvalido();
      const consumido = await tx.tokenUsuario.updateMany({
        where: {
          id,
          tipo: 'VERIFICACION_CORREO',
          usadoEn: null,
          revocadoEn: null,
          expiraEn: { gt: ahora },
        },
        data: { usadoEn: ahora },
      });
      if (consumido.count !== 1) throw enlaceVerificacionInvalido();
      await tx.usuario.update({
        where: { id: enlace!.usuarioId },
        data: { correoVerificadoEn: ahora },
      });
      await tx.tokenUsuario.updateMany({
        where: {
          usuarioId: enlace!.usuarioId,
          tipo: 'VERIFICACION_CORREO',
          usadoEn: null,
          revocadoEn: null,
        },
        data: { revocadoEn: ahora },
      });
    });
  }
}
