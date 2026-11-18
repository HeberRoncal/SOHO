import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '../../compartido/componentes/icono/icono';
import { PresentacionTienda } from '../../estructuras/servicios/presentacion-tienda';
import { TarjetaProducto } from '../catalogo/componentes/tarjeta-producto/tarjeta-producto';
import { FUENTE_CATALOGO } from '../catalogo/modelos/fuente-catalogo';

@Component({
  imports: [RouterLink, Icono, TarjetaProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-favoritos',
  styleUrl: './favoritos.css',
  templateUrl: './favoritos.html',
})
export class Favoritos {
  constructor() {
    effect(() => this.catalogo.cargarSlugs?.(this.presentacion.favoritos()));
  }
  protected readonly presentacion = inject(PresentacionTienda);
  private readonly catalogo = inject(FUENTE_CATALOGO);
  protected readonly productos = computed(() =>
    this.catalogo.productos.filter((producto) =>
      this.presentacion.favoritos().includes(producto.identificador),
    ),
  );
}
