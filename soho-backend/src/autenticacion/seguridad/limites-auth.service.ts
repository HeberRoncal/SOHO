import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';

export type TipoLimiteAuth =
  | 'login'
  | 'registro'
  | 'csrf'
  | 'google'
  | 'recuperacion'
  | 'comprobar-recuperacion'
  | 'restablecer'
  | 'reenviar-verificacion'
  | 'comprobar-verificacion'
  | 'confirmar-verificacion'
  | 'crear-pedido'
  | 'cargar-fotografia'
  | 'consultar-pedido';

@Injectable()
export class LimitesAuthService {
  private readonly ventanas = new Map<string, { fin: number; usos: number }>();

  comprobar(tipo: TipoLimiteAuth, req: Request, res: Response): void {
    const ahora = Date.now();
    for (const [clave, ventana] of this.ventanas)
      if (ventana.fin <= ahora) this.ventanas.delete(clave);
    const duracion =
      tipo === 'registro' ||
      tipo === 'recuperacion' ||
      tipo === 'reenviar-verificacion'
        ? 60 * 60 * 1000
        : 60 * 1000;
    const maximo =
      tipo === 'crear-pedido' || tipo === 'cargar-fotografia'
        ? 10
        : tipo === 'login' || tipo === 'google'
          ? 20
          : tipo === 'registro' ||
              tipo === 'recuperacion' ||
              tipo === 'restablecer' ||
              tipo === 'reenviar-verificacion' ||
              tipo === 'confirmar-verificacion'
            ? 10
            : 60;
    const reglas: [string, number, number][] = [
      [`${tipo}:ip:${req.ip}`, maximo, duracion],
    ];
    if (tipo === 'reenviar-verificacion') {
      const usuarioId = (req as PeticionAuth).autenticacion?.usuario.id;
      if (usuarioId)
        reglas.push([`verificacion:usuario:${usuarioId}`, 3, 60 * 60 * 1000]);
    }
    const datos: unknown = req.body;
    if (
      (tipo === 'login' || tipo === 'recuperacion') &&
      datos &&
      typeof datos === 'object' &&
      'correo' in datos &&
      typeof datos.correo === 'string'
    ) {
      const correo = createHash('sha256')
        .update(datos.correo.trim().toLowerCase().slice(0, 512))
        .digest('hex');
      reglas.push(
        tipo === 'login'
          ? [`login:correo:${correo}`, 10, 15 * 60 * 1000]
          : [`recuperacion:correo:${correo}`, 3, 60 * 60 * 1000],
      );
    }
    for (const [clave, limite, intervalo] of reglas) {
      const anterior = this.ventanas.get(clave);
      if (
        (anterior && anterior.usos >= limite) ||
        (!anterior && this.ventanas.size >= 10000)
      ) {
        res.setHeader(
          'Retry-After',
          Math.max(
            1,
            Math.ceil(((anterior?.fin ?? ahora + intervalo) - ahora) / 1000),
          ),
        );
        throw new HttpException(
          'Demasiados intentos. Inténtalo más tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.ventanas.set(clave, {
        fin: anterior?.fin ?? ahora + intervalo,
        usos: (anterior?.usos ?? 0) + 1,
      });
    }
  }
}
