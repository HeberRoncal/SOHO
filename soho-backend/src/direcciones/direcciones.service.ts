import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CrearDireccionDto } from './dto/crear-direccion.dto.js';
import type { ActualizarDireccionDto } from './dto/actualizar-direccion.dto.js';
import { seleccionDireccion } from './entities/direccion.entity.js';

const ordenDirecciones = [
  { predeterminada: 'desc' },
  { creadoEn: 'asc' },
  { id: 'asc' },
] satisfies Prisma.DireccionUsuarioOrderByWithRelationInput[];
const noEncontrada = () =>
  new NotFoundException('No encontramos esa dirección en tu cuenta.');

@Injectable()
export class DireccionesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listar(usuarioId: string) {
    return { direcciones: await this.agenda(this.prisma, usuarioId) };
  }

  async obtener(usuarioId: string, id: string) {
    const direccion = await this.prisma.direccionUsuario.findFirst({
      where: { id, usuarioId },
      select: seleccionDireccion,
    });
    if (!direccion) throw noEncontrada();
    return { direccion };
  }

  crear(usuarioId: string, datos: CrearDireccionDto) {
    return this.escribir(usuarioId, async (tx) => {
      const anterior = await tx.direccionUsuario.findFirst({
        where: { usuarioId, predeterminada: true },
        select: { id: true },
      });
      const predeterminada = datos.predeterminada || !anterior;
      if (predeterminada) await this.desmarcar(tx, usuarioId);
      await tx.direccionUsuario.create({
        data: {
          usuarioId,
          etiqueta: datos.etiqueta,
          destinatario: datos.destinatario,
          celular: datos.celular,
          distrito: datos.distrito,
          direccion: datos.direccion,
          referencia: datos.referencia,
          predeterminada,
        },
      });
      return { direcciones: await this.agenda(tx, usuarioId) };
    });
  }

  actualizar(usuarioId: string, id: string, datos: ActualizarDireccionDto) {
    return this.escribir(usuarioId, async (tx) => {
      const actual = await tx.direccionUsuario.findFirst({
        where: { id, usuarioId },
        select: { predeterminada: true },
      });
      if (!actual) throw noEncontrada();
      // Desmarcar la actual sin elegir otra dejaría la agenda sin predeterminada.
      const predeterminada = datos.predeterminada || actual.predeterminada;
      if (predeterminada) await this.desmarcar(tx, usuarioId);
      await tx.direccionUsuario.update({
        where: { id, usuarioId },
        data: {
          etiqueta: datos.etiqueta,
          destinatario: datos.destinatario,
          celular: datos.celular,
          distrito: datos.distrito,
          direccion: datos.direccion,
          referencia: datos.referencia,
          predeterminada,
        },
      });
      await this.asegurarPredeterminada(tx, usuarioId);
      return { direcciones: await this.agenda(tx, usuarioId) };
    });
  }

  eliminar(usuarioId: string, id: string) {
    return this.escribir(usuarioId, async (tx) => {
      const borrado = await tx.direccionUsuario.deleteMany({
        where: { id, usuarioId },
      });
      if (!borrado.count) throw noEncontrada();
      await this.asegurarPredeterminada(tx, usuarioId);
      return { direcciones: await this.agenda(tx, usuarioId) };
    });
  }

  private agenda(tx: Prisma.TransactionClient, usuarioId: string) {
    return tx.direccionUsuario.findMany({
      where: { usuarioId },
      select: seleccionDireccion,
      orderBy: ordenDirecciones,
    });
  }

  private desmarcar(tx: Prisma.TransactionClient, usuarioId: string) {
    return tx.direccionUsuario.updateMany({
      where: { usuarioId, predeterminada: true },
      data: { predeterminada: false },
    });
  }

  private async asegurarPredeterminada(
    tx: Prisma.TransactionClient,
    usuarioId: string,
  ) {
    if (
      await tx.direccionUsuario.findFirst({
        where: { usuarioId, predeterminada: true },
        select: { id: true },
      })
    )
      return;
    const primera = await tx.direccionUsuario.findFirst({
      where: { usuarioId },
      orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (primera)
      await tx.direccionUsuario.update({
        where: { id: primera.id, usuarioId },
        data: { predeterminada: true },
      });
  }

  private async escribir<T>(
    usuarioId: string,
    operacion: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let intento = 0; ; intento++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Una agenda vacía comparte este bloqueo con las demás escrituras de la cuenta.
            const usuarios = await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM usuarios WHERE id = ${usuarioId} AND activo = TRUE FOR UPDATE`;
            if (!usuarios.length)
              throw new UnauthorizedException('Inicia sesión para continuar.');
            return operacion(tx);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034' && intento < 2) continue;
          if (['P2034', 'P2002'].includes(error.code))
            throw new ConflictException(
              'La agenda cambió durante la operación. Vuelve a intentarlo.',
            );
        }
        throw error;
      }
    }
  }
}
