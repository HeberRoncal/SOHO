import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';

@Component({
  selector: 'app-configuracion-administradores',
  templateUrl: './administradores.html',
  styleUrl: './administradores.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Administradores {
  protected readonly cuenta = inject(Cuenta);
}
