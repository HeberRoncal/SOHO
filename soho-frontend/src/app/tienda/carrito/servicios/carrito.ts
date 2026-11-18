import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { GestorCarrito } from '../modelos/gestor-carrito';
import { CarritoLocal } from './carrito-local';

export const GESTOR_CARRITO = new InjectionToken<GestorCarrito>('GESTOR_CARRITO', {
  providedIn: 'root',
  factory: () => inject(CarritoLocal),
});

// Punto de acceso común al carrito de invitado y al carrito privado de la cuenta.
@Injectable({ providedIn: 'root' })
export class Carrito implements GestorCarrito {
  private readonly gestor = inject(GESTOR_CARRITO);
  readonly lineas = this.gestor.lineas;
  readonly unidades = this.gestor.unidades;
  readonly subtotal = this.gestor.subtotal;
  readonly puedeContinuar = this.gestor.puedeContinuar;
  readonly guardadoLocal = this.gestor.guardadoLocal;
  readonly sincronizando = this.gestor.sincronizando ?? signal(false).asReadonly();
  readonly errorSincronizacion = this.gestor.errorSincronizacion ?? signal('').asReadonly();
  reintentar() {
    this.gestor.reintentar?.();
  }
  agregar(sku: string, cantidad: number) {
    return this.gestor.agregar(sku, cantidad);
  }
  cambiarCantidad(sku: string, cantidad: number) {
    return this.gestor.cambiarCantidad(sku, cantidad);
  }
  eliminar(sku: string) {
    this.gestor.eliminar(sku);
  }
  vaciar() {
    this.gestor.vaciar();
  }
}
