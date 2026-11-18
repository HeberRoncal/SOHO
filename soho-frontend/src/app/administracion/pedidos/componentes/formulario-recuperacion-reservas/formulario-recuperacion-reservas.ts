import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { PedidoAdmin } from '../../modelos/pedido-admin';
import { PlanRecuperacionReservas } from '../../modelos/recuperacion-reservas';
import { RecuperacionReservasApi } from '../../servicios/recuperacion-reservas-api';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
@Component({
  selector: 'app-formulario-recuperacion-reservas',
  imports: [ReactiveFormsModule, VentanaDialogo],
  templateUrl: './formulario-recuperacion-reservas.html',
  styleUrl: './formulario-recuperacion-reservas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormularioRecuperacionReservas {
  readonly pedido = input.required<PedidoAdmin>();
  readonly cerrado = output<void>();
  readonly registrado = output<boolean>();
  private readonly api = inject(RecuperacionReservasApi);
  private readonly destruccion = inject(DestroyRef);
  private readonly resumen = viewChild<ElementRef<HTMLElement>>('resumen');
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    motivo: '',
    confirmado: false,
  });
  private readonly valores = toSignal(this.formulario.valueChanges, {
    initialValue: this.formulario.getRawValue(),
  });
  protected readonly plan = signal<PlanRecuperacionReservas | null>(null);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly requiereActualizar = signal(false);
  readonly ocupado = computed(() => this.cargando() || this.guardando());
  readonly tieneBorrador = computed(() => !!(this.valores().motivo || this.valores().confirmado));
  private codigo = '';
  protected readonly cambio = computed(
    () =>
      !!this.plan() &&
      (this.pedido().version !== this.plan()!.versionPedido ||
        this.pedido().versionPago !== this.plan()!.versionPago),
  );
  ngOnInit() {
    this.codigo = this.pedido().codigo;
    void this.actualizar();
  }
  puedeSalir() {
    return (
      !this.ocupado() &&
      (!this.tieneBorrador() ||
        window.confirm('¿Descartar el motivo y la confirmación de recuperación?'))
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
    this.cargando.set(true);
    this.error.set('');
    const r = await this.api.consultar(this.codigo);
    if (this.destruccion.destroyed) return;
    this.cargando.set(false);
    if (r.ok && r.plan) {
      this.plan.set(r.plan);
      this.requiereActualizar.set(false);
      this.formulario.controls.confirmado.setValue(false);
      this.aviso.set(
        'Disponibilidad consultada. Revisa el plazo y confirma nuevamente antes de guardar.',
      );
    } else {
      this.requiereActualizar.set(true);
      this.error.set(r.error ?? 'No pudimos consultar la disponibilidad.');
      this.enfocar();
    }
  }
  protected async confirmar() {
    if (this.ocupado()) return;
    const p = this.plan(),
      v = this.formulario.getRawValue();
    let error =
      this.requiereActualizar() || this.cambio()
        ? 'Actualiza el pedido antes de continuar.'
        : !p?.puedeRecuperar
          ? (p?.motivoBloqueo ?? 'Consulta primero la disponibilidad.')
          : Array.from(v.motivo.trim()).length < 10 ||
              Array.from(v.motivo.trim()).length > 300 ||
              /[\p{Cc}\p{Cf}]/u.test(v.motivo.replace(/[\r\n]/g, ''))
            ? 'Escribe un motivo de entre 10 y 300 caracteres válidos.'
            : !v.confirmado
              ? 'Confirma la recuperación y el nuevo plazo.'
              : '';
    if (error || !p) {
      this.error.set(error);
      this.enfocar();
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    const r = await this.api.guardar(this.codigo, {
      versionPedido: p.versionPedido,
      versionPago: p.versionPago,
      ...v,
    });
    if (this.destruccion.destroyed) return;
    this.guardando.set(false);
    if (r.ok) {
      this.formulario.reset();
      this.registrado.emit(!!r.recuperado);
    } else {
      this.requiereActualizar.set(!!r.requiereActualizar);
      this.error.set(r.error ?? 'No pudimos confirmar la recuperación.');
      this.enfocar();
    }
  }
}
