import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ConfiguracionGoogle,
  DesafioGoogle,
  PerfilGoogle,
  PropositoGoogle,
  ResultadoGoogle,
} from '../modelos/google';
import { RespuestaAcceso } from '../modelos/autenticacion-api';
import { CuentaApi } from './cuenta-api';
import { GESTIONAR_401_LOCALMENTE } from './autenticacion-interceptor';

@Injectable({ providedIn: 'root' })
export class GoogleCuentaApi {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(CuentaApi);
  configuracion() {
    return firstValueFrom(
      this.http.get<ConfiguracionGoogle>('/api/auth/google/configuracion', { timeout: 15000 }),
    );
  }
  desafio(proposito: PropositoGoogle) {
    return firstValueFrom(
      this.http.post<DesafioGoogle>(
        `/api/auth/google/${proposito === 'acceso' ? '' : 'vinculacion/'}desafio`,
        {},
        { timeout: 15000 },
      ),
    );
  }
  estado() {
    return firstValueFrom(
      this.http.get<{ vinculado: boolean }>('/api/auth/google/vinculacion', { timeout: 15000 }),
    );
  }
  ingresar(credential: string, perfil?: PerfilGoogle) {
    return this.finalizar('/api/auth/google', { credential, ...(perfil ? { perfil } : {}) });
  }
  vincular(credential: string, clave: string) {
    return this.finalizar('/api/auth/google/vinculacion', { credential, clave });
  }
  private async finalizar(ruta: string, cuerpo: object): Promise<ResultadoGoogle> {
    const revision = this.cuenta.prepararCambioSesion();
    try {
      const respuesta = await firstValueFrom(
        this.http.post<RespuestaAcceso>(ruta, cuerpo, {
          timeout: 15000,
          context: new HttpContext().set(GESTIONAR_401_LOCALMENTE, ruta === '/api/auth/google'),
        }),
      );
      this.cuenta.aceptarCambioSesion(respuesta, revision);
      return { tipo: 'correcto' };
    } catch (error) {
      this.cuenta.cancelarCambioSesion(revision);
      if (error instanceof HttpErrorResponse) {
        const datos = error.error as {
          codigo?: string;
          perfil?: PerfilGoogle & { correo: string };
        } | null;
        if (
          error.status === 422 &&
          datos?.codigo === 'GOOGLE_COMPLETAR_PERFIL' &&
          datos.perfil &&
          [datos.perfil.nombres, datos.perfil.apellidos, datos.perfil.correo].every(
            (v) => typeof v === 'string',
          )
        )
          return { tipo: 'completar', perfil: datos.perfil };
        const mensajes: Record<string, string> = {
          GOOGLE_VINCULACION_REQUERIDA:
            'Ya tienes una cuenta con ese correo. Inicia sesión y vincula Google desde Mis datos.',
          GOOGLE_CORREO_NO_VERIFICABLE:
            'Para este correo, crea una cuenta con contraseña y vincula Google desde Mis datos.',
          GOOGLE_REAUTENTICACION_REQUERIDA:
            'La contraseña actual no es correcta. Revísala y vuelve a intentarlo.',
          GOOGLE_IDENTIDAD_OCUPADA:
            'Esta cuenta de Google ya está vinculada a otra cuenta de SOHO.',
          GOOGLE_YA_VINCULADO: 'Tu cuenta ya tiene Google vinculado.',
          GOOGLE_DESAFIO_INVALIDO: 'El acceso con Google venció. Vuelve a iniciarlo.',
          GOOGLE_CREDENCIAL_INVALIDA: 'No pudimos validar Google. Vuelve a iniciar el acceso.',
          GOOGLE_CONFLICTO_CUENTA: 'La cuenta cambió durante el acceso. Vuelve a intentarlo.',
        };
        if (datos?.codigo && mensajes[datos.codigo])
          return { tipo: 'error', mensaje: mensajes[datos.codigo] };
        if (error.status === 429)
          return {
            tipo: 'error',
            mensaje: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
          };
        if (error.status === 403)
          return { tipo: 'error', mensaje: 'No se pudo completar el acceso con esta cuenta.' };
      }
      return {
        tipo: 'error',
        mensaje: 'No pudimos conectar con Google. Puedes volver a intentarlo o usar tu correo.',
      };
    }
  }
}
