import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  Prisma,
  ConfiguracionReserva,
  InstruccionPago,
} from '../../generated/prisma/client.js';
import { ConfiguracionPedidos } from '../configuracion-pedidos.js';
import type { PreparacionPedido } from './preparacion-pedido.interface.js';
import type { PreparacionPedidoService } from './preparacion-pedido.service.js';
import type { IdentidadPedido } from '../seguridad/sesion-pedido.guard.js';

@Injectable()
export class RegistroPedidoService {
  constructor(
    @Inject(ConfiguracionPedidos) private readonly config: ConfiguracionPedidos,
  ) {}
  async datos(
    tx: Prisma.TransactionClient,
    datos: PreparacionPedido & { claveCreacion: string },
    identidad: IdentidadPedido,
    hash: string,
    politica: ConfiguracionReserva,
    verificada: Awaited<ReturnType<PreparacionPedidoService['verificar']>>,
    ahora: Date,
    propietario?: Pick<InstruccionPago, 'usuarioId' | 'accesoInvitadoHash'>,
  ): Promise<Prisma.PedidoCreateInput> {
    const { zona, subtotal, total, lineas, costoEnvio } = verificada;
    const articulos: Prisma.PedidoArticuloCreateWithoutPedidoInput[] = [];
    for (const {
      orden,
      entrada: a,
      variante: v,
      producto: p,
      convertido,
      fotoActual,
      imagen,
      bruto,
      precioUnitario,
    } of lineas) {
      articulos.push({
        orden,
        variante: { connect: { id: v.id } },
        sku: v.sku,
        nombreProducto: p.nombre,
        color: convertido ? p.colorNombre! : v.productoColor.nombre,
        sistemaTalla: v.talla.sistema,
        talla: v.talla.valor,
        imagen,
        ...(fotoActual?.archivoId
          ? { archivoImagen: { connect: { id: fotoActual.archivoId } } }
          : {}),
        cantidad: a.cantidad,
        precioUnitario,
        importeBruto: bruto,
        descuento: 0,
        importeNeto: bruto,
        unidades: {
          create: Array.from({ length: a.cantidad }, (_, i) => ({
            numero: i + 1,
            importeBruto: precioUnitario,
            descuento: 0,
            importeNeto: precioUnitario,
          })),
        },
        reservas: {
          create: {
            cantidad: a.cantidad,
            configuracionVersion: politica.version,
            configuracion: { connect: { id: politica.id } },
            modo: politica.modo,
            horas: politica.horas,
            accionVencimiento: politica.accionVencimiento,
            accionCancelacion: politica.accionCancelacion,
            creadoEn: ahora,
            venceEn:
              politica.modo === 'TIEMPO'
                ? new Date(ahora.getTime() + politica.horas! * 3_600_000)
                : null,
          },
        },
      });
      await tx.variante.update({
        where: { id: v.id },
        data: { cantidadReservada: { increment: a.cantidad } },
      });
    }
    const responsableId = identidad.sesion?.usuario.id;
    const usuarioId = propietario ? propietario.usuarioId : responsableId;
    const actor = responsableId
      ? identidad.sesion!.usuario.rol === 'ADMIN'
        ? 'ADMIN'
        : 'CLIENTE'
      : 'SISTEMA';
    return {
      codigo: `SOHO-${randomBytes(8).toString('hex').toUpperCase()}`,
      claveCreacion: datos.claveCreacion,
      solicitudHash: hash,
      ...(usuarioId
        ? { usuario: { connect: { id: usuarioId } } }
        : {
            accesoInvitadoHash: propietario
              ? propietario.accesoInvitadoHash
              : identidad.accesoInvitadoHash,
            accesoInvitadoExpiraEn: new Date(
              ahora.getTime() + this.config.accesoInvitadoMs,
            ),
          }),
      ...datos.contacto,
      destinatario: datos.entrega.destinatario,
      celular: datos.entrega.celular,
      distritoCodigo: zona.codigo,
      distritoNombre: zona.nombre,
      direccion: datos.entrega.direccion,
      referencia: datos.entrega.referencia,
      plazoEntrega: zona.plazo,
      subtotal,
      descuento: 0,
      costoEnvio,
      total,
      creadoEn: ahora,
      articulos: { create: articulos },
      ...(datos.facturacion
        ? { facturacion: { create: datos.facturacion } }
        : {}),
      eventos: {
        create: [
          {
            tipo: 'CREADO' as const,
            titulo: 'Pedido recibido',
            descripcion: 'Recibimos tu pedido y sus datos de entrega.',
          },
          {
            tipo: 'COMPROBANTE_ADJUNTADO' as const,
            titulo: 'Comprobante recibido',
            descripcion: 'El comprobante está pendiente de revisión.',
          },
          {
            tipo: 'RESERVA_CREADA' as const,
            titulo: 'Unidades reservadas',
            descripcion: 'Las unidades quedaron reservadas para este pedido.',
          },
        ].map((e, i) => ({
          ...e,
          secuencia: i + 1,
          versionPedido: 1,
          actor,
          ...(responsableId
            ? { responsable: { connect: { id: responsableId } } }
            : {}),
          visibilidad: 'CLIENTE' as const,
          fecha: ahora,
        })),
      },
    };
  }
}
