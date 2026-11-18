import { Injectable, computed, inject, signal } from '@angular/core';
import { EnviosAdministracionPrueba as EnviosAdministracion } from '../../pedidos/pruebas/envios-administracion.fixture';
import { CancelacionesAdministracionPrueba as CancelacionesAdministracion } from '../../pedidos/pruebas/cancelaciones-administracion.fixture';
import { PEDIDOS_ADMIN_DEMO } from '../../cambios/datos/pedidos-posventa-demo';
import { PedidoAdmin, ESTADOS_PAGO_ADMIN } from '../../pedidos/modelos/pedido-admin';
import { PAGOS_ADMIN_DEMO } from './pagos.fixtures';
import {
  ComprobanteAdmin,
  DecisionPagoAdmin,
  PagoAdmin,
  RegistroPagoAdmin,
  errorDecisionPago,
  ResumenAdmin,
} from '../modelos/pago-admin';

@Injectable({ providedIn: 'root' })
export class PagosAdministracionPrueba {
  readonly remoto: boolean = false;
  readonly estadoListado = signal<'inicial' | 'cargando' | 'lista' | 'error'>('lista');
  readonly mensajeListado = signal('');
  readonly paginacion = signal({ pagina: 1, limite: 20, total: 0, paginas: 0 });
  readonly conteos = signal<Record<string, number>>({});
  readonly resultados = signal<readonly PagoAdmin[]>([]);
  readonly resumenRemoto = signal<ResumenAdmin | null>(null);
  readonly estadoResumen = signal<'inicial' | 'cargando' | 'lista' | 'error'>('lista');
  readonly mensajeResumen = signal('');
  cargarResumen(_desde: string, _hasta: string): Promise<void> {
    return Promise.resolve();
  }
  cargarListado(_filtros: Record<string, string> = {}, _tipo = 'pagos'): Promise<void> {
    return Promise.resolve();
  }
  cargarDetalle(_codigo: string): Promise<{ ok: boolean; error?: string }> {
    return Promise.resolve({ ok: true });
  }
  comprobante(_codigo: string, _id: string): Promise<Blob> {
    return Promise.reject(Error('Comprobante de demostración.'));
  }
  private readonly envios = inject(EnviosAdministracion);
  private readonly cancelaciones = inject(CancelacionesAdministracion);
  private readonly registros = signal(PAGOS_ADMIN_DEMO);
  readonly pedidos = computed<readonly PedidoAdmin[]>(() =>
    PEDIDOS_ADMIN_DEMO.map((base) => {
      const registro = this.registros().find((r) => r.codigo === base.codigo)!;
      if (!registro.modificado) return this.cancelaciones.proyectar(this.envios.proyectar(base));
      const actual = registro.comprobantes[0];
      return this.cancelaciones.proyectar(
        this.envios.proyectar(
          Object.freeze({
            ...base,
            estadoPago: actual.estado,
            estadoEntrega:
              actual.estado === 'aprobado' && base.estadoEntrega === 'pendiente'
                ? ('confirmado' as const)
                : base.estadoEntrega,
            comprobante: actual.nombre,
            operacion: actual.operacion,
            observacion: ['observado', 'rechazado'].includes(actual.estado)
              ? actual.mensaje
              : undefined,
            eventos: Object.freeze([...base.eventos, ...registro.eventos]),
          }),
        ),
      );
    }),
  );
  readonly pagos = computed<readonly PagoAdmin[]>(() =>
    this.pedidos().map((pedido) => {
      const comprobantes = this.registros().find((r) => r.codigo === pedido.codigo)!.comprobantes;
      return {
        pedido,
        comprobantes:
          pedido.cancelacion && pedido.estadoPago === 'anulado'
            ? Object.freeze(
                comprobantes.map((c, i) =>
                  i === 0 ? Object.freeze({ ...c, estado: 'anulado' as const }) : c,
                ),
              )
            : comprobantes,
      };
    }),
  );
  obtener(codigo: string): PagoAdmin | undefined {
    return this.pagos().find((p) => p.pedido.codigo === codigo);
  }
  revisar(codigo: string, decision: DecisionPagoAdmin): { ok: boolean; error?: string } {
    const pago = this.obtener(codigo),
      error = errorDecisionPago(pago, decision);
    if (error || !pago) return { ok: false, error };
    const registro = this.registros().find((r) => r.codigo === codigo)!;
    const fecha = this.fechaNueva(registro);
    const comprobante: ComprobanteAdmin = Object.freeze({
      ...registro.comprobantes[0],
      estado: decision.accion,
      revisadoEn: fecha,
      revisadoPor: 'Admin Demo',
      ...(decision.accion !== 'aprobado'
        ? {
            motivo: decision.motivo,
            mensaje: decision.mensaje.trim(),
            ...(decision.accion === 'observado' ? { solicitud: decision.solicitud } : {}),
          }
        : {}),
    });
    const evento = Object.freeze({
      fecha,
      titulo: ESTADOS_PAGO_ADMIN[decision.accion] + ' · simulación',
      descripcion:
        decision.accion === 'aprobado'
          ? 'Admin Demo simuló la verificación del ingreso y la confirmación del pedido. No se modificó inventario.'
          : `Admin Demo: ${decision.mensaje.trim()} No se envió ninguna notificación real.`,
    });
    this.reemplazar({
      ...registro,
      modificado: true,
      comprobantes: Object.freeze([comprobante, ...registro.comprobantes.slice(1)]),
      eventos: Object.freeze([...registro.eventos, evento]),
    });
    return { ok: true };
  }
  simularCorreccion(codigo: string, comprobanteId: string): boolean {
    const pago = this.obtener(codigo);
    if (
      !pago ||
      pago.pedido.estadoPago !== 'observado' ||
      pago.pedido.estadoEntrega === 'cancelado' ||
      pago.comprobantes[0]?.id !== comprobanteId
    )
      return false;
    const registro = this.registros().find((r) => r.codigo === codigo)!;
    const fecha = this.fechaNueva(registro),
      numero = registro.comprobantes.length + 1;
    const comprobante = Object.freeze({
      id: `${codigo}-v${numero}`,
      nombre: `comprobante-demo-${codigo.slice(-3)}-corregido-${numero}.png`,
      fecha,
      estado: 'pendiente' as const,
      monto: pago.pedido.total,
      operacion: pago.comprobantes[0].operacion,
      corregido: true,
    });
    this.reemplazar({
      ...registro,
      modificado: true,
      comprobantes: Object.freeze([comprobante, ...registro.comprobantes]),
      eventos: Object.freeze([
        ...registro.eventos,
        Object.freeze({
          fecha,
          titulo: 'Comprobante corregido · simulación',
          descripcion:
            'Se agregó un documento ficticio al mismo pedido y el pago volvió a revisión. No representa una nueva compra ni otro pago.',
        }),
      ]),
    });
    return true;
  }
  restablecer() {
    this.cancelaciones.restablecer();
    this.envios.restablecer();
    this.registros.set(PAGOS_ADMIN_DEMO);
  }
  private reemplazar(registro: RegistroPagoAdmin) {
    this.registros.update((todos) =>
      Object.freeze(todos.map((r) => (r.codigo === registro.codigo ? Object.freeze(registro) : r))),
    );
  }
  private fechaNueva(registro: RegistroPagoAdmin) {
    return new Date(
      Math.max(
        Date.now(),
        ...registro.comprobantes.map((c) => Date.parse(c.revisadoEn ?? c.fecha) + 1),
        ...registro.eventos.map((e) => Date.parse(e.fecha) + 1),
      ),
    ).toISOString();
  }
}
