import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClavesService } from '../seguridad/claves.service.js';
import {
  generarIdentificador,
  hashIdentificador,
} from '../sesiones/cookies-auth.js';
import {
  CONFIGURACION_CORREO,
  type ConfiguracionCorreo,
} from '../correo/configuracion-correo.js';
import { CorreosService } from '../correo/correos.service.js';

const DURACION = 30 * 60 * 1000;
const invalido = () =>
  new BadRequestException({
    codigo: 'RECUPERACION_ENLACE_INVALIDO',
    message: 'Este enlace no es válido o ha vencido. Solicita uno nuevo.',
  });
const vigente = (
  token: {
    tipo: string;
    expiraEn: Date;
    usadoEn: Date | null;
    revocadoEn: Date | null;
    usuario: { activo: boolean; claveHash: string | null };
  } | null,
  ahora = new Date(),
) =>
  !!token &&
  token.tipo === 'RECUPERACION_CLAVE' &&
  token.expiraEn > ahora &&
  !token.usadoEn &&
  !token.revocadoEn &&
  token.usuario.activo &&
  !!token.usuario.claveHash;

@Injectable()
export class RecuperacionService implements OnModuleDestroy {
  private readonly logger = new Logger(RecuperacionService.name);
  private readonly pendientes: string[] = [];
  private trabajo?: Promise<void>;
  private cerrando = false;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClavesService) private readonly claves: ClavesService,
    @Inject(CorreosService)
    private readonly correos: CorreosService,
    @Inject(CONFIGURACION_CORREO) private readonly config: ConfiguracionCorreo,
  ) {}

  solicitar(correo: string): void {
    if (
      !this.correos.habilitado() ||
      this.cerrando ||
      this.pendientes.length >= 100
    ) {
      throw new ServiceUnavailableException(
        'La recuperación no está disponible por el momento. Inténtalo más tarde.',
      );
    }
    // Se encolan también correos inexistentes. El tiempo y respuesta HTTP no
    // dependen de consultar la cuenta ni de la latencia del proveedor SMTP.
    this.pendientes.push(correo);
    this.trabajo ??= Promise.resolve().then(() => this.procesar());
  }

  async esperarOciosidad(): Promise<void> {
    while (this.trabajo) await this.trabajo;
  }
  async onModuleDestroy() {
    this.cerrando = true;
    await this.esperarOciosidad();
  }
  private async procesar() {
    try {
      let correo: string | undefined;
      while ((correo = this.pendientes.shift()) !== undefined) {
        try {
          await this.enviar(correo);
        } catch {
          // No registrar destinatarios, enlaces, tokens, SQL ni errores SMTP.
          this.logger.warn(
            'No se pudo completar un envío de recuperación. Revisa la disponibilidad de persistencia y SMTP.',
          );
        }
      }
    } finally {
      this.trabajo = undefined;
    }
  }

  private async enviar(correo: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo },
      select: { id: true, activo: true, claveHash: true },
    });
    if (!usuario?.activo || !usuario.claveHash) return;
    const token = generarIdentificador();
    const tokenHash = hashIdentificador(token);
    const creado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM usuarios WHERE id = ${usuario.id} FOR UPDATE`,
      );
      const actual = await tx.usuario.findUnique({
        where: { id: usuario.id },
        select: { activo: true, claveHash: true, correo: true },
      });
      if (
        !actual?.activo ||
        actual.claveHash !== usuario.claveHash ||
        actual.correo !== correo
      )
        return null;
      const ahora = new Date();
      return tx.tokenUsuario.create({
        data: {
          usuarioId: usuario.id,
          tipo: 'RECUPERACION_CLAVE',
          tokenHash,
          creadoEn: ahora,
          expiraEn: new Date(ahora.getTime() + DURACION),
        },
      });
    });
    if (!creado) return;
    try {
      const enlace = new URL(
        '/restablecer-contrasena',
        this.config.origenTienda,
      );
      enlace.hash = new URLSearchParams({ token }).toString();
      await this.correos.enviar(correo, enlace.toString());
      // El enlace anterior continúa válido si falla el envío nuevo. Solo se
      // sustituye después de la aceptación SMTP, sin sostener locks en la red.
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM usuarios WHERE id = ${usuario.id} FOR UPDATE`,
        );
        const nuevo = await tx.tokenUsuario.findUnique({
          where: { id: creado.id },
          include: { usuario: { select: { activo: true, claveHash: true } } },
        });
        if (!vigente(nuevo) || nuevo!.usuario.claveHash !== usuario.claveHash)
          return;
        await tx.tokenUsuario.updateMany({
          where: {
            usuarioId: usuario.id,
            id: { not: creado.id },
            tipo: 'RECUPERACION_CLAVE',
            usadoEn: null,
            revocadoEn: null,
          },
          data: { revocadoEn: new Date() },
        });
      });
    } catch (error) {
      await this.prisma.tokenUsuario.updateMany({
        where: { id: creado.id, usadoEn: null, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      throw error;
    }
  }

  async comprobar(token: string) {
    const enlace = await this.prisma.tokenUsuario.findUnique({
      where: { tokenHash: hashIdentificador(token) },
      include: { usuario: { select: { activo: true, claveHash: true } } },
    });
    return { vigente: vigente(enlace) };
  }

  async restablecer(token: string, clave: string): Promise<void> {
    const tokenHash = hashIdentificador(token);
    const anterior = await this.prisma.tokenUsuario.findUnique({
      where: { tokenHash },
      include: { usuario: { select: { activo: true, claveHash: true } } },
    });
    if (!vigente(anterior)) throw invalido();
    const claveHash = await this.claves.crear(clave);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM usuarios WHERE id = ${anterior!.usuarioId} FOR UPDATE`,
      );
      const enlace = await tx.tokenUsuario.findUnique({
        where: { tokenHash },
        include: { usuario: { select: { activo: true, claveHash: true } } },
      });
      const ahora = new Date();
      if (!vigente(enlace, ahora)) throw invalido();
      const consumido = await tx.tokenUsuario.updateMany({
        where: {
          id: enlace!.id,
          tipo: 'RECUPERACION_CLAVE',
          usadoEn: null,
          revocadoEn: null,
          expiraEn: { gt: ahora },
        },
        data: { usadoEn: ahora },
      });
      if (consumido.count !== 1) throw invalido();
      await tx.usuario.update({
        where: { id: enlace!.usuarioId },
        data: { claveHash },
      });
      await tx.sesion.updateMany({
        where: { usuarioId: enlace!.usuarioId, revocadaEn: null },
        data: { revocadaEn: ahora },
      });
      await tx.tokenUsuario.updateMany({
        where: {
          usuarioId: enlace!.usuarioId,
          tipo: 'RECUPERACION_CLAVE',
          usadoEn: null,
          revocadoEn: null,
        },
        data: { revocadoEn: ahora },
      });
    });
  }
}
