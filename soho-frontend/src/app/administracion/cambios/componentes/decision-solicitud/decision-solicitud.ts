import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  ACCIONES_SOLICITUD,
  AccionSolicitud,
  DecisionSolicitud,
  SolicitudAdmin,
} from '../../modelos/solicitud-admin';
import { SolicitudesAdministracion } from '../../servicios/solicitudes-administracion';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';

@Component({
  selector: 'app-decision-solicitud',
  imports: [ReactiveFormsModule, VentanaDialogo, PrecioProducto],
  templateUrl: './decision-solicitud.html',
  styleUrl: '../../formulario-solicitud.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionSolicitudComponent implements OnInit {
  readonly solicitud = input.required<SolicitudAdmin>();
  readonly accion = input.required<AccionSolicitud>();
  readonly cerrado = output<void>();
  readonly registrado = output<void>();
  private readonly fuente = inject(SolicitudesAdministracion);
  private revision = 0;
  protected readonly etiquetas = ACCIONES_SOLICITUD;
  protected readonly error = signal('');
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    confirmado: false,
    motivo: '',
    condicion: '' as DecisionSolicitud['condicion'],
    referencia: '',
  });
  private readonly resumen = viewChild<ElementRef<HTMLElement>>('resumen');
  protected readonly consecuencia = computed(() => {
    switch (this.accion()) {
      case 'aprobar':
        return 'El caso pasará a Esperando retorno. No se reserva la variante solicitada ni se envían avisos al cliente.';
      case 'rechazar':
        return 'El caso quedará rechazado y el motivo se añadirá al historial. No se envía un mensaje al cliente.';
      case 'recibir':
        return 'Se simulará la recepción del producto y el caso quedará Aprobado para continuar. No se reincorpora stock, incluso si el par está en buen estado.';
      case 'cerrar-cambio':
        return 'Se registrará el envío de cambio de ejemplo y se cerrará la solicitud. No se crea un envío ni se descuenta inventario.';
      case 'reembolso':
        return 'Se guardará una referencia de reembolso de ejemplo y se cerrará el caso. No se transfiere dinero y el pago original permanece intacto.';
    }
  });
  ngOnInit() {
    this.revision = this.solicitud().revision;
  }
  protected confirmar() {
    const resultado = this.fuente.decidir(this.solicitud().identificador, {
      ...this.formulario.getRawValue(),
      revision: this.revision,
      accion: this.accion(),
    });
    if (resultado.ok) this.registrado.emit();
    else {
      this.error.set(resultado.error ?? 'Revisa la solicitud.');
      setTimeout(() => this.resumen()?.nativeElement.focus(), 0);
    }
  }
}
