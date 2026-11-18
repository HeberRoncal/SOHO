import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icono } from '../icono/icono';

@Component({
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pasos-compra',
  styleUrl: './pasos-compra.css',
  templateUrl: './pasos-compra.html',
})
export class PasosCompra {
  readonly actual = input(1);
  readonly editable = input(true);
  readonly solicitado = output<1 | 2>();
}
