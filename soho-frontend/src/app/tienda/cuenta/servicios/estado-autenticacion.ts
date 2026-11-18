import { Injectable, signal } from '@angular/core';
import { DireccionCuenta, EstadoSesion, PerfilCuenta } from '../modelos/cuenta';
import { UsuarioApi } from '../modelos/autenticacion-api';

/** Estado en memoria; las cookies HttpOnly pertenecen al navegador. */
@Injectable({ providedIn: 'root' })
export class EstadoAutenticacion {
  readonly perfil = signal<PerfilCuenta | null>(null);
  readonly estado = signal<EstadoSesion>('inicial');
  readonly mensaje = signal('');
  readonly direcciones = signal<readonly DireccionCuenta[]>([]);
  revision = 0;

  aceptar(usuario: UsuarioApi, conservarSiNoCambio = false): void {
    if (
      !usuario ||
      !['ADMIN', 'CLIENTE'].includes(usuario.rol) ||
      !['id', 'nombres', 'apellidos', 'correo'].every(
        (campo) => typeof usuario[campo as keyof UsuarioApi] === 'string',
      ) ||
      typeof usuario.correoVerificado !== 'boolean'
    )
      throw new Error('Respuesta de sesión no válida.');
    const anterior = this.perfil();
    const siguiente: PerfilCuenta = Object.freeze({
      id: usuario.id,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      correo: usuario.correo,
      rol: usuario.rol,
      verificado: usuario.correoVerificado,
      celular: '',
      proveedor: 'correo',
    });
    if (anterior?.id !== usuario.id) this.direcciones.set([]);
    // Revalidar /me no inicia otra sesión: conserva la referencia del perfil
    // cuando sus datos no cambiaron para no reiniciar las pantallas.
    if (
      !conservarSiNoCambio ||
      !anterior ||
      !Object.entries(siguiente).every(
        ([campo, valor]) => anterior[campo as keyof PerfilCuenta] === valor,
      )
    )
      this.perfil.set(siguiente);
    this.estado.set('autenticado');
    this.mensaje.set('');
  }

  invalidar(mensaje = ''): void {
    this.revision++;
    this.direcciones.set([]);
    this.perfil.set(null);
    this.estado.set('anonimo');
    this.mensaje.set(mensaje);
  }

  fallar(mensaje: string): void {
    this.direcciones.set([]);
    this.perfil.set(null);
    this.estado.set('error');
    this.mensaje.set(mensaje);
  }
}
