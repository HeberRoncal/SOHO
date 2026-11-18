import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icono } from '../../../compartido/componentes/icono/icono';
import { PresentacionTienda } from '../../servicios/presentacion-tienda';
import { MenuCategorias } from './componentes/menu-categorias/menu-categorias';
import { Carrito } from '../../../tienda/carrito/servicios/carrito';

@Component({
  selector: 'app-cabecera-tienda',
  imports: [RouterLink, RouterLinkActive, Icono, MenuCategorias],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cabecera-tienda.html',
  styleUrl: './cabecera-tienda.css',
})
export class CabeceraTienda {
  protected readonly carrito = inject(Carrito);
  protected readonly presentacion = inject(PresentacionTienda);
  protected buscar(campo: HTMLInputElement) {
    const termino = campo.value.trim();
    if (!termino) {
      campo.focus();
      return;
    }
    this.presentacion.irAlCatalogo({
      busqueda: termino,
    });
  }
}
