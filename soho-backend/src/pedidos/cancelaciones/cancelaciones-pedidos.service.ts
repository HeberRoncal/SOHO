import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import type { CancelarPedidoDto } from '../dto/cancelar-pedido.dto.js';
import type { LiberarReservasCancelacionDto } from '../dto/liberar-reservas-cancelacion.dto.js';
import {
  INCLUIR_ADMIN,
  respuestaAdmin,
  type PedidoAdmin,
} from '../dto/respuesta-administracion.js';
import { EscrituraPedidoService } from '../seguridad/escritura-pedido.service.js';
import { InventarioReservadoService } from '../../inventario/reservas/inventario-reservado.service.js';

function conflicto(
  message = 'El pedido cambió o no permite esta acción. Actualiza antes de continuar.',
  inventario = false,
): never {
  throw new ConflictException({
    codigo: inventario ? 'INVENTARIO_INCONSISTENTE' : 'CANCELACION_CAMBIADA',
    message,
  });
}
type Reserva = PedidoAdmin['articulos'][number]['reservas'][number];

@Injectable()
export class CancelacionesPedidosService {
  constructor(
    @Inject(EscrituraPedidoService)
    private readonly escritura: EscrituraPedidoService,
    @Inject(InventarioReservadoService)
    private readonly inventario: InventarioReservadoService,
  ) {}

