import { Injectable, computed, signal } from '@angular/core';
import { PedidoAdmin } from '../modelos/pedido-admin';
import {
  ACCIONES_ENTREGA_ADMIN,
  CambioEntregaAdmin,
  RegistroEntregaAdmin,
  erroresCambioEntrega,
} from '../modelos/entrega-admin';

@Injectable({ providedIn: 'root' })
export class EnviosAdministracionPrueba {
  private readonly registros = signal<readonly RegistroEntregaAdmin[]>([]);
  readonly hayCambios = computed(() => this.registros().length > 0);
  proyectar(pedido: PedidoAdmin): PedidoAdmin {
    const registro = this.registros().find((r) => r.codigo === pedido.codigo);
    if (
      !registro ||
      pedido.estadoPago !== 'aprobado' ||
      ['cancelado', 'incidencia'].includes(pedido.estadoEntrega)
    )
      return pedido;
    return Object.freeze({
      ...pedido,
      estadoEntrega: registro.estado,
      seguimiento: registro.seguimiento ?? pedido.seguimiento,
      eventos: Object.freeze([
        ...pedido.eventos,
        ...registro.eventos.filter((e) => !pedido.eventos.includes(e)),
      ]),
    });
  }
  registrar(
    pedido: PedidoAdmin | undefined,
    cambio: CambioEntregaAdmin,
  ): { ok: boolean; errores: Record<string, string> } {
    const actual = pedido ? this.proyectar(pedido) : undefined;
    const errores = erroresCambioEntrega(actual, cambio);
    if (!actual || Object.keys(errores).length) return { ok: false, errores };
    const accion = ACCIONES_ENTREGA_ADMIN.find((a) => a.accion === cambio.accion)!;
    const previo = this.registros().find((r) => r.codigo === actual.codigo);
    // El llamador entrega la proyección vigente; los eventos nuevos se conservan una sola vez.
    const ultimaFecha = Math.max(
      Date.parse(actual.fecha),
      ...actual.eventos.map((e) => Date.parse(e.fecha)),
    );
    const fecha = new Date(Math.max(Date.now(), ultimaFecha + 1)).toISOString();
    const seguimiento =
      cambio.accion === 'enviar'
        ? Object.freeze({ empresa: cambio.empresa.trim(), codigo: cambio.seguimiento.trim() })
        : actual.seguimiento;
    const descripcion = [
      'Admin Demo · Cambio simulado.',
      cambio.accion === 'enviar' ? `${seguimiento!.empresa} · ${seguimiento!.codigo}.` : '',
      cambio.nota.trim(),
      'Sin modificaciones de existencias, reservas ni notificaciones reales.',
    ]
      .filter(Boolean)
      .join(' ');
    const evento = Object.freeze({ fecha, titulo: accion.evento + ' · simulación', descripcion });
    const registro = Object.freeze({
      codigo: actual.codigo,
      estado: accion.destino,
      seguimiento,
      eventos: Object.freeze([...(previo?.eventos ?? []), evento]),
    });
    this.registros.update((todos) =>
      Object.freeze([...todos.filter((r) => r.codigo !== actual.codigo), registro]),
    );
    return { ok: true, errores: {} };
  }
  restablecer() {
    this.registros.set([]);
  }
}
