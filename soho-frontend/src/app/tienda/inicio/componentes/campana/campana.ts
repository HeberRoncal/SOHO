import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { PresentacionTienda } from '../../../../estructuras/servicios/presentacion-tienda';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  selector: 'app-campana',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campana.html',
  styleUrl: './campana.css',
})
export class Campana {
  protected readonly presentacion = inject(PresentacionTienda);
}
