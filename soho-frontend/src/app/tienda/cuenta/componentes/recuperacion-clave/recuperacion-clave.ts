import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Cuenta } from '../../servicios/cuenta';
import { claveValida, correoValido } from '../../modelos/validacion-cuenta';
import { CampoFormulario } from '../../../../compartido/componentes/campo-formulario/campo-formulario';
import { CampoClave } from '../../../../compartido/componentes/campo-clave/campo-clave';

@Component({
  selector: 'app-recuperacion-clave',
  imports: [RouterLink, ReactiveFormsModule, CampoFormulario, CampoClave],
  templateUrl: './recuperacion-clave.html',
  styleUrl: './recuperacion-clave.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecuperacionClave implements OnInit {
  private readonly cuenta = inject(Cuenta);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destruir = inject(DestroyRef);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly restableciendo = this.ruta.snapshot.data['vista'] === 'restablecer';
  protected readonly estado = signal<
    'comprobando' | 'vigente' | 'invalido' | 'error' | 'completado'
  >('comprobando');
  protected readonly ocupado = signal(false);
  protected readonly enviado = signal(false);
  protected readonly mensaje = signal('');
  protected readonly intentado = signal(false);
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    correo: '',
    clave: '',
    confirmacion: '',
  });
  private token = '';
  private revision = 0;
  private limpiandoFragmento = false;

  constructor() {
    if (this.restableciendo) {
      const meta = inject(Meta);
      const anterior = meta.getTag('name="referrer"')?.getAttribute('content');
      meta.updateTag({ name: 'referrer', content: 'no-referrer' });
      this.destruir.onDestroy(() => {
        this.token = '';
        ++this.revision;
        if (anterior === undefined || anterior === null) meta.removeTag('name="referrer"');
        else meta.updateTag({ name: 'referrer', content: anterior });
      });
    }
  }
  ngOnInit() {
    if (this.restableciendo) {
      this.ruta.fragment
        .pipe(takeUntilDestroyed(this.destruir))
        .subscribe((fragmento) => this.recibirFragmento(fragmento));
    }
  }
  private recibirFragmento(fragmento: string | null) {
    // La navegación que limpia la URL también emite null. Ese evento no
    // reemplaza el enlace que acabamos de conservar en memoria.
    if (fragmento === null && this.limpiandoFragmento) {
      this.limpiandoFragmento = false;
      return;
    }
    const revision = ++this.revision;
    const parametros = new URLSearchParams(fragmento ?? '');
    const token = parametros.get('token') ?? '';
    this.token =
      /^[A-Za-z0-9_-]{43}$/.test(token) && [...parametros.keys()].length === 1 ? token : '';
    this.ocupado.set(false);
    this.mensaje.set('');
    this.intentado.set(false);
    this.formulario.reset();
    this.formulario.enable({ emitEvent: false });
    // Se retira antes del primer POST. Sincronizar también Router permite
    // volver a abrir el mismo enlace mediante una navegación de fragmento.
    this.location.replaceState('/restablecer-contrasena');
    if (fragmento !== null) {
      this.limpiandoFragmento = true;
      queueMicrotask(() => {
        if (!this.destruir.destroyed && revision === this.revision)
          void this.router.navigateByUrl('/restablecer-contrasena', { replaceUrl: true });
      });
    }
    void this.comprobar();
  }
  protected error(campo: 'correo' | 'clave' | 'confirmacion'): string {
    if (!this.intentado() && !this.formulario.controls[campo].touched) return '';
    const datos = this.formulario.getRawValue();
    if (campo === 'correo' && !correoValido(datos.correo))
      return 'Ingresa un correo válido, como nombre@correo.com.';
    if (campo === 'clave' && !claveValida(datos.clave))
      return 'Usa una contraseña de entre 15 y 128 caracteres.';
    if (campo === 'confirmacion' && datos.confirmacion !== datos.clave)
      return 'Las contraseñas no coinciden.';
    return '';
  }
  protected async comprobar() {
    if (this.ocupado()) return;
    if (!this.token) {
      this.estado.set('invalido');
      return;
    }
    this.ocupado.set(true);
    this.estado.set('comprobando');
    this.mensaje.set('');
    const revision = this.revision;
    try {
      const resultado = await this.cuenta.comprobarRecuperacion(this.token);
      if (this.destruir.destroyed || revision !== this.revision) return;
      if (!resultado.correcto) {
        this.mensaje.set(resultado.mensaje);
        this.estado.set('error');
      } else this.estado.set(resultado.vigente ? 'vigente' : 'invalido');
    } finally {
      if (!this.destruir.destroyed && revision === this.revision) this.ocupado.set(false);
    }
  }
  protected async enviar() {
    if (this.ocupado() || (this.restableciendo && this.estado() !== 'vigente')) return;
    this.intentado.set(true);
    this.formulario.markAllAsTouched();
    this.mensaje.set('');
    const campos: ('correo' | 'clave' | 'confirmacion')[] = this.restableciendo
      ? ['clave', 'confirmacion']
      : ['correo'];
    if (campos.some((campo) => this.error(campo))) {
      this.enfocar('[aria-invalid="true"]');
      return;
    }
    const datos = this.formulario.getRawValue();
    const revision = this.revision;
    this.ocupado.set(true);
    this.formulario.disable({ emitEvent: false });
    try {
      const resultado = this.restableciendo
        ? await this.cuenta.restablecer(this.token, datos.clave)
        : await this.cuenta.solicitarRecuperacion(datos.correo);
      if (this.destruir.destroyed || revision !== this.revision) return;
      if (resultado.correcto) {
        if (this.restableciendo) {
          this.token = '';
          this.formulario.controls.clave.reset('');
          this.formulario.controls.confirmacion.reset('');
          this.estado.set('completado');
        } else {
          this.enviado.set(true);
          this.formulario.controls.correo.reset('');
        }
      } else if (resultado.codigo === 'enlace-invalido') {
        this.token = '';
        this.formulario.controls.clave.reset('');
        this.formulario.controls.confirmacion.reset('');
        this.estado.set('invalido');
      } else this.mensaje.set(resultado.mensaje);
      this.enfocar(resultado.correcto ? '[data-confirmacion]' : '[role="alert"]');
    } finally {
      if (!this.destruir.destroyed && revision === this.revision) {
        this.ocupado.set(false);
        this.formulario.enable({ emitEvent: false });
      }
    }
  }
  protected volverASolicitar() {
    this.enviado.set(false);
    this.intentado.set(false);
    this.mensaje.set('');
    this.enfocar('#recuperacion-correo');
  }
  private enfocar(selector: string) {
    const revision = this.revision;
    setTimeout(() => {
      if (!this.destruir.destroyed && revision === this.revision)
        this.elemento.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    });
  }
}
