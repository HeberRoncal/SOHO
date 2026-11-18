import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icono } from '../icono/icono';

@Component({
  selector: 'app-control-cantidad',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './control-cantidad.html',
  styleUrl: './control-cantidad.css',
})
export class ControlCantidad {
  readonly valor = input(1);
  readonly maximo = input(1);
  readonly descripcion = input('');
  readonly valorCambiado = output<number>();
  protected cambiar(valor: number) {
    if (Number.isInteger(valor) && valor >= 1 && valor <= this.maximo())
      this.valorCambiado.emit(valor);
  }
}
