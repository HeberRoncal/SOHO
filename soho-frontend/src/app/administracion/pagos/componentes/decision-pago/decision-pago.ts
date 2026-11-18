import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AccionPagoAdmin, MOTIVOS_REVISION_PAGO, PagoAdmin } from '../../modelos/pago-admin';
import { PagosAdministracion } from '../../servicios/pagos-administracion';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
@Component({
  selector: 'app-decision-pago',
  imports: [ReactiveFormsModule, VentanaDialogo, PrecioProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decision-pago.html',
  styleUrl: './decision-pago.css',
})
export class DecisionPago {
  readonly pago = input.required<PagoAdmin>();
  readonly accion = input.required<AccionPagoAdmin>();
  readonly cerrado = output<void>();
  readonly registrado = output<AccionPagoAdmin>();
  private readonly fuente = inject(PagosAdministracion);
  private readonly errorElemento = viewChild<ElementRef<HTMLElement>>('errorElemento');
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    confirmado: false,
    motivo: '',
    mensaje: '',
    solicitud: 'legible' as 'legible' | 'corregido',
  });
  private readonly valores = toSignal(this.formulario.valueChanges, {
    initialValue: this.formulario.getRawValue(),
  });
  protected readonly motivos = MOTIVOS_REVISION_PAGO;
  protected readonly error = signal('');
  protected readonly intento = signal(false);
  protected readonly guardando = signal(false);
  private esperado?: {
    codigo: string;
    comprobanteId: string;
    versionPedido?: number;
    versionPago?: number;
  };
  ngOnInit() {
    const pago = this.pago();
    this.esperado = {
      codigo: pago.pedido.codigo,
      comprobanteId: pago.comprobantes[0]?.id ?? '',
      versionPedido: pago.pedido.version,
      versionPago: pago.pedido.versionPago,
    };
  }
  protected readonly titulo = computed(() =>
    this.accion() === 'aprobado'
      ? 'Confirmar aprobación del pago'
      : this.accion() === 'observado'
        ? 'Observar comprobante'
        : 'Rechazar pago',
  );
  protected readonly textoBoton = computed(() =>
    this.guardando()
      ? 'Guardando…'
      : this.accion() === 'aprobado'
        ? 'Aprobar pago'
        : this.accion() === 'observado'
          ? 'Guardar observación'
          : 'Rechazar pago',
  );
  protected readonly motivoInvalido = computed(() => this.intento() && !this.valores().motivo);
  protected readonly mensajeInvalido = computed(
    () => this.intento() && (this.valores().mensaje?.trim().length ?? 0) < 10,
  );
  constructor() {
    this.formulario.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(''));
  }
  protected cambiarMotivo() {
    const motivo = this.motivos.find((m) => m.codigo === this.formulario.controls.motivo.value);
    this.formulario.controls.mensaje.setValue(motivo?.mensaje ?? '');
    this.error.set('');
  }
  protected async confirmar() {
    if (this.guardando() || !this.esperado) return;
    this.intento.set(true);
    this.guardando.set(true);
    const resultado = await this.fuente.revisar(this.esperado.codigo, {
      ...this.formulario.getRawValue(),
      accion: this.accion(),
      comprobanteId: this.esperado.comprobanteId,
      versionPedido: this.esperado.versionPedido,
      versionPago: this.esperado.versionPago,
    });
    this.guardando.set(false);
    if (resultado.ok) this.registrado.emit(this.accion());
    else {
      this.error.set(
        resultado.error ?? 'No se pudo registrar la decisión. Revisa el estado del pago.',
      );
      setTimeout(() => this.errorElemento()?.nativeElement.focus(), 0);
    }
  }
}
