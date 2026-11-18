import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ESTADOS_SOLICITUD, EstadoSolicitud } from '../../modelos/solicitud-admin';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  selector: 'app-estado-solicitud',
  imports: [Icono],
  templateUrl: './estado-solicitud.html',
  styleUrl: './estado-solicitud.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadoSolicitudComponent {
  readonly estado = input.required<EstadoSolicitud>();
  protected readonly etiquetas = ESTADOS_SOLICITUD;
}
