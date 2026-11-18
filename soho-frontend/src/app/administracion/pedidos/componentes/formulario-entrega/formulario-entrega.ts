import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { EstadoEntregaAdmin, PedidoAdmin } from '../../modelos/pedido-admin';
import {
  ACCIONES_ENTREGA_ADMIN,
  AccionEntregaAdmin,
  CambioEntregaAdmin,
  erroresCambioEntrega,
} from '../../modelos/entrega-admin';
import { PedidosAdministracion } from '../../servicios/pedidos-administracion';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
@Component({
  selector: 'app-formulario-entrega',
  imports: [ReactiveFormsModule, VentanaDialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './formulario-entrega.html',
  styleUrl: './formulario-entrega.css',
})
export class FormularioEntrega implements OnInit {
  readonly pedido = input.required<PedidoAdmin>();
  readonly accion = input.required<AccionEntregaAdmin>();
  readonly cerrado = output<void>();
  readonly registrado = output<AccionEntregaAdmin>();
  private readonly fuente = inject(PedidosAdministracion);
  private readonly destruccion = inject(DestroyRef);
  private readonly resumenErrores = viewChild<ElementRef<HTMLElement>>('resumenErrores');
  private estadoOriginal: EstadoEntregaAdmin = 'pendiente';
  private codigoOriginal = '';
  private readonly versionOriginal = signal<number | undefined>(undefined);
  protected readonly guardando = signal(false);
  protected readonly actualizando = signal(false);
  protected readonly requiereActualizar = signal(false);
  readonly tieneBorrador = computed(() => {
    this.valores();
    const v = this.formulario.getRawValue();
    return !!(v.empresa || v.seguimiento || v.nota || v.confirmado);
  });
  readonly ocupado = computed(() => this.guardando() || this.actualizando());
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    empresa: '',
    seguimiento: '',
    nota: '',
    confirmado: false,
  });
  private readonly valores = toSignal(this.formulario.valueChanges, {
    initialValue: this.formulario.getRawValue(),
  });
  protected readonly intento = signal(false);
  protected readonly erroresServidor = signal<Record<string, string>>({});
  protected readonly configuracion = computed(() =>
    ACCIONES_ENTREGA_ADMIN.find((a) => a.accion === this.accion())!,
  );
  protected readonly textoBoton = computed(() =>
    this.guardando() ? 'Guardando…' : this.configuracion().titulo,
  );
  protected readonly unidades = computed(() =>
    this.pedido().articulos.reduce((s, a) => s + a.cantidad, 0),
  );
  protected readonly errores = computed<Record<string, string>>(() => {
    this.valores();
    return this.intento()
      ? {
          ...erroresCambioEntrega(this.pedido(), this.entrada()),
          ...(this.pedido().version !== this.versionOriginal()
            ? { estado: 'El pedido cambió. Actualiza antes de continuar.' }
            : {}),
          ...this.erroresServidor(),
        }
      : {};
  });
  protected readonly listaErrores = computed(() => Object.values(this.errores()));
  ngOnInit() {
    this.estadoOriginal = this.pedido().estadoEntrega;
    this.codigoOriginal = this.pedido().codigo;
    this.versionOriginal.set(this.pedido().version);
  }
  constructor() {
    effect(() => {
      this.valores();
      untracked(() => this.erroresServidor.set({}));
    });
  }
  private entrada(): CambioEntregaAdmin {
    return {
      ...this.formulario.getRawValue(),
      accion: this.accion(),
      estadoEsperado: this.estadoOriginal,
      versionPedido: this.versionOriginal(),
    };
  }
  puedeSalir() {
    return (
      !this.ocupado() &&
      (!this.tieneBorrador() || window.confirm('¿Descartar los datos de esta acción de entrega?'))
    );
  }
  protected cerrar() {
    if (this.puedeSalir()) this.cerrado.emit();
  }
  protected async actualizar() {
    if (this.ocupado()) return;
    this.actualizando.set(true);
    const r = await this.fuente.cargarDetalle(this.codigoOriginal);
    if (this.destruccion.destroyed) return;
    this.actualizando.set(false);
    if (!r.ok) this.erroresServidor.set({ estado: r.error ?? 'No pudimos consultar el pedido.' });
    else {
      this.versionOriginal.set(this.fuente.obtener(this.codigoOriginal)?.version);
      this.requiereActualizar.set(false);
      this.erroresServidor.set({});
    }
    this.intento.set(true);
  }
  protected async guardar() {
    if (this.ocupado() || this.requiereActualizar()) return;
    this.intento.set(true);
    this.erroresServidor.set({});
    if (Object.keys(this.errores()).length) {
      setTimeout(() => this.resumenErrores()?.nativeElement.focus(), 0);
      return;
    }
    this.guardando.set(true);
    try {
      const resultado = await this.fuente.guardarEntrega(this.codigoOriginal, this.entrada());
      if (this.destruccion.destroyed || this.pedido().codigo !== this.codigoOriginal) return;
      if (resultado.ok) this.registrado.emit(this.accion());
      else {
        this.requiereActualizar.set(!!resultado.requiereActualizar);
        this.erroresServidor.set(resultado.errores);
        setTimeout(() => this.resumenErrores()?.nativeElement.focus(), 0);
      }
    } catch {
      if (!this.destruccion.destroyed) {
        this.requiereActualizar.set(true);
        this.erroresServidor.set({
          estado:
            'No pudimos confirmar el resultado. Actualiza el pedido antes de guardar de nuevo.',
        });
      }
    } finally {
      if (!this.destruccion.destroyed) this.guardando.set(false);
    }
  }
}
