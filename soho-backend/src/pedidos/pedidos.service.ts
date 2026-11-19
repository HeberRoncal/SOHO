import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConflictoTransaccion } from '../prisma/conflicto-transaccion.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../autenticacion/seguridad/configuracion-auth.js';
import {
  ComprobantesPrivadosService,
  type ArchivoGuardado,
} from './archivos/comprobantes-privados.service.js';
import { ConfiguracionPedidos, UUID_PEDIDO } from './configuracion-pedidos.js';
import type { CreatePedidoDto } from './dto/create-pedido.dto.js';
import {
  INCLUIR_PEDIDO,
  respuestaPedido,
  type PedidoCompleto,
} from './dto/respuesta-pedido.js';
import type { IdentidadPedido } from './seguridad/sesion-pedido.guard.js';
import { PreparacionPedidoService } from './preparacion/preparacion-pedido.service.js';
import { ConfiguracionCheckoutPagos } from './preparacion/configuracion-checkout-pagos.js';
import { RegistroPedidoService } from './preparacion/registro-pedido.service.js';

@Injectable()
export class PedidosService {
  private readonly log = new Logger(PedidosService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ComprobantesPrivadosService)
    private readonly archivos: ComprobantesPrivadosService,
    @Inject(ConfiguracionPedidos) private readonly config: ConfiguracionPedidos,
    @Inject(CONFIGURACION_AUTH) private readonly auth: ConfiguracionAuth,
    @Inject(PreparacionPedidoService)
    private readonly preparacion: PreparacionPedidoService,
    @Inject(ConfiguracionCheckoutPagos)
    private readonly checkout: ConfiguracionCheckoutPagos,
    @Inject(RegistroPedidoService)
    private readonly registro: RegistroPedidoService,
  ) {}

  private puedeLeer(p: PedidoCompleto, identidad: IdentidadPedido): boolean {
    if (identidad.sesion)
      return (
        p.usuarioId === identidad.sesion.usuario.id ||
        identidad.sesion.usuario.rol === 'ADMIN'
      );
    return (
      p.usuarioId === null &&
      !!identidad.accesoInvitadoHash &&
      p.accesoInvitadoHash === identidad.accesoInvitadoHash &&
      !!p.accesoInvitadoExpiraEn &&
      p.accesoInvitadoExpiraEn.getTime() > Date.now()
    );
  }

  private repetir(p: PedidoCompleto, hash: string, identidad: IdentidadPedido) {
    // ADMIN puede consultar, pero no puede reutilizar la clave de creación de otra persona.
    const mismoPropietario = identidad.sesion
      ? p.usuarioId === identidad.sesion.usuario.id
      : p.usuarioId === null && this.puedeLeer(p, identidad);
    if (!mismoPropietario || p.solicitudHash !== hash)
      throw new ConflictException({
        codigo: 'CLAVE_CREACION_EN_USO',
        message:
          'La clave de creación ya fue utilizada. Conserva los datos originales para reintentar.',
      });
    return { pedido: respuestaPedido(p), reutilizado: true };
  }

  private buscarClave(claveCreacion: string) {
    return this.prisma.pedido.findUnique({
      where: { claveCreacion },
      include: INCLUIR_PEDIDO,
    });
  }

  async crear(datos: CreatePedidoDto, identidad: IdentidadPedido) {
    if (!identidad.sesion && !identidad.accesoInvitadoHash)
      throw new UnauthorizedException();
    const original = this.archivos.decodificar(
      datos.comprobante.contenidoBase64,
    );
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          claveCreacion: datos.claveCreacion,
          contacto: datos.contacto,
          entrega: datos.entrega,
          facturacion: datos.facturacion,
          articulos: datos.articulos,
          cotizacion: datos.cotizacion,
          metodoPago: datos.metodoPago,
          comprobante: {
            ...datos.comprobante,
            contenidoBase64: createHash('sha256')
              .update(original)
              .digest('hex'),
          },
          usuarioId: identidad.sesion?.usuario.id ?? null,
        }),
      )
      .digest('hex');
    const anterior = await this.buscarClave(datos.claveCreacion);
    if (anterior) return this.repetir(anterior, hash, identidad);
    if (this.checkout.habilitada)
      throw new ConflictException({
        codigo: 'INSTRUCCION_PAGO_REQUERIDA',
        message:
          'Continúa la compra mediante su instrucción y recepción de comprobante.',
      });
    const preparado = await this.archivos.preparar(
      original,
      datos.comprobante.tipoArchivo,
    );
    const archivo = await this.archivos.guardar(preparado);
    try {
      for (let intento = 0; intento < 3; intento++) {
        try {
          const pedido = await this.prisma.$transaction(
            (tx) => this.insertar(tx, datos, identidad, hash, archivo),
            {
              isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
              maxWait: 10_000,
              timeout: 20_000,
            },
          );
          return { pedido: respuestaPedido(pedido), reutilizado: false };
        } catch (error) {
          if (ConflictoTransaccion.reintentable(error) && intento < 2) continue;
          throw error;
        }
      }
      throw new ServiceUnavailableException('No se pudo completar el pedido.');
    } catch (error) {
      // También resuelve una respuesta perdida después del COMMIT. Nunca borra un archivo
      // posiblemente confirmado si la base está inaccesible y no podemos comprobarlo.
      let confirmado: PedidoCompleto | null;
      try {
        confirmado = await this.buscarClave(datos.claveCreacion);
      } catch {
        this.log.error(
          'Resultado de creación incierto; conservar archivo privado y reconciliar por clave de creación.',
        );
        throw new ServiceUnavailableException(
          'No se pudo confirmar el resultado. Reintenta con los mismos datos y la misma clave de creación.',
        );
      }
      if (
        !confirmado?.pago?.comprobantes.some(
          (c) => c.archivoClave === archivo.clave,
        )
      )
        await this.archivos.eliminar(archivo.clave);
      if (confirmado) return this.repetir(confirmado, hash, identidad);
      if (
        ConflictoTransaccion.reintentable(error) ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002')
      )
        throw new ConflictException(
          'El pedido cambió durante la operación. Reintenta con la misma clave de creación.',
        );
      throw error;
    }
  }

  private async insertar(
    tx: Prisma.TransactionClient,
    datos: CreatePedidoDto,
    identidad: IdentidadPedido,
    hash: string,
    archivo: ArchivoGuardado,
  ): Promise<PedidoCompleto> {
    const ahora = new Date();
    if (identidad.sesion) {
      const corte = new Date(ahora.getTime() - this.auth.inactividadMs);
      const activas = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT s.id FROM sesiones s
        INNER JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ${identidad.sesion.sesionId}
        AND s.usuario_id = ${identidad.sesion.usuario.id} AND s.revocada_en IS NULL
        AND s.expira_en > ${ahora} AND s.ultima_actividad_en > ${corte} AND u.activo = TRUE FOR UPDATE`;
      if (!activas.length)
        throw new UnauthorizedException(
          'La sesión venció antes de confirmar el pedido.',
        );
    }
    await tx.$queryRaw`SELECT id FROM configuracion_reserva WHERE id = 1 FOR UPDATE`;
    const politica = await tx.configuracionReserva.findUnique({
      where: { id: 1 },
    });
    if (!politica)
      throw new ServiceUnavailableException(
        'La configuración de reservas no está disponible.',
      );
    const verificada = await this.preparacion.verificar(tx, datos);
    const base = await this.registro.datos(
      tx,
      datos,
      identidad,
      hash,
      politica,
      verificada,
      ahora,
    );
    return tx.pedido.create({
      data: {
        ...base,
        pago: {
          create: {
            metodo: datos.metodoPago,
            comprobantes: {
              create: {
                version: 1,
                archivoClave: archivo.clave,
                archivoSha256: archivo.sha256,
                nombreArchivo: datos.comprobante.nombreArchivo,
                formato: archivo.formato,
                tamanoBytes: archivo.tamanoBytes,
                numeroOperacion: datos.comprobante.numeroOperacion,
              },
            },
          },
        },
      },
      include: INCLUIR_PEDIDO,
    });
  }

  async porClave(
    clave: string,
    identidad: IdentidadPedido,
  ): Promise<PedidoCompleto> {
    if (!UUID_PEDIDO.test(clave))
      throw new NotFoundException('Pedido no encontrado.');
    const p = await this.buscarClave(clave);
    if (!p || !this.puedeLeer(p, identidad))
      throw new NotFoundException('Pedido no encontrado.');
    return p;
  }

  async detalle(
    codigo: string,
    identidad: IdentidadPedido,
  ): Promise<PedidoCompleto> {
    if (!/^SOHO-[A-Z0-9]{6,24}$/.test(codigo))
      throw new NotFoundException('Pedido no encontrado.');
    const p = await this.prisma.pedido.findUnique({
      where: { codigo },
      include: INCLUIR_PEDIDO,
    });
    if (!p || !this.puedeLeer(p, identidad))
      throw new NotFoundException('Pedido no encontrado.');
    return p;
  }

  async listarMios(usuarioId: string, pagina: number, limite: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { usuarioId };
        const total = await tx.pedido.count({ where });
        const pedidos = await tx.pedido.findMany({
          where,
          include: INCLUIR_PEDIDO,
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          skip: (pagina - 1) * limite,
          take: limite,
        });
        return {
          pedidos: pedidos.map(respuestaPedido),
          paginacion: {
            pagina,
            limite,
            total,
            paginas: Math.ceil(total / limite),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async comprobante(codigo: string, id: string, identidad: IdentidadPedido) {
    const p = await this.detalle(codigo, identidad);
    const comprobante = p.pago?.comprobantes.find((c) => c.id === id);
    if (!comprobante) throw new NotFoundException('Comprobante no encontrado.');
    const imagen = await this.archivos.leerOptimizado(
      comprobante.archivoClave,
      comprobante.archivoSha256,
      comprobante.formato,
      comprobante.tamanoBytes,
    );
    return imagen;
  }
}
