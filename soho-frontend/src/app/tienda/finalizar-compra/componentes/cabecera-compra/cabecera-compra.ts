import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PasosCompra } from '../../../../compartido/componentes/pasos-compra/pasos-compra';
@Component({
  selector: 'app-cabecera-compra',
  imports: [RouterLink, Icono, PasosCompra],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cabecera-compra.html',
  styleUrl: './cabecera-compra.css',
})
export class CabeceraCompra {
  readonly paso = input<1 | 2 | 3>(1);
  readonly editarDatos = input(true);
  readonly ocupado = input(false);
  readonly solicitado = output<1 | 2>();
}
