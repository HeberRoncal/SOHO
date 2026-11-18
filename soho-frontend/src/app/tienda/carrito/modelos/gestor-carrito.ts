import { Signal } from '@angular/core';
import { LineaCarrito } from './linea-carrito';
import { ResultadoCarrito } from './resultado-carrito';

// Contrato compartido por las vistas y sus fuentes aisladas de pruebas.
export interface GestorCarrito {
  readonly sincronizando?: Signal<boolean>;
  readonly errorSincronizacion?: Signal<string>;
  reintentar?(): void;
  readonly lineas: Signal<readonly LineaCarrito[]>;
  readonly unidades: Signal<number>;
  readonly subtotal: Signal<number>;
  readonly puedeContinuar: Signal<boolean>;
  readonly guardadoLocal: Signal<boolean>;
  agregar(sku: string, cantidad: number): ResultadoCarrito;
  cambiarCantidad(sku: string, cantidad: number): ResultadoCarrito;
  eliminar(sku: string): void;
  vaciar(): void;
}
