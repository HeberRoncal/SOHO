import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-campo-formulario',
  styleUrl: './campo-formulario.css',
  templateUrl: './campo-formulario.html',
})
export class CampoFormulario {
  readonly identificador = input('');
  readonly etiqueta = input('');
  readonly opcional = input(false);
  readonly error = input('');
  readonly ayuda = input('');
}
