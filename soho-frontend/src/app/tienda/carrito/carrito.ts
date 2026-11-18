import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Carrito as ServicioCarrito } from './servicios/carrito';
import { ProductoCarrito } from './componentes/producto-carrito/producto-carrito';
import { ResumenCompra } from '../../compartido/componentes/resumen-compra/resumen-compra';
import { Icono } from '../../compartido/componentes/icono/icono';
import { PresentacionTienda } from '../../estructuras/servicios/presentacion-tienda';

@Component({
  imports: [RouterLink, ProductoCarrito, ResumenCompra, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-carrito',
  styleUrl: './carrito.css',
  templateUrl: './carrito.html',
})
export class Carrito {
  protected readonly carrito = inject(ServicioCarrito);
  protected readonly presentacion = inject(PresentacionTienda);
  protected readonly mensaje = signal('');
  private readonly router = inject(Router);
  protected cambiarCantidad(sku: string, cantidad: number) {
    this.mensaje.set(this.carrito.cambiarCantidad(sku, cantidad).mensaje);
  }
  protected eliminar(sku: string) {
    this.carrito.eliminar(sku);
    this.mensaje.set('Producto eliminado del carrito.');
  }
  protected continuar() {
    if (!this.carrito.puedeContinuar()) return;
    void this.router.navigate(['/finalizar-compra']);
  }
}
