import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-cabecera-acceso',
  styleUrl: './cabecera-acceso.css',
  templateUrl: './cabecera-acceso.html',
})
export class CabeceraAcceso {
  readonly volver = input('/');
}
