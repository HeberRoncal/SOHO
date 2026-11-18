import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LineaCarrito } from '../../modelos/linea-carrito';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { BotonFavorito } from '../../../../compartido/componentes/boton-favorito/boton-favorito';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { ControlCantidad } from '../../../../compartido/componentes/control-cantidad/control-cantidad';

@Component({
  imports: [RouterLink, Icono, BotonFavorito, PrecioProducto, ControlCantidad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-producto-carrito',
  styleUrl: './producto-carrito.css',
  templateUrl: './producto-carrito.html',
})
export class ProductoCarrito {
  readonly linea = input.required<LineaCarrito>();
  readonly cantidadCambiada = output<number>();
  readonly eliminado = output<void>();
  readonly favorito = input(false);
  readonly favoritoSolicitado = output<string>();
  protected readonly importeAnterior = computed(() => {
    const actual = this.linea();
    const anterior = actual.producto?.precioAnterior;
    if (anterior == null || anterior <= actual.producto!.precio || actual.importe === null)
      return null;
    const centimos = Math.round(anterior * 100) * actual.cantidad;
    return Number.isSafeInteger(centimos) ? centimos / 100 : null;
  });
  protected readonly descripcion = computed(() =>
    [
      this.linea().producto?.nombre ?? 'Producto no disponible',
      this.linea().color?.nombre,
      this.linea().variante ? 'talla EU ' + this.linea().variante!.talla : this.linea().sku,
    ]
      .filter(Boolean)
      .join(', '),
  );
}
