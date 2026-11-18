import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Cuenta } from '../../servicios/cuenta';
import {
  claveValida,
  correoValido,
  destinoCuenta,
  nombreValido,
  requisitosClave,
} from '../../modelos/validacion-cuenta';
import { CampoFormulario } from '../../../../compartido/componentes/campo-formulario/campo-formulario';
import { CampoClave } from '../../../../compartido/componentes/campo-clave/campo-clave';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { CabeceraAcceso } from '../../componentes/cabecera-acceso/cabecera-acceso';
import { Carrito } from '../../../carrito/servicios/carrito';
import { BotonGoogle } from '../../componentes/boton-google/boton-google';
import { RecuperacionClave } from '../../componentes/recuperacion-clave/recuperacion-clave';
import { VerificarCorreo } from '../../componentes/verificar-correo/verificar-correo';

type VistaAcceso =
  'login' | 'registro' | 'sesion' | 'sin-permiso' | 'verificar' | 'recuperar' | 'restablecer';
type CampoAcceso = 'nombres' | 'apellidos' | 'correo' | 'clave' | 'confirmacion';

@Component({
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CampoFormulario,
    CampoClave,
    Icono,
    CabeceraAcceso,
    BotonGoogle,
    RecuperacionClave,
    VerificarCorreo,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-acceso',
  styleUrl: './acceso.css',
  templateUrl: './acceso.html',
})
export class Acceso {
  protected readonly cuenta = inject(Cuenta);
  protected readonly carrito = inject(Carrito);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destruir = inject(DestroyRef);
  protected readonly vista = (this.ruta.snapshot.data['vista'] ?? 'login') as VistaAcceso;
  protected readonly destino = destinoCuenta(this.ruta.snapshot.queryParamMap.get('volver'));
  protected readonly parametros = { volver: this.destino };
  protected readonly desdeCompra = this.destino === '/finalizar-compra';
  protected readonly ocupado = signal(false);
  protected readonly ocupadoGoogle = signal(false);
  protected readonly completandoGoogle = signal(false);
  protected readonly intentado = signal(false);
  protected readonly mensaje = signal(
    this.ruta.snapshot.queryParamMap.get('aviso') === 'sesion-vencida'
      ? 'Tu sesión ha vencido. Inicia sesión nuevamente para continuar.'
      : '',
  );
  protected readonly esError = signal(false);
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nombres: '',
    apellidos: '',
    correo: '',
    clave: '',
    confirmacion: '',
  });
  protected readonly titulo = computed(
    () =>
      ({
        login: 'Bienvenido a SOHO',
        registro: 'Crea tu cuenta',
        sesion: 'No pudimos comprobar tu sesión',
        'sin-permiso': 'Acceso restringido',
        verificar: 'Verificación de correo',
        recuperar: 'Recupera tu contraseña',
        restablecer: 'Nueva contraseña',
      })[this.vista],
  );
  protected readonly reglas = requisitosClave;

  protected error(campo: CampoAcceso): string {
    if (!this.intentado() && !this.formulario.controls[campo].touched) return '';
    const datos = this.formulario.getRawValue();
    if (campo === 'correo' && !correoValido(datos.correo))
      return 'Ingresa un correo válido, como nombre@correo.com.';
    if (
      this.vista === 'registro' &&
      (campo === 'nombres' || campo === 'apellidos') &&
      !nombreValido(datos[campo])
    )
      return 'Ingresa entre 2 y 80 caracteres.';
    if (campo === 'clave') {
      if (!datos.clave) return 'Ingresa tu contraseña.';
      if (Array.from(datos.clave).length > 128) return 'Usa como máximo 128 caracteres.';
      if (this.vista === 'registro' && !claveValida(datos.clave))
        return 'Usa una contraseña de entre 15 y 128 caracteres.';
    }
    if (campo === 'confirmacion' && datos.clave !== datos.confirmacion)
      return 'Las contraseñas no coinciden.';
    return '';
  }

  protected async enviar() {
    if (this.ocupado() || this.ocupadoGoogle() || !['login', 'registro'].includes(this.vista))
      return;
    this.intentado.set(true);
    this.formulario.markAllAsTouched();
    this.mensaje.set('');
    const campos: CampoAcceso[] =
      this.vista === 'login'
        ? ['correo', 'clave']
        : ['nombres', 'apellidos', 'correo', 'clave', 'confirmacion'];
    if (campos.some((campo) => this.error(campo))) {
      setTimeout(() => {
        if (!this.destruir.destroyed)
          this.elemento.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    const datos = this.formulario.getRawValue();
    this.ocupado.set(true);
    this.formulario.disable({ emitEvent: false });
    try {
      const resultado =
        this.vista === 'login'
          ? await this.cuenta.ingresar(datos.correo, datos.clave)
          : await this.cuenta.registrar({
              nombres: datos.nombres,
              apellidos: datos.apellidos,
              correo: datos.correo,
              clave: datos.clave,
            });
      if (this.destruir.destroyed) return;
      if (!resultado.correcto) {
        this.mostrarError(resultado.mensaje);
        return;
      }
      this.formulario.controls.clave.reset('');
      this.formulario.controls.confirmacion.reset('');
      const destino =
        !this.ruta.snapshot.queryParamMap.has('volver') && this.cuenta.perfil()?.rol === 'ADMIN'
          ? '/admin/dashboard'
          : this.destino;
      await this.router.navigateByUrl(destino);
    } catch {
      this.mostrarError('No pudimos completar la acción. Inténtalo nuevamente.');
    } finally {
      if (!this.destruir.destroyed) {
        this.ocupado.set(false);
        this.formulario.enable({ emitEvent: false });
      }
    }
  }
  private mostrarError(mensaje: string) {
    this.esError.set(true);
    this.mensaje.set(mensaje);
    setTimeout(() => {
      if (!this.destruir.destroyed)
        this.elemento.nativeElement.querySelector<HTMLElement>('[data-error]')?.focus();
    });
  }
  protected bloquearPorGoogle(ocupado: boolean) {
    this.ocupadoGoogle.set(ocupado);
    if (ocupado) this.formulario.disable({ emitEvent: false });
    else if (!this.ocupado()) this.formulario.enable({ emitEvent: false });
  }
  protected async continuarGoogle() {
    if (this.destruir.destroyed) return;
    this.formulario.controls.clave.reset('');
    this.formulario.controls.confirmacion.reset('');
    const destino =
      !this.ruta.snapshot.queryParamMap.has('volver') && this.cuenta.perfil()?.rol === 'ADMIN'
        ? '/admin/dashboard'
        : this.destino;
    await this.router.navigateByUrl(destino);
  }
  protected async reintentar() {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    await this.cuenta.comprobarSesion(true);
    if (this.destruir.destroyed) return;
    this.ocupado.set(false);
    if (this.cuenta.estadoSesion() === 'error') return;
    if (!this.cuenta.perfil())
      await this.router.navigate(['/iniciar-sesion'], { queryParams: this.parametros });
    else await this.router.navigateByUrl(this.destino);
  }
}
