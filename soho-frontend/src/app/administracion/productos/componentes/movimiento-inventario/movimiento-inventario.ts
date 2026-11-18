import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { MovimientoInventarioReal } from './movimiento-inventario-real';
import type { MovimientoInventario as RegistroMovimiento } from '../../modelos/movimiento-inventario';
@Component({
  selector: 'app-movimiento-inventario',
  imports: [MovimientoInventarioReal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<app-movimiento-inventario-real [abierto]="abierto()" [skuInicial]="skuInicial()" [productoId]="productoId()" (cerrado)="cerrado.emit()" (registrado)="registrado.emit($event)" />',
})
export class MovimientoInventario {
  readonly abierto = input(false);
  readonly skuInicial = input('');
  readonly productoId = input('');
  readonly cerrado = output<void>();
  readonly registrado = output<RegistroMovimiento>();
  private readonly editor = viewChild(MovimientoInventarioReal);
  puedeSalir(): boolean | Promise<boolean> {
    return this.editor()?.puedeSalir() ?? true;
  }
}
