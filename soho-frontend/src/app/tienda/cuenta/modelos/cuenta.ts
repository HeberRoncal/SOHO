import { Signal } from '@angular/core';
export type RolCuenta = 'ADMIN' | 'CLIENTE';
export type EstadoSesion = 'inicial' | 'cargando' | 'autenticado' | 'anonimo' | 'error';
export interface PerfilCuenta {
  readonly id: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly correo: string;
  readonly celular: string;
  readonly verificado: boolean;
  readonly proveedor: 'correo' | 'google';
  readonly rol?: RolCuenta;
}
/** Dueño y permisos de una pantalla, independientes de su nombre y correo. */
export function identidadCuenta(perfil: PerfilCuenta | null): string {
  return JSON.stringify([perfil?.id ?? null, perfil?.rol ?? null]);
}
export interface RegistroCuenta {
  readonly nombres: string;
  readonly apellidos: string;
  readonly correo: string;
  readonly clave: string;
}
export interface DireccionCuenta {
  readonly id: string;
  readonly etiqueta: string;
  readonly destinatario: string;
  readonly celular: string;
  readonly distrito: string;
  readonly direccion: string;
  readonly referencia: string;
  readonly predeterminada: boolean;
}
export type NuevaDireccion = Omit<DireccionCuenta, 'id'> & { readonly id?: string };
export interface ResultadoCuenta {
  readonly correcto: boolean;
  readonly mensaje: string;
  readonly verificar?: boolean;
  readonly codigo?: 'enlace-invalido';
}
export interface ComprobacionEnlaceCuenta extends ResultadoCuenta {
  readonly vigente: boolean;
}
export interface ComprobacionRecuperacion extends ComprobacionEnlaceCuenta {}
export type TipoEnlaceCuenta = 'verificacion' | 'recuperacion';
export interface GestorCuenta {
  readonly remoto?: boolean;
  readonly estadoSesion?: Signal<EstadoSesion>;
  readonly mensajeSesion?: Signal<string>;
  iniciar?(): void;
  comprobarSesion?(forzar?: boolean): Promise<void>;
  readonly perfil: Signal<PerfilCuenta | null>;
  readonly pendiente: Signal<PerfilCuenta | null>;
  readonly direcciones: Signal<readonly DireccionCuenta[]>;
  readonly tokenRecuperacion: Signal<string | null>;
  ingresar(correo: string, clave: string): Promise<ResultadoCuenta>;
  registrar(datos: RegistroCuenta): Promise<ResultadoCuenta>;
  verificar(token: string): ResultadoCuenta | Promise<ResultadoCuenta>;
  reenviarVerificacion(): ResultadoCuenta | Promise<ResultadoCuenta>;
  comprobarVerificacion?(token: string): Promise<ComprobacionEnlaceCuenta>;
  corregirCorreo(correo: string): ResultadoCuenta;
  tokenVerificacion(): string | null;
  solicitarRecuperacion(correo: string): Promise<ResultadoCuenta>;
  comprobarRecuperacion?(token: string): Promise<ComprobacionRecuperacion>;
  restablecer(token: string, clave: string): Promise<ResultadoCuenta>;
  enlaceVigente(token: string, tipo: TipoEnlaceCuenta): boolean;
  simularGoogle(): void;
  cerrarSesion(): void | Promise<ResultadoCuenta>;
  guardarPerfil(
    datos: Pick<PerfilCuenta, 'nombres' | 'apellidos' | 'celular'>,
  ): ResultadoCuenta | Promise<ResultadoCuenta>;
  cargarDirecciones?(): Promise<ResultadoCuenta>;
  guardarDireccion(datos: NuevaDireccion): ResultadoCuenta | Promise<ResultadoCuenta>;
  eliminarDireccion(id: string): void | ResultadoCuenta | Promise<ResultadoCuenta>;
  predeterminarDireccion(id: string): void | ResultadoCuenta | Promise<ResultadoCuenta>;
}
