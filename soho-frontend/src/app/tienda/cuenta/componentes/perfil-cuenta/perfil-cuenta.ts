import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Cuenta } from '../../servicios/cuenta';
import { nombreValido } from '../../modelos/validacion-cuenta';
import { CampoFormulario } from '../../../../compartido/componentes/campo-formulario/campo-formulario';
import { VincularGoogle } from '../vincular-google/vincular-google';

@Component({
  imports: [ReactiveFormsModule, RouterLink, CampoFormulario, VincularGoogle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-perfil-cuenta',
  styleUrl: './perfil-cuenta.css',
  templateUrl: './perfil-cuenta.html',
})
export class PerfilCuenta implements OnInit {
  protected readonly cuenta = inject(Cuenta);
  private readonly destruir = inject(DestroyRef);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nombres: '',
    apellidos: '',
    celular: '',
  });
  protected readonly intentado = signal(false);
  protected readonly mensaje = signal('');
  protected readonly esError = signal(false);
  protected readonly ocupado = signal(false);
  ngOnInit() {
    const perfil = this.cuenta.perfil();
    if (perfil) this.formulario.patchValue(perfil);
    this.formulario.valueChanges.pipe(takeUntilDestroyed(this.destruir)).subscribe(() => {
      this.mensaje.set('');
    });
  }
  protected error(campo: 'nombres' | 'apellidos' | 'celular') {
    const entrada = this.formulario.controls[campo];
    if (!this.intentado() && !entrada.touched) return '';
    return campo === 'celular'
      ? entrada.value && !/^9\d{8}$/.test(entrada.value)
        ? 'Ingresa 9 dígitos, empezando por 9.'
        : ''
      : !nombreValido(entrada.value)
        ? 'Ingresa entre 2 y 80 caracteres válidos.'
        : '';
  }
  protected async guardar() {
    if (this.ocupado()) return;
    this.mensaje.set('');
    this.intentado.set(true);
    const invalido = (['nombres', 'apellidos', 'celular'] as const).find(
      (campo) => (campo !== 'celular' || !this.cuenta.remoto) && this.error(campo),
    );
    if (invalido) {
      this.elemento.nativeElement.querySelector<HTMLElement>('#perfil-' + invalido)?.focus();
      return;
    }
    const datos = this.formulario.getRawValue();
    this.ocupado.set(true);
    this.formulario.disable({ emitEvent: false });
    try {
      const resultado = await this.cuenta.guardarPerfil(datos);
      if (this.destruir.destroyed) return;
      this.esError.set(!resultado.correcto);
      this.mensaje.set(resultado.mensaje);
      if (resultado.correcto) {
        const perfil = this.cuenta.perfil();
        this.formulario.reset(
          {
            nombres: perfil?.nombres ?? datos.nombres.trim(),
            apellidos: perfil?.apellidos ?? datos.apellidos.trim(),
            celular: perfil?.celular ?? datos.celular,
          },
          { emitEvent: false },
        );
        this.intentado.set(false);
      }
      this.anunciar();
    } catch {
      if (this.destruir.destroyed) return;
      this.esError.set(true);
      this.mensaje.set('No pudimos guardar tus datos. Revisa tu conexión e inténtalo nuevamente.');
      this.anunciar();
    } finally {
      if (!this.destruir.destroyed) {
        this.ocupado.set(false);
        this.formulario.enable({ emitEvent: false });
      }
    }
  }
  private anunciar() {
    afterNextRender(
      () => {
        if (!this.destruir.destroyed)
          this.elemento.nativeElement
            .querySelector<HTMLElement>('[data-resultado-perfil]')
            ?.focus();
      },
      { injector: this.injector },
    );
  }
}
