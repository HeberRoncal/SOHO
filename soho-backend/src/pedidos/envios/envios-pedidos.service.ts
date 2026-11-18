import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import type {
  AccionEntrega,
  CambioEntregaDto,
} from '../dto/cambio-entrega.dto.js';
import {
  INCLUIR_ADMIN,
  respuestaAdmin,
  type PedidoAdmin,
} from '../dto/respuesta-administracion.js';
import { EscrituraPedidoService } from '../seguridad/escritura-pedido.service.js';
import { InventarioReservadoService } from '../../inventario/reservas/inventario-reservado.service.js';

function conflicto(message: string, codigo = 'ENTREGA_CAMBIADA'): never {
  throw new ConflictException({ codigo, message });
}

@Injectable()
export class EnviosPedidosService {
  constructor(
    @Inject(EscrituraPedidoService)
    private readonly escritura: EscrituraPedidoService,
    @Inject(InventarioReservadoService)
    private readonly reservado: InventarioReservadoService,
  ) {}

  async cambiar(
    codigo: string,
    accion: AccionEntrega,
    d: CambioEntregaDto,
    sesion: ContextoAuth,
  ) {
    if (!/^SOHO-[A-Z0-9]{6,24}$/.test(codigo))
      throw new NotFoundException('Pedido no encontrado.');
    return this.escritura.transaccion(async (tx) => {
      await this.escritura.sesion(tx, { sesion }, true);
      const p = await this.escritura.bloquear(tx, codigo);
      const previo = {
        PREPARAR: 'CONFIRMADO',
        ENVIAR: 'EN_PREPARACION',
        ENTREGAR: 'ENVIADO',
      } as const;
      if (
        p.version !== d.versionPedido ||
        p.version >= 4294967295 ||
        p.pago?.estado !== 'APROBADO' ||
        p.estadoEntrega !== previo[accion]
      )
        conflicto(
          'El pedido cambió o no permite esta acción. Actualiza antes de continuar.',
        );
      const ahora = new Date(),
        responsable = sesion.usuario.id;
      let estado: 'EN_PREPARACION' | 'ENVIADO' | 'ENTREGADO';
      if (accion === 'PREPARAR') {
        if (p.envio)
          conflicto('El pedido ya tiene una preparación registrada.');
        await this.inventario(tx, p);
        await tx.envioPedido.create({
          data: {
            pedidoId: p.id,
            preparacionIniciadaEn: ahora,
            preparacionIniciadaPorId: responsable,
          },
        });
        estado = 'EN_PREPARACION';
      } else if (accion === 'ENVIAR') {
        if (
          !p.envio ||
          p.envio.despachadoEn ||
          p.envio.entregadoEn ||
          ahora < p.envio.preparacionIniciadaEn
        )
          conflicto('La preparación no permite registrar un despacho.');
        if (!d.transportista || !d.referenciaSeguimiento)
          conflicto('Completa los datos del despacho.');
        if (
          await tx.movimientoInventario.count({
            where: { envioPedidoId: p.envio.id },
          })
        )
          conflicto('El envío ya tiene movimientos registrados.');
        const variantes = await this.inventario(tx, p);
        await tx.envioPedido.update({
          where: { id: p.envio.id },
          data: {
            transportista: d.transportista,
            referenciaSeguimiento: d.referenciaSeguimiento,
            despachadoEn: ahora,
            despachadoPorId: responsable,
          },
        });
        for (const a of [...p.articulos].sort((a, b) =>
          a.varianteId.localeCompare(b.varianteId),
        )) {
          const v = variantes.find((v) => v.id === a.varianteId)!;
          if (v.versionExistencias >= 4294967295)
            conflicto(
              'La versión del inventario alcanzó su límite.',
              'INVENTARIO_INCONSISTENTE',
            );
          const reserva = a.reservas.find((r) => r.estado === 'ACTIVA')!;
          const consumida = await tx.reservaInventario.updateMany({
            where: { id: reserva.id, estado: 'ACTIVA', cantidad: a.cantidad },
            data: {
              estado: 'CONSUMIDA',
              cerradaEn: ahora,
              motivoCierre: 'Consumida al registrar el envío del pedido.',
            },
          });
          if (consumida.count !== 1)
            conflicto(
              'La reserva cambió durante el despacho.',
              'INVENTARIO_INCONSISTENTE',
            );
          const saldo = await tx.variante.updateMany({
            where: {
              id: v.id,
              existencias: v.existencias,
              versionExistencias: v.versionExistencias,
              cantidadReservada: v.cantidadReservada,
            },
            data: {
              existencias: { decrement: a.cantidad },
              versionExistencias: { increment: 1 },
              cantidadReservada: { decrement: a.cantidad },
            },
          });
          if (saldo.count !== 1)
            conflicto(
              'El inventario cambió durante el despacho.',
              'INVENTARIO_INCONSISTENTE',
            );
          await tx.movimientoInventario.create({
            data: {
              varianteId: v.id,
              envioPedidoId: p.envio.id,
              usuarioResponsableId: responsable,
              tipo: 'SALIDA',
              origen: 'ENVIO_PEDIDO',
              cantidad: -a.cantidad,
              saldoAnterior: v.existencias,
              saldoPosterior: v.existencias - a.cantidad,
              cantidadReservada: v.cantidadReservada - a.cantidad,
              varianteHabilitada: v.habilitada,
              motivo: 'Salida por envío del pedido.',
              referencia: p.codigo,
              fecha: ahora,
            },
          });
        }
        estado = 'ENVIADO';
      } else {
        if (
          d.confirmado !== true ||
          !p.envio?.despachadoEn ||
          p.envio.entregadoEn ||
          ahora < p.envio.despachadoEn
        )
          conflicto('Confirma una entrega posterior al despacho registrado.');
        const movimientos = await tx.movimientoInventario.findMany({
          where: { envioPedidoId: p.envio.id },
        });
        if (
          !p.articulos.length ||
          movimientos.length !== p.articulos.length ||
          p.articulos.some((a) => {
            const m = movimientos.find((m) => m.varianteId === a.varianteId);
            return (
              !m ||
              m.origen !== 'ENVIO_PEDIDO' ||
              m.tipo !== 'SALIDA' ||
              m.cantidad !== -a.cantidad ||
              a.reservas.some((r) => r.estado === 'ACTIVA') ||
              a.reservas
                .filter((r) => r.estado === 'CONSUMIDA')
                .reduce((n, r) => n + r.cantidad, 0) !== a.cantidad
            );
          })
        )
          conflicto(
            'El despacho tiene reservas o movimientos inconsistentes.',
            'INVENTARIO_INCONSISTENTE',
          );
        await tx.envioPedido.update({
          where: { id: p.envio.id },
          data: { entregadoEn: ahora, entregaRegistradaPorId: responsable },
        });
        estado = 'ENTREGADO';
      }
      await tx.pedido.update({
        where: { id: p.id },
        data: { estadoEntrega: estado, version: { increment: 1 } },
      });
      let secuencia = (p.eventos.at(-1)?.secuencia ?? 0) + 1;
      const evento = (
        tipo: 'ENTREGA_CAMBIADA' | 'RESERVA_CONSUMIDA' | 'NOTA_INTERNA',
        titulo: string,
        descripcion: string,
        interna = false,
      ) =>
        tx.eventoPedido.create({
          data: {
            pedidoId: p.id,
            versionPedido: p.version + 1,
            secuencia: secuencia++,
            tipo,
            titulo,
            descripcion,
            actor: 'ADMIN',
            responsableId: responsable,
            visibilidad: interna ? 'INTERNA' : 'CLIENTE',
            fecha: ahora,
          },
        });
      const textos = {
        PREPARAR: ['Preparación iniciada', 'Estamos preparando tu pedido.'],
        ENVIAR: [
          'Pedido enviado',
          'Tu pedido fue despachado. Consulta los datos de seguimiento.',
        ],
        ENTREGAR: ['Pedido entregado', 'Se registró la entrega de tu pedido.'],
      } as const;
      await evento('ENTREGA_CAMBIADA', textos[accion][0], textos[accion][1]);
      if (accion === 'ENVIAR')
        await evento(
          'RESERVA_CONSUMIDA',
          'Reserva consumida',
          'Las unidades reservadas se descontaron al enviar el pedido.',
        );
      if (d.nota) await evento('NOTA_INTERNA', 'Nota de entrega', d.nota, true);
      const actualizado = await tx.pedido.findUniqueOrThrow({
        where: { id: p.id },
        include: INCLUIR_ADMIN,
      });
      return { pedido: respuestaAdmin(actualizado) };
    });
  }

  private async inventario(tx: Prisma.TransactionClient, p: PedidoAdmin) {
    if (
      !p.articulos.length ||
      p.articulos.some((a) => {
        const activas = a.reservas.filter((r) => r.estado === 'ACTIVA');
        return (
          activas.length !== 1 ||
          activas[0].cantidad !== a.cantidad ||
          a.reservas.some((r) => r.estado === 'CONSUMIDA')
        );
      })
    )
      conflicto(
        'El pedido no conserva todas sus reservas activas.',
        'INVENTARIO_INCONSISTENTE',
      );
    const variantes = await this.reservado.bloquear(
      tx,
      p.articulos.map((a) => a.varianteId),
    );
    if (variantes.some((v) => v.existencias < v.cantidadReservada))
      conflicto(
        'El stock físico y las reservas no coinciden. Revisa el inventario antes de continuar.',
        'INVENTARIO_INCONSISTENTE',
      );
    return variantes;
  }
}
