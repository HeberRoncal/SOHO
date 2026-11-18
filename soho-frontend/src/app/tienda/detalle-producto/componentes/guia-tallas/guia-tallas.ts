import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';

@Component({
  selector: 'app-guia-tallas',
  imports: [VentanaDialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guia-tallas.html',
  styleUrl: './guia-tallas.css',
})
export class GuiaTallas {
  readonly abierta = input(false);
  readonly cerrada = output<void>();
  protected readonly equivalencias = [
    ['22.0', '4', '5.5', '36', '3.5'],
    ['22.5', '4.5', '6', '36.5', '4'],
    ['23.0', '5', '6.5', '37.5', '4.5'],
    ['23.5', '5.5', '7', '38', '5'],
    ['24.0', '6', '7.5', '38.5', '5.5'],
    ['24.5', '6.5', '8', '39', '6'],
    ['25.0', '7', '8.5', '40', '6'],
    ['25.5', '7.5', '9', '40.5', '6.5'],
    ['26.0', '8', '9.5', '41', '7'],
    ['26.5', '8.5', '10', '42', '7.5'],
    ['27.0', '9', '10.5', '42.5', '8'],
    ['27.5', '9.5', '11', '43', '8.5'],
    ['28.0', '10', '11.5', '44', '9'],
    ['28.5', '10.5', '12', '44.5', '9.5'],
    ['29.0', '11', '12.5', '45', '10'],
    ['29.5', '11.5', '13', '45.5', '10.5'],
    ['30.0', '12', '13.5', '46', '11'],
    ['30.5', '12.5', '14', '47', '11.5'],
    ['31.0', '13', '14.5', '47.5', '12'],
  ] as const;
}
