import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { RouterLink } from '@angular/router';
import { VentanaDialogo } from '../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { Icono } from '../../../compartido/componentes/icono/icono';
import { PresentacionTienda } from '../../servicios/presentacion-tienda';
import { MenuCategorias } from '../cabecera-tienda/componentes/menu-categorias/menu-categorias';

@Component({
  selector: 'app-panel-tienda',
  imports: [RouterLink, VentanaDialogo, Icono, MenuCategorias],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './panel-tienda.html',
  styleUrl: './panel-tienda.css',
})
export class PanelTienda {
  protected readonly presentacion = inject(PresentacionTienda);
  protected readonly vista = this.presentacion.panel;
}