  async cancelar(codigo: string, d: CancelarPedidoDto, sesion: ContextoAuth) {
    this.codigo(codigo);
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.sesion(tx, { sesion }, true);
      const p = await this.escritura.bloquear(tx, codigo);
      this.versiones(p, d);
      if (
        !['PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 'INCIDENCIA'].includes(
          p.estadoEntrega,
        ) ||
        p.cancelacion
      )
        conflicto();
      await this.sinDespacho(tx, p);
      const { variantes, activas } = await this.reservas(tx, p);
      const consultadas = activas.filter(
        (r) => r.accionCancelacion === 'PREGUNTAR',
      );
      if (
        consultadas.length > 0 !==
        (d.decisionReservasConsultadas !== undefined)
      )
        throw new BadRequestException({
          codigo: 'DECISION_RESERVAS_INVALIDA',
          message: consultadas.length
            ? 'Elige liberar o conservar las reservas que requieren decisión.'
            : 'Este pedido no tiene reservas activas que requieran esa decisión.',
        });
      const liberar = activas.filter(
        (r) =>
          r.accionCancelacion === 'LIBERAR' ||
          d.decisionReservasConsultadas === 'LIBERAR',
      );
      const ahora = new Date();
      this.fecha(p, ahora);
      if (activas.some((r) => r.creadoEn > ahora))
        conflicto(
          'La fecha de una reserva no permite registrar la cancelación.',
        );
      const pago = p.pago!;
      const anular = !['APROBADO', 'ANULADO'].includes(pago.estado);
      if (anular && pago.version >= 4294967295)
        conflicto('El pago alcanzó el límite de versiones.');
      await tx.cancelacionPedido.create({
        data: {
          pedidoId: p.id,
          motivo: d.motivo,
          canceladaEn: ahora,
          registradaPorId: sesion.usuario.id,
          estadoEntregaAnterior: p.estadoEntrega,
          estadoPagoAnterior: pago.estado,
          versionPedido: p.version + 1,
          decisionReservasConsultadas: d.decisionReservasConsultadas ?? null,
        },
      });
      await this.liberarInventario(tx, p, variantes, liberar, ahora);
      if (anular)
        await tx.pagoPedido.update({
          where: { id: pago.id },
          data: { estado: 'ANULADO', version: { increment: 1 } },
        });
      await tx.pedido.update({
        where: { id: p.id },
        data: { estadoEntrega: 'CANCELADO', version: { increment: 1 } },
      });
      let secuencia = (p.eventos.at(-1)?.secuencia ?? 0) + 1;
      await this.evento(
        tx,
        p,
        sesion,
        ahora,
        secuencia++,
        'ENTREGA_CAMBIADA',
        'Pedido cancelado',
        'Se registró la cancelación de tu pedido.',
        false,
      );
      if (anular)
        await this.evento(
          tx,
          p,
          sesion,
          ahora,
          secuencia++,
          'PAGO_ANULADO',
          'Pago anulado',
          'La revisión del pago quedó cerrada por la cancelación. Se conserva el historial de comprobantes.',
          false,
        );
      if (liberar.length)
        await this.evento(
          tx,
          p,
          sesion,
          ahora,
          secuencia++,
          'RESERVA_LIBERADA',
          'Reservas liberadas al cancelar',
          'Se liberaron las unidades reservadas de este pedido.',
          true,
        );
      await this.evento(
        tx,
        p,
        sesion,
        ahora,
        secuencia,
        'NOTA_INTERNA',
        'Motivo de cancelación',
        d.motivo +
          (consultadas.length
            ? `\nDecisión sobre reservas consultadas: ${d.decisionReservasConsultadas}.`
            : ''),
        true,
      );
      return this.respuesta(tx, p.id);
    });
  }

  async liberar(
    codigo: string,
    d: LiberarReservasCancelacionDto,
    sesion: ContextoAuth,
  ) {
    this.codigo(codigo);
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.sesion(tx, { sesion }, true);
      const p = await this.escritura.bloquear(tx, codigo);
      this.versiones(p, d);
      if (
        p.estadoEntrega !== 'CANCELADO' ||
        p.cancelacion?.decisionReservasConsultadas !== 'CONSERVAR' ||
        !['APROBADO', 'ANULADO'].includes(p.pago!.estado)
      )
        conflicto(
          'El pedido no tiene una conservación de reservas canceladas pendiente de liberar.',
        );
      await this.sinDespacho(tx, p);
      const { variantes, activas } = await this.reservas(tx, p);
      if (!activas.length)
        conflicto('Las reservas ya están liberadas. Actualiza el pedido.');
      if (activas.some((r) => r.accionCancelacion !== 'PREGUNTAR'))
        conflicto(
          'El pedido cancelado conserva reservas incompatibles con su decisión.',
          true,
        );
      const ahora = new Date();
      this.fecha(p, ahora);
      if (
        p.cancelacion.versionPedido > p.version ||
        p.cancelacion.canceladaEn > ahora ||
        activas.some((r) => r.creadoEn > ahora)
      )
        conflicto(
          'Las fechas o versiones de la cancelación requieren revisión.',
        );
      await this.liberarInventario(tx, p, variantes, activas, ahora);
      await tx.pedido.update({
        where: { id: p.id },
        data: { version: { increment: 1 } },
      });
      await this.evento(
        tx,
        p,
        sesion,
        ahora,
        (p.eventos.at(-1)?.secuencia ?? 0) + 1,
        'RESERVA_LIBERADA',
        'Reservas retenidas liberadas',
        'Se liberaron las reservas conservadas al cancelar el pedido.',
        true,
      );
      return this.respuesta(tx, p.id);
    });
  }

  private codigo(codigo: string) {
    if (!/^SOHO-[A-Z0-9]{6,24}$/.test(codigo))
      throw new NotFoundException('Pedido no encontrado.');
  }
  private versiones(p: PedidoAdmin, d: LiberarReservasCancelacionDto) {
    if (
      d.confirmado !== true ||
      p.version !== d.versionPedido ||
      p.pago!.version !== d.versionPago ||
      p.version >= 4294967295
    )
      conflicto();
  }
  private fecha(p: PedidoAdmin, ahora: Date) {
    if (
      p.creadoEn > ahora ||
      p.actualizadoEn > ahora ||
      p.pago!.actualizadoEn > ahora ||
      (p.envio && p.envio.preparacionIniciadaEn > ahora)
    )
      conflicto('Las fechas del pedido no permiten registrar esta acción.');
  }
  private async sinDespacho(tx: Prisma.TransactionClient, p: PedidoAdmin) {
    if (
      p.envio?.despachadoEn ||
      p.envio?.entregadoEn ||
      p.articulos.some((a) =>
        a.reservas.some((r) => r.estado === 'CONSUMIDA'),
      ) ||
      (await tx.movimientoInventario.count({
        where: { envioPedido: { pedidoId: p.id } },
      }))
    )
      conflicto(
        'El pedido tiene un despacho o consumo registrado y no permite esta operación.',
      );
  }
  private async reservas(tx: Prisma.TransactionClient, p: PedidoAdmin) {
    const variantes = await this.inventario.bloquear(
      tx,
      p.articulos.map((a) => a.varianteId),
    );
    const reservas = await tx.reservaInventario.findMany({
      where: { articulo: { pedidoId: p.id } },
    });
    if (
      reservas.some((r) => r.estado === 'CONSUMIDA') ||
      p.articulos.some((a) => {
        const activas = reservas.filter(
          (r) => r.pedidoArticuloId === a.id && r.estado === 'ACTIVA',
        );
        return (
          activas.length > 1 ||
          (activas.length === 1 && activas[0].cantidad !== a.cantidad)
        );
      })
    )
      conflicto(
        'Las cantidades o estados de las reservas requieren conciliación.',
        true,
      );
    return {
      variantes,
      activas: reservas.filter((r) => r.estado === 'ACTIVA'),
    };
  }
  private async liberarInventario(
    tx: Prisma.TransactionClient,
    p: PedidoAdmin,
    variantes: Awaited<ReturnType<InventarioReservadoService['bloquear']>>,
    reservas: Reserva[],
    ahora: Date,
  ) {
    for (const v of variantes.toSorted((a, b) => a.id.localeCompare(b.id))) {
      const articulo = p.articulos.find((a) => a.varianteId === v.id)!;
      const propias = reservas.filter(
        (r) => r.pedidoArticuloId === articulo.id,
      );
      const cantidad = propias.reduce((n, r) => n + r.cantidad, 0);
      if (!cantidad) continue;
      if (v.cantidadReservada < cantidad)
        conflicto(
          'El contador reservado no permite liberar las unidades.',
          true,
        );
      const saldo = await tx.variante.updateMany({
        where: { id: v.id, cantidadReservada: v.cantidadReservada },
        data: { cantidadReservada: { decrement: cantidad } },
      });
      if (saldo.count !== 1)
        conflicto('El inventario reservado cambió durante la operación.', true);
      const cerradas = await tx.reservaInventario.updateMany({
        where: { id: { in: propias.map((r) => r.id) }, estado: 'ACTIVA' },
        data: {
          estado: 'LIBERADA',
          cerradaEn: ahora,
          motivoCierre:
            p.estadoEntrega === 'CANCELADO'
              ? 'Liberación de reservas retenidas tras cancelación'
              : 'Pedido cancelado',
        },
      });
      if (cerradas.count !== propias.length)
        conflicto('Las reservas cambiaron durante la liberación.', true);
    }
  }
  private evento(
    tx: Prisma.TransactionClient,
    p: PedidoAdmin,
    sesion: ContextoAuth,
    fecha: Date,
    secuencia: number,
    tipo:
      'ENTREGA_CAMBIADA' | 'PAGO_ANULADO' | 'RESERVA_LIBERADA' | 'NOTA_INTERNA',
    titulo: string,
    descripcion: string,
    interna: boolean,
  ) {
    return tx.eventoPedido.create({
      data: {
        pedidoId: p.id,
        versionPedido: p.version + 1,
        secuencia,
        tipo,
        titulo,
        descripcion,
        visibilidad: interna ? 'INTERNA' : 'CLIENTE',
        actor: 'ADMIN',
        responsableId: sesion.usuario.id,
        fecha,
      },
    });
  }
  private async respuesta(tx: Prisma.TransactionClient, id: string) {
    return {
      pedido: respuestaAdmin(
        await tx.pedido.findUniqueOrThrow({
          where: { id },
          include: INCLUIR_ADMIN,
        }),
      ),
    };
  }
}
