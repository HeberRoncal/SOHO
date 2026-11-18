import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icono } from '../icono/icono';
import { CampoFormulario } from '../campo-formulario/campo-formulario';

@Component({
  imports: [Icono, CampoFormulario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CampoClave), multi: true },
  ],
  selector: 'app-campo-clave',
  styleUrl: './campo-clave.css',
  templateUrl: './campo-clave.html',
})
export class CampoClave implements ControlValueAccessor {
  readonly identificador = input('clave');
  readonly etiqueta = input('Contraseña');
  readonly autocompletar = input('current-password');
  readonly error = input('');
  readonly ayuda = input('');
  protected readonly valor = signal('');
  protected readonly visible = signal(false);
  protected readonly deshabilitado = signal(false);
  private cambiado: (valor: string) => void = () => undefined;
  protected tocado: () => void = () => undefined;
  writeValue(valor: string | null) {
    this.valor.set(valor ?? '');
  }
  registerOnChange(fn: (valor: string) => void) {
    this.cambiado = fn;
  }
  registerOnTouched(fn: () => void) {
    this.tocado = fn;
  }
  setDisabledState(valor: boolean) {
    this.deshabilitado.set(valor);
  }
  protected escribir(evento: Event) {
    const valor = (evento.target as HTMLInputElement).value;
    this.valor.set(valor);
    this.cambiado(valor);
  }
}
