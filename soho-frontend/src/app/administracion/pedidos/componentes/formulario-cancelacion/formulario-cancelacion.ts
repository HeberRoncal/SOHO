import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  PedidoAdmin,
  EstadoEntregaAdmin,
  EstadoPagoAdmin,
  ESTADOS_ENTREGA_ADMIN,
} from '../../modelos/pedido-admin';
import {
  SolicitudCancelacionAdmin,
  erroresCancelacionPedido,
  puedeCancelarPedido,
} from '../../modelos/cancelacion-admin';
import { PedidosAdministracion } from '../../servicios/pedidos-administracion';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';
@Component({
  selector: 'app-formulario-cancelacion',
  imports: [ReactiveFormsModule, VentanaDialogo, PrecioProducto, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './formulario-cancelacion.html',
  styleUrl: './formulario-cancelacion.css',
})
export class FormularioCancelacion implements OnInit {
  readonly pedido = input.required<PedidoAdmin>();
  readonly liberar = input(false);
  readonly cerrado = output<void>();
  readonly registrado = output<void>();
  private readonly fuente = inject(PedidosAdministracion);
  private readonly destruccion = inject(DestroyRef);
  private readonly resumen = viewChild<ElementRef<HTMLElement>>('resumen');
  private entregaOriginal: EstadoEntregaAdmin = 'pendiente';
  private pagoOriginal: EstadoPagoAdmin = 'pendiente';
  private codigoOriginal = '';
  private readonly versiones = signal<{
    pedido?: number;
    pago?: number;
  }>({});
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    motivo: '',
    confirmado: false,
    decision: '' as '' | 'LIBERAR' | 'CONSERVAR',
  });
  private readonly valores = toSignal(this.formulario.valueChanges, {
    initialValue: this.formulario.getRawValue(),
  });
  protected readonly guardando = signal(false);
  protected readonly actualizando = signal(false);
  protected readonly requiereActualizar = signal(false);
  protected readonly avisoActualizacion = signal('');
  readonly ocupado = computed(() => this.guardando() || this.actualizando());
  readonly tieneBorrador = computed(() => {
    this.valores();
    const v = this.formulario.getRawValue();
    return !!(v.motivo || v.confirmado || v.decision);
  });
  protected readonly incompatible = computed(() =>
    this.liberar()
      ? this.pedido().estadoEntrega !== 'cancelado' ||
        !this.pedido().reservasCancelacion?.puedeLiberarRetenidas
      : !puedeCancelarPedido(this.pedido()),
  );
  protected readonly intento = signal(false);
  protected readonly erroresServidor = signal<Record<string, string>>({});
  protected readonly estadoEntrega = computed(
    () => ESTADOS_ENTREGA_ADMIN[this.pedido().estadoEntrega],
  );
  protected readonly titulo = computed(() =>
    this.liberar() ? 'Liberar reservas retenidas' : 'Cancelar pedido',
  );
  protected readonly textoBoton = computed(() =>
    this.guardando() ? 'Guardando…' : this.liberar() ? 'Liberar reservas' : 'Cancelar pedido',
  );
  protected readonly errores = computed<Record<string, string>>(() => {
    this.valores();
    if (!this.intento()) return {};
    const p = this.pedido();
    const errores = this.liberar()
      ? {
          ...(!p.reservasCancelacion?.puedeLiberarRetenidas || p.estadoEntrega !== 'cancelado'
            ? { estado: 'No quedan reservas retenidas que puedan liberarse. Actualiza el pedido.' }
            : {}),
          ...(!this.formulario.controls.confirmado.value
            ? { confirmado: 'Confirma la liberación de todas las reservas retenidas.' }
            : {}),
        }
      : erroresCancelacionPedido(p, this.solicitud());
    return {
      ...errores,
      ...(p.version !== this.versiones().pedido || p.versionPago !== this.versiones().pago
        ? { estado: 'El pedido o su pago cambiaron. Actualiza antes de continuar.' }
        : {}),
      ...this.erroresServidor(),
    };
  });
  protected readonly listaErrores = computed(() => Object.values(this.errores()));
  constructor() {
    effect(() => {
      this.valores();
      untracked(() => this.erroresServidor.set({}));
    });
  }
  ngOnInit() {
    this.codigoOriginal = this.pedido().codigo;
    this.capturar(this.pedido());
  }
  private capturar(p: PedidoAdmin) {
    this.entregaOriginal = p.estadoEntrega;
    this.pagoOriginal = p.estadoPago;
    this.versiones.set({ pedido: p.version, pago: p.versionPago });
  }
  private solicitud(): SolicitudCancelacionAdmin {
    const v = this.formulario.getRawValue();
    return {
      motivo: v.motivo,
      confirmado: v.confirmado,
      estadoEntregaEsperado: this.entregaOriginal,
      estadoPagoEsperado: this.pagoOriginal,
      versionPedido: this.versiones().pedido,
      versionPago: this.versiones().pago,
      ...(v.decision ? { decisionReservasConsultadas: v.decision } : {}),
    };
  }
  puedeSalir() {
    return (
      !this.ocupado() &&
      (!this.tieneBorrador() ||
        window.confirm('¿Descartar los datos de esta acción de cancelación?'))
    );
  }
  protected cerrar() {
    if (this.puedeSalir()) this.cerrado.emit();
  }
  private enfocar() {
    setTimeout(() => this.resumen()?.nativeElement.focus(), 0);
  }
  protected async actualizar() {
    if (this.ocupado()) return;
    this.actualizando.set(true);
    try {
      const r = await this.fuente.actualizarCancelacion(this.codigoOriginal);
      if (this.destruccion.destroyed) return;
      const p = this.fuente.obtener(this.codigoOriginal);
      if (!r.ok || !p) {
        this.erroresServidor.set({ estado: r.error ?? 'No pudimos consultar el pedido.' });
        this.intento.set(true);
        this.enfocar();
        return;
      }
      this.capturar(p);
      this.formulario.controls.confirmado.setValue(false);
      if (!p.reservasCancelacion?.unidadesConsultables)
        this.formulario.controls.decision.setValue('');
      this.requiereActualizar.set(false);
      this.erroresServidor.set({});
      this.intento.set(false);
      this.avisoActualizacion.set(
        'Pedido actualizado. Revisa el estado, las reservas y confirma nuevamente. El motivo se conserva.',
      );
    } catch {
      if (!this.destruccion.destroyed) {
        this.erroresServidor.set({
          estado: 'No pudimos consultar el pedido. Tus datos se conservan.',
        });
        this.intento.set(true);
        this.enfocar();
      }
    } finally {
      if (!this.destruccion.destroyed) this.actualizando.set(false);
    }
  }
  protected async confirmar() {
    if (this.ocupado() || this.requiereActualizar()) return;
    this.intento.set(true);
    this.erroresServidor.set({});
    this.avisoActualizacion.set('');
    if (Object.keys(this.errores()).length) {
      this.enfocar();
      return;
    }
    this.guardando.set(true);
    try {
      const resultado = await (this.liberar()
        ? this.fuente.liberarReservas(this.codigoOriginal, {
            versionPedido: this.versiones().pedido,
            versionPago: this.versiones().pago,
            confirmado: this.formulario.controls.confirmado.value,
          })
        : this.fuente.guardarCancelacion(this.codigoOriginal, this.solicitud()));
      if (this.destruccion.destroyed || this.pedido().codigo !== this.codigoOriginal) return;
      if (resultado.ok) this.registrado.emit();
      else {
        this.requiereActualizar.set(!!resultado.requiereActualizar);
        this.erroresServidor.set(resultado.errores);
        this.enfocar();
      }
    } catch {
      if (!this.destruccion.destroyed) {
        this.requiereActualizar.set(true);
        this.erroresServidor.set({
          estado:
            'No pudimos confirmar el resultado. Actualiza el pedido antes de guardar de nuevo.',
        });
        this.enfocar();
      }
    } finally {
      if (!this.destruccion.destroyed) this.guardando.set(false);
    }
  }
}
