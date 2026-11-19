import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type InstruccionPago } from '../generated/prisma/client.js';
import { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import type { IdentidadPedido } from '../pedidos/seguridad/sesion-pedido.guard.js';
import { ConfiguracionPedidos } from '../pedidos/configuracion-pedidos.js';
import { ConfiguracionCheckoutPagos } from '../pedidos/preparacion/configuracion-checkout-pagos.js';
import { PreparacionPedidoService } from '../pedidos/preparacion/preparacion-pedido.service.js';
import { InventarioReservadoService } from '../inventario/reservas/inventario-reservado.service.js';
import { ConfiguracionPagosService } from '../configuracion-pagos/configuracion-pagos.service.js';
import { DatosInstruccionPago } from './dto/datos-instruccion-pago.js';
import { RespuestaInstruccionPago } from './dto/respuesta-instruccion-pago.js';

@Injectable()
export class InstruccionesPagoService {
  constructor(
    @Inject(EscrituraAutorizadaService)
    private readonly escritura: EscrituraAutorizadaService,
    @Inject(ConfiguracionPagosService)
    private readonly pagos: ConfiguracionPagosService,
    @Inject(PreparacionPedidoService)
    private readonly preparar: PreparacionPedidoService,
    @Inject(InventarioReservadoService)
    private readonly inventario: InventarioReservadoService,
    @Inject(ConfiguracionCheckoutPagos)
    private readonly config: ConfiguracionCheckoutPagos,
    @Inject(ConfiguracionPedidos)
    private readonly pedidos: ConfiguracionPedidos,
  ) {}
  private dueno(
    i: Pick<InstruccionPago, 'usuarioId' | 'accesoInvitadoHash'>,
    identidad: IdentidadPedido,
  ) {
    return identidad.sesion
      ? i.usuarioId === identidad.sesion.usuario.id
      : i.usuarioId === null &&
          !!identidad.accesoInvitadoHash &&
          i.accesoInvitadoHash === identidad.accesoInvitadoHash;
  }
  async autorizar(
    tx: Prisma.TransactionClient,
    i: InstruccionPago,
    identidad: IdentidadPedido,
    expiraEn?: Date,
  ) {
    await this.escritura.comprobarSesion(tx, identidad.sesion, false);
    if (
      !this.dueno(i, identidad) ||
      (i.usuarioId === null &&
        (expiraEn?.getTime() ??
          i.emitidaEn.getTime() + this.pedidos.accesoInvitadoMs) <= Date.now())
    )
      throw new NotFoundException('Instrucción no encontrada.');
  }
  private respuesta(i: InstruccionPago) {
    return RespuestaInstruccionPago.leer(i, this.pedidos.accesoInvitadoMs);
  }
  metodos() {
    return this.escritura.transaccion(async (tx) => {
      const c = await this.pagos.leer(tx),
        v = c.versionActual;
      const metodos = this.config.habilitada
        ? (v?.metodos ?? [])
            .filter(
              (m) =>
                m.activo &&
                /^9[0-9]{8}$/.test(m.celular ?? '') &&
                !!m.titular?.trim() &&
                (!m.archivoQrId || m.archivoQr?.estado === 'DISPONIBLE'),
            )
            .sort((a, b) =>
              a.metodo === 'YAPE' ? -1 : b.metodo === 'YAPE' ? 1 : 0,
            )
            .map((m) => ({
              metodo: m.metodo,
              nombre: m.metodo === 'YAPE' ? 'Yape' : 'Plin',
            }))
        : [];
      return {
        version: v?.numero ?? 0,
        disponible: metodos.length > 0,
        metodos,
      };
    });
  }
  porClave(clave: string, identidad: IdentidadPedido) {
    return this.leer(
      { claveSolicitud: DatosInstruccionPago.uuid(clave) },
      identidad,
    );
  }
  porId(id: string, identidad: IdentidadPedido) {
    return this.leer({ id: DatosInstruccionPago.uuid(id) }, identidad);
  }
  private leer(
    where: Prisma.InstruccionPagoWhereUniqueInput,
    identidad: IdentidadPedido,
  ) {
    return this.escritura.transaccion(async (tx) => {
      const i = await tx.instruccionPago.findUnique({ where });
      if (!i) throw new NotFoundException('Instrucción no encontrada.');
      await this.autorizar(tx, i, identidad);
      return this.respuesta(i);
    });
  }
  async emitir(cuerpo: unknown, identidad: IdentidadPedido) {
    if (!identidad.sesion && !identidad.accesoInvitadoHash)
      throw new UnauthorizedException();
    const d = DatosInstruccionPago.emision(cuerpo),
      hash = DatosInstruccionPago.huella({
        versionContrato: 1,
        ...d,
        usuarioId: identidad.sesion?.usuario.id ?? null,
        accesoInvitadoHash: identidad.sesion
          ? null
          : identidad.accesoInvitadoHash,
      });
    const repetir = async (
      tx: Prisma.TransactionClient,
      i: InstruccionPago,
    ) => {
      await this.escritura.comprobarSesion(tx, identidad.sesion, false);
      if (!this.dueno(i, identidad) || i.solicitudHash !== hash)
        throw new ConflictException({
          codigo: 'CLAVE_INSTRUCCION_EN_USO',
          message: 'La clave ya corresponde a otra solicitud o propietario.',
        });
      await this.autorizar(tx, i, identidad);
      return { respuesta: this.respuesta(i), reutilizada: true };
    };
    try {
      return await this.escritura.transaccion(async (tx) => {
        // Exclusivo: publica o emite en orden y serializa también el primer propietario del checkout.
        await tx.$queryRaw`SELECT id FROM configuracion_pagos WHERE id=1 FOR UPDATE`;
        const anterior = await tx.instruccionPago.findUnique({
          where: { claveSolicitud: d.claveSolicitud },
        });
        if (anterior) return repetir(tx, anterior);
        if (!this.config.habilitada)
          throw new ServiceUnavailableException({
            codigo: 'CHECKOUT_PAGOS_NO_HABILITADO',
            message: 'La emisión de instrucciones todavía no está habilitada.',
          });
        await tx.$queryRaw`SELECT id FROM instrucciones_pago WHERE clave_creacion_pedido=${d.claveCreacionPedido} ORDER BY id FOR UPDATE`;
        const previas = await tx.instruccionPago.findMany({
          where: { claveCreacionPedido: d.claveCreacionPedido },
          select: { usuarioId: true, accesoInvitadoHash: true },
        });
        if (previas.some((i) => !this.dueno(i, identidad)))
          throw new ConflictException({
            codigo: 'CHECKOUT_EN_USO',
            message: 'La clave de compra ya está en uso.',
          });
        if (
          (await tx.pedido.findUnique({
            where: { claveCreacion: d.claveCreacionPedido },
            select: { id: true },
          })) ||
          (await tx.recepcionCompra.findUnique({
            where: { claveCreacionPedido: d.claveCreacionPedido },
            select: { id: true },
          }))
        )
          throw new ConflictException({
            codigo: 'CHECKOUT_YA_REGISTRADO',
            message:
              'Recupera la recepción o pedido de esta compra antes de continuar.',
          });
        const c = await this.pagos.leer(tx),
          v = c.versionActual;
        if (!v || v.numero !== d.versionConfiguracionEsperada)
          throw new ConflictException({
            codigo: 'CONFIGURACION_PAGOS_CAMBIADA',
            message:
              'La configuración cambió. Consulta los métodos antes de transferir.',
          });
        const m = v.metodos.find((m) => m.metodo === d.metodo)!;
        if (m.archivoQrId)
          await tx.$queryRaw`SELECT id FROM archivos_qr_pago WHERE id=${m.archivoQrId} FOR UPDATE`;
        const qr = m.archivoQrId
          ? await tx.archivoQrPago.findUnique({ where: { id: m.archivoQrId } })
          : null;
        if (
          !m.activo ||
          !m.celular ||
          !m.titular ||
          !/^9[0-9]{8}$/.test(m.celular) ||
          (m.archivoQrId &&
            (!qr ||
              qr.metodo !== m.metodo ||
              qr.estado !== 'DISPONIBLE' ||
              !qr.confirmadoEn ||
              !qr.urlEntrega))
        )
          throw new UnprocessableEntityException({
            codigo: 'METODO_PAGO_NO_DISPONIBLE',
            message: 'El método no está disponible para emitir instrucciones.',
          });
        const p = await this.preparar.verificar(tx, d.preparacion);
        await this.inventario.bloquear(
          tx,
          p.lineas.map((l) => l.variante.id),
        );
        await this.escritura.comprobarSesion(tx, identidad.sesion, false);
        const id = randomUUID(),
          ahora = new Date();
        const respuesta = {
          versionContrato: 1,
          instruccionId: id,
          claveCreacionPedido: d.claveCreacionPedido,
          metodo: m.metodo,
          versionConfiguracion: v.numero,
          emitidaEn: ahora.toISOString(),
          moneda: 'PEN',
          importeReferencia: p.total.toFixed(2),
          preparacion: d.preparacion,
          verificacion: {
            distritoNombre: p.zona.nombre,
            subtotal: p.subtotal.toFixed(2),
            costoEnvio: p.zona.tarifa!.toFixed(2),
            plazoEntrega: p.zona.plazo,
            total: p.total.toFixed(2),
            articulos: p.lineas.map((l) => ({
              varianteId: l.variante.id,
              productoId: l.producto.id,
              sku: l.variante.sku,
              nombreProducto: l.producto.nombre,
              color: l.convertido
                ? l.producto.colorNombre!
                : l.variante.productoColor.nombre,
              sistemaTalla: l.variante.talla.sistema,
              talla: l.variante.talla.valor.toString(),
              cantidad: l.entrada.cantidad,
              precioUnitario: l.producto.precio!.toFixed(2),
              importe: l.bruto.toFixed(2),
            })),
          },
          destino: {
            celular: m.celular,
            titular: m.titular,
            qr: qr
              ? {
                  id: qr.id,
                  url: qr.urlEntrega!,
                  formato: qr.formato,
                  ancho: qr.ancho,
                  alto: qr.alto,
                }
              : null,
          },
          accesoExpiraEn: identidad.sesion
            ? null
            : new Date(
                ahora.getTime() + this.pedidos.accesoInvitadoMs,
              ).toISOString(),
        };
        const i = await tx.instruccionPago.create({
          data: {
            id,
            metodoConfiguradoId: m.id,
            metodo: m.metodo,
            claveSolicitud: d.claveSolicitud,
            solicitudHash: hash,
            preparacionHash: DatosInstruccionPago.huellaPreparacion(
              d.preparacion,
            ),
            claveCreacionPedido: d.claveCreacionPedido,
            usuarioId: identidad.sesion?.usuario.id ?? null,
            accesoInvitadoHash: identidad.sesion
              ? null
              : identidad.accesoInvitadoHash,
            moneda: 'PEN',
            importeReferencia: p.total,
            respuesta: respuesta as Prisma.InputJsonValue,
            emitidaEn: ahora,
          },
        });
        return { respuesta: this.respuesta(i), reutilizada: false };
      });
    } catch (error) {
      // Recupera una escritura confirmada aunque el transporte falle después del COMMIT.
      const encontrado = await this.escritura.transaccion(async (tx) => {
        const i = await tx.instruccionPago.findUnique({
          where: { claveSolicitud: d.claveSolicitud },
        });
        return i ? repetir(tx, i) : null;
      });
      if (encontrado) return encontrado;
      throw error;
    }
  }
}
