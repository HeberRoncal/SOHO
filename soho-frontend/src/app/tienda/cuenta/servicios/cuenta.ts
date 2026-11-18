import { Injectable, InjectionToken, computed, inject } from '@angular/core';
import {
  ComprobacionEnlaceCuenta,
  GestorCuenta,
  NuevaDireccion,
  PerfilCuenta,
  RegistroCuenta,
  TipoEnlaceCuenta,
} from '../modelos/cuenta';
import { CuentaApi } from './cuenta-api';
export const GESTOR_CUENTA = new InjectionToken<GestorCuenta>('GESTOR_CUENTA', {
  providedIn: 'root',
  factory: () => inject(CuentaApi),
});
@Injectable({ providedIn: 'root' })
export class Cuenta implements GestorCuenta {
  private readonly gestor = inject(GESTOR_CUENTA);
  readonly perfil = this.gestor.perfil;
  readonly pendiente = this.gestor.pendiente;
  readonly direcciones = this.gestor.direcciones;
  readonly tokenRecuperacion = this.gestor.tokenRecuperacion;
  readonly remoto = this.gestor.remoto ?? false;
  readonly estadoSesion =
    this.gestor.estadoSesion ??
    computed(() => (this.perfil() ? ('autenticado' as const) : ('anonimo' as const)));
  readonly mensajeSesion = this.gestor.mensajeSesion ?? computed(() => '');
  iniciar() {
    this.gestor.iniciar?.();
  }
  comprobarSesion(forzar = false) {
    return this.gestor.comprobarSesion?.(forzar) ?? Promise.resolve();
  }
  ingresar(correo: string, clave: string) {
    return this.gestor.ingresar(correo, clave);
  }
  registrar(datos: RegistroCuenta) {
    return this.gestor.registrar(datos);
  }
  async verificar(token: string) {
    return await this.gestor.verificar(token);
  }
  async reenviarVerificacion() {
    return await this.gestor.reenviarVerificacion();
  }
  comprobarVerificacion(token: string): Promise<ComprobacionEnlaceCuenta> {
    return (
      this.gestor.comprobarVerificacion?.(token) ??
      Promise.resolve({
        correcto: false,
        vigente: false,
        mensaje: 'No pudimos comprobar el enlace. Inténtalo nuevamente.',
      })
    );
  }
  corregirCorreo(correo: string) {
    return this.gestor.corregirCorreo(correo);
  }
  tokenVerificacion() {
    return this.gestor.tokenVerificacion();
  }
  solicitarRecuperacion(correo: string) {
    return this.gestor.solicitarRecuperacion(correo);
  }
  comprobarRecuperacion(token: string) {
    return (
      this.gestor.comprobarRecuperacion?.(token) ??
      Promise.resolve({
        correcto: false,
        vigente: false,
        mensaje: 'No pudimos comprobar el enlace. Inténtalo nuevamente.',
      })
    );
  }
  restablecer(token: string, clave: string) {
    return this.gestor.restablecer(token, clave);
  }
  enlaceVigente(token: string, tipo: TipoEnlaceCuenta) {
    return this.gestor.enlaceVigente(token, tipo);
  }
  simularGoogle() {
    this.gestor.simularGoogle();
  }
  async cerrarSesion() {
    return (await this.gestor.cerrarSesion()) ?? { correcto: true, mensaje: '' };
  }
  async guardarPerfil(datos: Pick<PerfilCuenta, 'nombres' | 'apellidos' | 'celular'>) {
    return await this.gestor.guardarPerfil(datos);
  }
  guardarDireccion(datos: NuevaDireccion) {
    return this.gestor.guardarDireccion(datos);
  }
  cargarDirecciones() {
    return this.gestor.cargarDirecciones?.() ?? Promise.resolve({ correcto: true, mensaje: '' });
  }
  async eliminarDireccion(id: string) {
    return (
      (await this.gestor.eliminarDireccion(id)) ?? {
        correcto: true,
        mensaje: 'Dirección eliminada.',
      }
    );
  }
  async predeterminarDireccion(id: string) {
    return (
      (await this.gestor.predeterminarDireccion(id)) ?? {
        correcto: true,
        mensaje: 'Dirección predeterminada actualizada.',
      }
    );
  }
}
