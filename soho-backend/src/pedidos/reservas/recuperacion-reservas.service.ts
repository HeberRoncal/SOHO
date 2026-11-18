import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { EscrituraPedidoService } from '../seguridad/escritura-pedido.service.js';
import { InventarioReservadoService } from '../../inventario/reservas/inventario-reservado.service.js';
import { EstadoReservasPedido } from './estado-reservas-pedido.js';
import {
  INCLUIR_ADMIN,
  respuestaAdmin,
  type PedidoAdmin,
} from '../dto/respuesta-administracion.js';
import type { RecuperarReservasDto } from '../dto/recuperar-reservas.dto.js';

@Injectable()
export class RecuperacionReservasService {
  constructor(
    @Inject(EscrituraPedidoService)
    private readonly escritura: EscrituraPedidoService,
    @Inject(InventarioReservadoService)
    private readonly inventario: InventarioReservadoService,
  ) {}

  private codigo(codigo: string) {
    if (!/^SOHO-[A-Z0-9]{6,24}$/.test(codigo))
      throw new NotFoundException('Pedido no encontrado.');
  }

  private async plan(tx: Prisma.TransactionClient, p: PedidoAdmin) {
    let diagnostico = EstadoReservasPedido.diagnosticar(p);
    const variantes = diagnostico.motivoBloqueo
      ? []
      : await this.inventario.bloquear(
          tx,
          p.articulos.map((a) => a.varianteId),
        );
    // Esperar el inventario también puede hacer vencer otra reserva del pedido.
    const ahora = new Date();
    if (!diagnostico.motivoBloqueo)
      diagnostico = EstadoReservasPedido.diagnosticar(p, ahora);
    const articulos = diagnostico.motivoBloqueo
      ? []
      : diagnostico.recuperar.map(({ articulo: a, anterior: r }) => {
          const v = variantes.find((v) => v.id === a.varianteId)!;
          return {
            id: a.id,
            sku: a.sku,
            nombre: a.nombreProducto,
            cantidad: a.cantidad,
            disponibles: Math.max(0, v.existencias - v.cantidadReservada),
            habilitada: v.habilitada,
            reservaAnteriorId: r.id,
            horas: r.horas!,
            accionVencimiento: r.accionVencimiento!,
            accionCancelacion: r.accionCancelacion,
            configuracionVersion: r.configuracionVersion,
          };
        });
    const motivoBloqueo =
      diagnostico.motivoBloqueo ??
      (variantes.some((v) => v.existencias < v.cantidadReservada)
        ? 'El stock físico no cubre las reservas existentes. Revisa el inventario.'
        : articulos.some((a) => !a.habilitada)
          ? 'Hay variantes deshabilitadas para reservar.'
          : articulos.some((a) => a.disponibles < a.cantidad)
            ? 'Faltan unidades disponibles. No se recuperará ninguna reserva parcialmente.'
            : null);
    return {
      diagnostico,
      ahora,
      variantes,
      respuesta: {
        codigo: p.codigo,
        versionPedido: p.version,
        versionPago: p.pago!.version,
        puedeRecuperar: !motivoBloqueo,
        motivoBloqueo,
        articulos,
        unidadesConservadas: diagnostico.conservar.reduce(
          (n, a) => n + a.cantidad,
          0,
        ),
      },
    };
  }

  consultar(codigo: string, sesion: ContextoAuth) {
    this.codigo(codigo);
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.sesion(tx, { sesion }, true);
      const p = await this.escritura.bloquear(tx, codigo),
        plan = await this.plan(tx, p);
      return { pedido: respuestaAdmin(p), recuperacion: plan.respuesta };
    });
  }

  recuperar(codigo: string, d: RecuperarReservasDto, sesion: ContextoAuth) {
    this.codigo(codigo);
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.sesion(tx, { sesion }, true);
      const p = await this.escritura.bloquear(tx, codigo);
      if (p.version !== d.versionPedido || p.pago!.version !== d.versionPago)
        throw new ConflictException({
          codigo: 'RECUPERACION_CAMBIADA',
          message:
            'El pedido o su pago cambiaron. Actualiza antes de confirmar.',
        });
      const plan = await this.plan(tx, p);
      if (!plan.respuesta.puedeRecuperar)
        throw new ConflictException({
          codigo: 'RESERVAS_NO_RECUPERABLES',
          message: plan.respuesta.motivoBloqueo,
        });
      let secuencia = (p.eventos.at(-1)?.secuencia ?? 0) + 1;
      for (const { articulo: a, anterior: r } of plan.diagnostico.recuperar) {
        const nueva = await tx.reservaInventario.create({
          data: {
            pedidoArticuloId: a.id,
            cantidad: a.cantidad,
            configuracionId: r.configuracionId,
            configuracionVersion: r.configuracionVersion,
            modo: r.modo,
            horas: r.horas,
            accionVencimiento: r.accionVencimiento,
            accionCancelacion: r.accionCancelacion,
            creadoEn: plan.ahora,
            venceEn: new Date(plan.ahora.getTime() + r.horas! * 3600000),
          },
        });
        const v = plan.variantes.find((v) => v.id === a.varianteId)!;
        const saldo = await tx.variante.updateMany({
          where: {
            id: v.id,
            habilitada: true,
            cantidadReservada: v.cantidadReservada,
            existencias: v.existencias,
          },
          data: { cantidadReservada: { increment: a.cantidad } },
        });
        if (saldo.count !== 1)
          throw new ConflictException(
            'El inventario cambió durante la recuperación.',
          );
        await tx.eventoPedido.create({
          data: {
            pedidoId: p.id,
            secuencia: secuencia++,
            versionPedido: p.version + 1,
            tipo: 'RESERVA_CREADA',
            actor: 'ADMIN',
            responsableId: sesion.usuario.id,
            visibilidad: 'INTERNA',
            fecha: plan.ahora,
            titulo: 'Reserva recuperada',
            descripcion: `SKU ${a.sku} · ${a.cantidad} unidades. Reserva ${nueva.id}, reemplaza a ${r.id}. Plazo renovado: ${r.horas} horas; vence ${nueva.venceEn!.toISOString()}. Política histórica ${r.configuracionVersion}.`,
          },
        });
      }
      await tx.pedido.update({
        where: { id: p.id },
        data: { estadoEntrega: 'PENDIENTE', version: { increment: 1 } },
      });
      await tx.eventoPedido.create({
        data: {
          pedidoId: p.id,
          secuencia,
          versionPedido: p.version + 1,
          tipo: 'ENTREGA_CAMBIADA',
          actor: 'ADMIN',
          responsableId: sesion.usuario.id,
          visibilidad: 'INTERNA',
          fecha: plan.ahora,
          titulo: EstadoReservasPedido.tituloRecuperacion,
          descripcion: d.motivo,
        },
      });
      return {
        pedido: respuestaAdmin(
          await tx.pedido.findUniqueOrThrow({
            where: { id: p.id },
            include: INCLUIR_ADMIN,
          }),
        ),
      };
    });
  }
}
