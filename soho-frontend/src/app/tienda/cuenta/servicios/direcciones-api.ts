import { Injectable, Injector, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DireccionCuenta, NuevaDireccion, ResultadoCuenta } from '../modelos/cuenta';
import { EstadoAutenticacion } from './estado-autenticacion';

const ruta = '/api/direcciones';
const camposTexto = [
  'id',
  'etiqueta',
  'destinatario',
  'celular',
  'distrito',
  'direccion',
  'referencia',
] as const;

@Injectable({ providedIn: 'root' })
export class DireccionesApi {
  private readonly injector = inject(Injector);
  private readonly estado = inject(EstadoAutenticacion);
  private secuencia = 0;
  readonly direcciones = this.estado.direcciones.asReadonly();

  cargar(): Promise<ResultadoCuenta> {
    return this.enviar('GET', ruta, undefined, 'Tus direcciones están actualizadas.');
  }

  guardar(datos: NuevaDireccion): Promise<ResultadoCuenta> {
    const cuerpo = {
      etiqueta: datos.etiqueta.trim(),
      destinatario: datos.destinatario.trim(),
      celular: datos.celular.trim(),
      distrito: datos.distrito,
      direccion: datos.direccion.trim(),
      referencia: datos.referencia.trim(),
      predeterminada: datos.predeterminada,
    };
    return this.enviar(
      datos.id ? 'PATCH' : 'POST',
      datos.id ? `${ruta}/${encodeURIComponent(datos.id)}` : ruta,
      cuerpo,
      'Tu dirección se guardó correctamente.',
    );
  }

  eliminar(id: string): Promise<ResultadoCuenta> {
    return this.enviar('DELETE', `${ruta}/${encodeURIComponent(id)}`, {}, 'Dirección eliminada.');
  }

  predeterminar(id: string): Promise<ResultadoCuenta> {
    return this.enviar(
      'PATCH',
      `${ruta}/${encodeURIComponent(id)}/predeterminada`,
      {},
      'Dirección predeterminada actualizada.',
    );
  }

  private async enviar(
    metodo: string,
    destino: string,
    datos: object | undefined,
    mensaje: string,
  ): Promise<ResultadoCuenta> {
    const usuarioId = this.estado.perfil()?.id;
    if (!usuarioId)
      return { correcto: false, mensaje: 'Inicia sesión para gestionar tus direcciones.' };
    const revision = this.estado.revision;
    const secuencia = ++this.secuencia;
    try {
      const respuesta = await firstValueFrom(
        this.injector.get(HttpClient).request<{ direcciones: DireccionCuenta[] }>(metodo, destino, {
          body: datos,
          timeout: 15000,
        }),
      );
      if (
        revision !== this.estado.revision ||
        this.estado.perfil()?.id !== usuarioId ||
        secuencia !== this.secuencia
      )
        return {
          correcto: false,
          mensaje: 'La cuenta o la agenda cambió. Actualiza tus direcciones.',
        };
      if (
        !Array.isArray(respuesta.direcciones) ||
        !respuesta.direcciones.every(
          (d) =>
            d &&
            camposTexto.every((c) => typeof d[c] === 'string') &&
            typeof d.predeterminada === 'boolean',
        )
      )
        throw new Error('Respuesta de direcciones no válida.');
      this.estado.direcciones.set(
        Object.freeze(
          respuesta.direcciones.map((d) =>
            Object.freeze({
              id: d.id,
              etiqueta: d.etiqueta,
              destinatario: d.destinatario,
              celular: d.celular,
              distrito: d.distrito,
              direccion: d.direccion,
              referencia: d.referencia,
              predeterminada: d.predeterminada,
            }),
          ),
        ),
      );
      return { correcto: true, mensaje };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401)
          return { correcto: false, mensaje: 'Tu sesión ha vencido. Inicia sesión nuevamente.' };
        if (error.status === 400)
          return { correcto: false, mensaje: 'Revisa los datos de la dirección y sus límites.' };
        if (error.status === 403)
          return {
            correcto: false,
            mensaje: 'Actualiza la protección de tu sesión e inténtalo nuevamente.',
          };
        if ([404, 409].includes(error.status))
          return {
            correcto: false,
            mensaje: 'La dirección cambió o ya no está disponible. Actualiza tus direcciones.',
          };
      }
      return {
        correcto: false,
        mensaje:
          'No pudimos confirmar la operación. Actualiza tus direcciones antes de reintentar.',
      };
    }
  }
}
