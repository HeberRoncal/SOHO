import { Injectable, computed, signal } from '@angular/core';
import { PedidoAdmin } from '../modelos/pedido-admin';
import { SolicitudCancelacionAdmin, erroresCancelacionPedido } from '../modelos/cancelacion-admin';

interface RegistroCancelacion {
  readonly codigo: string;
  readonly cancelacion: NonNullable<PedidoAdmin['cancelacion']>;
  readonly evento: PedidoAdmin['eventos'][number];
}
@Injectable({ providedIn: 'root' })
export class CancelacionesAdministracionPrueba {
  private readonly registros = signal<readonly RegistroCancelacion[]>([]);
  readonly hayCambios = computed(() => this.registros().length > 0);
  proyectar(pedido: PedidoAdmin): PedidoAdmin {
    const registro = this.registros().find((r) => r.codigo === pedido.codigo);
    if (!registro) return pedido;
    return Object.freeze({
      ...pedido,
      estadoEntrega: 'cancelado' as const,
      estadoPago:
        registro.cancelacion.estadoPagoAnterior === 'aprobado'
          ? ('aprobado' as const)
          : ('anulado' as const),
      cancelacion: registro.cancelacion,
      eventos: Object.freeze([
        ...pedido.eventos,
        ...(pedido.eventos.includes(registro.evento) ? [] : [registro.evento]),
      ]),
    });
  }
  registrar(
    pedido: PedidoAdmin | undefined,
    solicitud: SolicitudCancelacionAdmin,
  ): { ok: boolean; errores: Record<string, string> } {
    const actual = pedido ? this.proyectar(pedido) : undefined;
    const errores = erroresCancelacionPedido(actual, solicitud);
    if (!actual || Object.keys(errores).length) return { ok: false, errores };
    const fecha = new Date(
      Math.max(
        Date.now(),
        Date.parse(actual.fecha) + 1,
        ...actual.eventos.map((e) => Date.parse(e.fecha) + 1),
      ),
    ).toISOString();
    const cancelacion = Object.freeze({
      motivo: solicitud.motivo.trim(),
      fecha,
      autor: 'Admin Demo',
      estadoEntregaAnterior: actual.estadoEntrega,
      estadoPagoAnterior: actual.estadoPago,
    });
    const evento = Object.freeze({
      fecha,
      titulo: 'Pedido cancelado · simulación',
      descripcion: [
        'Admin Demo ·',
        cancelacion.motivo,
        actual.estadoPago === 'aprobado'
          ? 'El pago aprobado se conserva; no se realizó un reembolso.'
          : 'El pago se muestra como anulado; los comprobantes se conservan para consulta.',
        'Sin modificaciones de existencias, reservas ni notificaciones reales.',
      ].join(' '),
    });
    this.registros.update((todos) =>
      Object.freeze([...todos, Object.freeze({ codigo: actual.codigo, cancelacion, evento })]),
    );
    return { ok: true, errores: {} };
  }
  restablecer() {
    this.registros.set([]);
  }
}
