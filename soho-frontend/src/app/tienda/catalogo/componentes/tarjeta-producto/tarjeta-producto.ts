import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Producto } from '../../modelos/producto';
import { PresentacionTienda } from '../../../../estructuras/servicios/presentacion-tienda';
import { BotonFavorito } from '../../../../compartido/componentes/boton-favorito/boton-favorito';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';

@Component({
  selector: 'app-tarjeta-producto',
  imports: [RouterLink, BotonFavorito, PrecioProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tarjeta-producto.html',
  styleUrl: './tarjeta-producto.css',
})
export class TarjetaProducto {
  readonly producto = input.required<Producto>();
  protected readonly presentacion = inject(PresentacionTienda);
  protected readonly favorito = computed(() =>
    this.presentacion.favoritos().includes(this.producto().identificador),
  );
  protected readonly agotado = computed(
    () =>
      !this.producto().variantes.some(
        (variante) => variante.habilitada && variante.existencias > variante.cantidadReservada,
      ),
  );
}
