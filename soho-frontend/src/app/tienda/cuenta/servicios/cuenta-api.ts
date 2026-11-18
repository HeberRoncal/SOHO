import { DestroyRef, Injectable, Injector, inject, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import {
  ComprobacionRecuperacion,
  NuevaDireccion,
  GestorCuenta,
  PerfilCuenta,
  RegistroCuenta,
  ResultadoCuenta,
} from '../modelos/cuenta';
import { RespuestaAcceso, RespuestaSesion } from '../modelos/autenticacion-api';
import { destinoCuenta, esRutaPrivada } from '../modelos/validacion-cuenta';
import { EstadoAutenticacion } from './estado-autenticacion';
import { GESTIONAR_401_LOCALMENTE } from './autenticacion-interceptor';
import { ProteccionCsrf } from './proteccion-csrf';
import { DireccionesApi } from './direcciones-api';

const noDisponible = (): ResultadoCuenta => ({
  correcto: false,
  mensaje: 'Esta función todavía no está disponible.',
});
const contexto = () => new HttpContext().set(GESTIONAR_401_LOCALMENTE, true);

@Injectable({ providedIn: 'root' })
export class CuentaApi implements GestorCuenta {
  private readonly injector = inject(Injector);
  private readonly destruir = inject(DestroyRef);
  private readonly estado = inject(EstadoAutenticacion);
  private readonly agenda = inject(DireccionesApi);
  private get http() {
    return this.injector.get(HttpClient);
  }
  readonly remoto = true;
  readonly perfil = this.estado.perfil.asReadonly();
  readonly estadoSesion = this.estado.estado.asReadonly();
  readonly mensajeSesion = this.estado.mensaje.asReadonly();
  readonly pendiente = signal(null).asReadonly();
  readonly direcciones = this.agenda.direcciones;
  readonly tokenRecuperacion = signal<string | null>(null).asReadonly();
  private consulta?: Promise<void>;
  private iniciada = false;
  private ultimaComprobacion = 0;
  private readonly cancelarConsulta = new Subject<void>();

  iniciar(): void {
    if (this.iniciada) return;
    this.iniciada = true;
    void this.comprobarSesion();
    const refrescar = () => {
      if (document.visibilityState !== 'visible' || Date.now() - this.ultimaComprobacion < 10000)
        return;
      const router = this.injector.get(Router);
      if (!this.perfil() && !esRutaPrivada(router.url)) return;
      void this.comprobarSesion(true).then(() => {
        if (!esRutaPrivada(router.url)) return;
        if (this.estadoSesion() === 'error')
          void router.navigate(['/sesion-no-disponible'], {
            queryParams: { volver: destinoCuenta(router.url) },
          });
        else if (!this.perfil())
          void router.navigate(['/iniciar-sesion'], {
            queryParams: { volver: destinoCuenta(router.url), aviso: 'sesion-vencida' },
          });
        else if (router.url.startsWith('/admin') && this.perfil()?.rol !== 'ADMIN')
          void router.navigate(['/sin-permiso']);
      });
    };
    window.addEventListener('focus', refrescar);
    document.addEventListener('visibilitychange', refrescar);
    this.destruir.onDestroy(() => {
      window.removeEventListener('focus', refrescar);
      document.removeEventListener('visibilitychange', refrescar);
    });
  }

  comprobarSesion(forzar = false): Promise<void> {
    if (this.consulta) return this.consulta;
    if (!forzar && !['inicial', 'error'].includes(this.estadoSesion())) return Promise.resolve();
    const revision = this.estado.revision;
    if (!this.perfil()) this.estado.estado.set('cargando');
    const consulta = firstValueFrom(
      this.http
        .get<RespuestaSesion>('/api/auth/me', { context: contexto(), timeout: 15000 })
        .pipe(takeUntil(this.cancelarConsulta)),
    )
      .then((r) => {
        if (revision === this.estado.revision) this.estado.aceptar(r.usuario, true);
      })
      .catch((error: unknown) => {
        if (revision !== this.estado.revision) return;
        if (error instanceof HttpErrorResponse && error.status === 401) this.estado.invalidar();
        else this.estado.fallar('Revisa tu conexión y vuelve a intentarlo.');
      })
      .finally(() => {
        this.ultimaComprobacion = Date.now();
        if (this.consulta === consulta) this.consulta = undefined;
      });
    this.consulta = consulta;
    return consulta;
  }

  ingresar(correo: string, clave: string): Promise<ResultadoCuenta> {
    return this.acceder('/api/auth/login', { correo: correo.trim().toLowerCase(), clave });
  }
  registrar(datos: RegistroCuenta): Promise<ResultadoCuenta> {
    return this.acceder('/api/auth/registro', {
      nombres: datos.nombres.trim(),
      apellidos: datos.apellidos.trim(),
      correo: datos.correo.trim().toLowerCase(),
      clave: datos.clave,
    });
  }
  private async acceder(ruta: string, datos: object): Promise<ResultadoCuenta> {
    const revision = this.prepararCambioSesion();
    try {
      const r = await firstValueFrom(
        this.http.post<RespuestaAcceso>(ruta, datos, { context: contexto(), timeout: 15000 }),
      );
      if (revision !== this.estado.revision)
        return { correcto: false, mensaje: 'La sesión cambió. Vuelve a intentarlo.' };
      this.aceptarCambioSesion(r, revision);
      return { correcto: true, mensaje: '' };
    } catch (error) {
      this.cancelarCambioSesion(revision);
      return { correcto: false, mensaje: this.mensajeError(error) };
    }
  }

  prepararCambioSesion(): number {
    const revision = ++this.estado.revision;
    this.cancelarConsulta.next();
    this.consulta = undefined;
    return revision;
  }
  aceptarCambioSesion(respuesta: RespuestaAcceso, revision: number): void {
    if (revision !== this.estado.revision) throw new Error('La sesión cambió durante el acceso.');
    this.estado.aceptar(respuesta.usuario);
  }
  cancelarCambioSesion(revision: number): void {
    if (revision === this.estado.revision && !this.perfil()) this.estado.estado.set('anonimo');
  }

  async cerrarSesion(): Promise<ResultadoCuenta> {
    ++this.estado.revision;
    this.cancelarConsulta.next();
    this.consulta = undefined;
    try {
      await firstValueFrom(
        this.http.post<void>('/api/auth/logout', {}, { context: contexto(), timeout: 15000 }),
      );
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401))
        return { correcto: false, mensaje: this.mensajeError(error) };
    }
    this.estado.invalidar();
    this.injector.get(ProteccionCsrf).limpiar();
    return { correcto: true, mensaje: '' };
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Correo o contraseña incorrectos.';
      if (error.status === 409)
        return 'Ya existe una cuenta con ese correo. Inicia sesión para continuar.';
      if (error.status === 429)
        return 'Has realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
      if (error.status === 403)
        return 'Actualiza la protección de tu sesión e inténtalo nuevamente.';
      if (error.status === 400)
        return 'Revisa los datos ingresados y los requisitos de la contraseña.';
    }
    return 'No pudimos conectar con SOHO. Revisa tu conexión y vuelve a intentarlo.';
  }

  async verificar(token: string): Promise<ResultadoCuenta> {
    const revision = this.estado.revision;
    try {
      await firstValueFrom(
        this.http.post(
          '/api/auth/verificacion/confirmar',
          { token },
          { context: contexto(), timeout: 15000 },
        ),
      );
      if (this.perfil() && revision === this.estado.revision) {
        this.prepararCambioSesion();
        await this.comprobarSesion(true);
      }
      return { correcto: true, mensaje: 'Tu correo se verificó correctamente.' };
    } catch (error) {
      return this.errorVerificacion(error);
    }
  }
  async reenviarVerificacion(): Promise<ResultadoCuenta> {
    try {
      await firstValueFrom(
        this.http.post('/api/auth/verificacion/reenviar', {}, { timeout: 15000 }),
      );
      return {
        correcto: true,
        mensaje: 'Si tu correo aún está pendiente, recibirás un enlace para verificarlo.',
      };
    } catch (error) {
      return this.errorVerificacion(error);
    }
  }
  async comprobarVerificacion(token: string): Promise<ComprobacionRecuperacion> {
    try {
      const r = await firstValueFrom(
        this.http.post<{ vigente: boolean }>(
          '/api/auth/verificacion/comprobar',
          { token },
          { context: contexto(), timeout: 15000 },
        ),
      );
      if (typeof r.vigente !== 'boolean') throw new Error();
      return { correcto: true, vigente: r.vigente, mensaje: '' };
    } catch (error) {
      return { ...this.errorVerificacion(error), vigente: false };
    }
  }
  private errorVerificacion(error: unknown): ResultadoCuenta {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 400 &&
      error.error?.codigo === 'VERIFICACION_ENLACE_INVALIDO'
    )
      return {
        correcto: false,
        codigo: 'enlace-invalido',
        mensaje:
          'Este enlace venció, ya fue utilizado o no es válido. Solicita otro desde tu cuenta.',
      };
    if (error instanceof HttpErrorResponse && error.status === 503)
      return {
        correcto: false,
        mensaje:
          'La verificación de correo no está disponible por el momento. Inténtalo más tarde.',
      };
    return { correcto: false, mensaje: this.mensajeError(error) };
  }
  corregirCorreo() {
    return noDisponible();
  }
  tokenVerificacion() {
    return null;
  }
  async solicitarRecuperacion(correo: string): Promise<ResultadoCuenta> {
    try {
      await firstValueFrom(
        this.http.post(
          '/api/auth/recuperacion',
          { correo: correo.trim().toLowerCase() },
          { context: contexto(), timeout: 15000 },
        ),
      );
      return {
        correcto: true,
        mensaje:
          'Si existe una cuenta con contraseña para ese correo, recibirás instrucciones para restablecerla.',
      };
    } catch (error) {
      return this.errorRecuperacion(error);
    }
  }
  async comprobarRecuperacion(token: string): Promise<ComprobacionRecuperacion> {
    try {
      const respuesta = await firstValueFrom(
        this.http.post<{ vigente: boolean }>(
          '/api/auth/recuperacion/comprobar',
          { token },
          { context: contexto(), timeout: 15000 },
        ),
      );
      if (typeof respuesta.vigente !== 'boolean') throw new Error('Respuesta inválida.');
      return { correcto: true, vigente: respuesta.vigente, mensaje: '' };
    } catch (error) {
      return { ...this.errorRecuperacion(error), vigente: false };
    }
  }
  async restablecer(token: string, clave: string): Promise<ResultadoCuenta> {
    const revision = this.prepararCambioSesion();
    try {
      await firstValueFrom(
        this.http.post(
          '/api/auth/recuperacion/restablecer',
          { token, clave },
          { context: contexto(), timeout: 15000 },
        ),
      );
      this.estado.invalidar();
      this.injector.get(ProteccionCsrf).limpiar();
      return {
        correcto: true,
        mensaje: 'Tu contraseña se actualizó. Inicia sesión con la nueva contraseña.',
      };
    } catch (error) {
      this.cancelarCambioSesion(revision);
      return this.errorRecuperacion(error);
    }
  }
  private errorRecuperacion(error: unknown): ResultadoCuenta {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 400 && error.error?.codigo === 'RECUPERACION_ENLACE_INVALIDO')
        return {
          correcto: false,
          codigo: 'enlace-invalido',
          mensaje: 'Este enlace venció, ya fue utilizado o no es válido. Solicita uno nuevo.',
        };
      if (error.status === 429)
        return {
          correcto: false,
          mensaje:
            'Has realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
        };
      if (error.status === 403)
        return {
          correcto: false,
          mensaje: 'Actualiza la protección de tu sesión e inténtalo nuevamente.',
        };
      if (error.status === 400)
        return {
          correcto: false,
          mensaje: 'Revisa el correo o los requisitos de la nueva contraseña.',
        };
      if (error.status === 503)
        return {
          correcto: false,
          mensaje:
            'El servicio de recuperación no está disponible por el momento. Inténtalo más tarde.',
        };
    }
    return {
      correcto: false,
      mensaje: 'No pudimos conectar con SOHO. Revisa tu conexión y vuelve a intentarlo.',
    };
  }
  enlaceVigente() {
    return false;
  }
  simularGoogle() {
    /* El acceso real con Google se incorporará en su integración. */
  }
  async guardarPerfil(
    datos: Pick<PerfilCuenta, 'nombres' | 'apellidos' | 'celular'>,
  ): Promise<ResultadoCuenta> {
    const usuarioId = this.perfil()?.id;
    if (!usuarioId) return { correcto: false, mensaje: 'Inicia sesión para editar tus datos.' };
    const revision = this.prepararCambioSesion();
    try {
      const respuesta = await firstValueFrom(
        this.http.patch<RespuestaSesion>(
          '/api/auth/me',
          { nombres: datos.nombres.trim(), apellidos: datos.apellidos.trim() },
          { timeout: 15000 },
        ),
      );
      if (revision !== this.estado.revision || this.perfil()?.id !== usuarioId)
        return { correcto: false, mensaje: 'La sesión cambió. Vuelve a intentarlo.' };
      if (respuesta.usuario?.id !== usuarioId) throw new Error('Respuesta de perfil no válida.');
      this.prepararCambioSesion();
      this.estado.aceptar(respuesta.usuario);
      return { correcto: true, mensaje: 'Tus datos se actualizaron correctamente.' };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 400)
          return {
            correcto: false,
            mensaje: 'Los nombres y apellidos deben tener entre 2 y 80 caracteres válidos.',
          };
        if (error.status === 401)
          return { correcto: false, mensaje: 'Tu sesión ha vencido. Inicia sesión nuevamente.' };
      }
      return { correcto: false, mensaje: this.mensajeError(error) };
    }
  }
  cargarDirecciones() {
    return this.agenda.cargar();
  }
  guardarDireccion(datos: NuevaDireccion) {
    return this.agenda.guardar(datos);
  }
  eliminarDireccion(id: string) {
    return this.agenda.eliminar(id);
  }
  predeterminarDireccion(id: string) {
    return this.agenda.predeterminar(id);
  }
}
