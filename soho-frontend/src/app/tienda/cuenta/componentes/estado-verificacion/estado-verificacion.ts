import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Cuenta } from '../../servicios/cuenta';

@Component({
  selector: 'app-estado-verificacion',
  templateUrl: './estado-verificacion.html',
  styleUrl: './estado-verificacion.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadoVerificacion {
  protected readonly cuenta = inject(Cuenta);
  private readonly destruir = inject(DestroyRef);
  protected readonly ocupado = signal(false);
  protected readonly mensaje = signal('');
  protected readonly error = signal(false);
  protected async reenviar() {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.mensaje.set('');
    try {
      const r = await this.cuenta.reenviarVerificacion();
      if (this.destruir.destroyed) return;
      this.error.set(!r.correcto);
      this.mensaje.set(r.mensaje);
    } finally {
      if (!this.destruir.destroyed) this.ocupado.set(false);
    }
  }
}
