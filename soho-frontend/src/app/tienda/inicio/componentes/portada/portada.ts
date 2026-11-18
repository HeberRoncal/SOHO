import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PresentacionTienda } from '../../../../estructuras/servicios/presentacion-tienda';

@Component({
  selector: 'app-portada',
  imports: [Icono, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './portada.html',
  styleUrl: './portada.css',
})
export class Portada {
  protected readonly presentacion = inject(PresentacionTienda);
}
