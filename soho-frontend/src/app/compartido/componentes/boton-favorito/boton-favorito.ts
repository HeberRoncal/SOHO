import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icono } from '../icono/icono';

@Component({
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-boton-favorito',
  styleUrl: './boton-favorito.css',
  templateUrl: './boton-favorito.html',
})
export class BotonFavorito {
  readonly seleccionado = input(false);
  readonly descripcion = input('');
  readonly tamanoIcono = input(24);
  readonly alternado = output<void>();
}
