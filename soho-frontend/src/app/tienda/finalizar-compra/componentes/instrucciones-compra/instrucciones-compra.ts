import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { InstruccionCompra } from '../../modelos/contrato-checkout';

@Component({
  selector: 'app-instrucciones-compra',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './instrucciones-compra.html',
  styleUrl: './instrucciones-compra.css',
})
export class InstruccionesCompra {
  readonly instruccion = input.required<InstruccionCompra>();
  readonly recibido = input(false);
  protected readonly mensaje = signal('');
  protected readonly copiado = signal('');
  private readonly formato = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  });
  protected readonly importe = computed(() =>
    this.formato.format(Number(this.instruccion().importeReferencia)),
  );
  protected async copiar(valor: string, campo: string) {
    try {
      await navigator.clipboard.writeText(valor);
      this.copiado.set(campo);
      this.mensaje.set(campo === 'monto' ? 'Monto copiado.' : 'Celular copiado.');
    } catch {
      this.mensaje.set('No se pudo copiar. Selecciona y copia el dato mostrado.');
    }
  }
}
