import {
  ForbiddenException,
  Inject,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from './configuracion-auth.js';
import { generarIdentificador, leerCookie } from '../sesiones/cookies-auth.js';

@Injectable()
export class CsrfService {
  constructor(
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
  ) {}

  private firma(nonce: string, sesion?: string): string {
    return createHmac('sha256', this.config.secretoCsrf)
      .update(JSON.stringify(['soho-csrf-v1', sesion ?? 'anonimo', nonce]))
      .digest('hex');
  }

  emitir(req: Request, res: Response, nuevaSesion?: string): string {
    this.origen(req, false);
    const nonce = nuevaSesion
      ? generarIdentificador()
      : (leerCookie(req, this.config.cookieCsrf) ?? generarIdentificador());
    res.cookie(this.config.cookieCsrf, nonce, {
      ...this.config.cookies,
      maxAge: this.config.duracionMs,
    });
    return this.firma(
      nonce,
      nuevaSesion ?? leerCookie(req, this.config.cookieSesion),
    );
  }

  private origen(req: Request, obligatorio: boolean): void {
    const origen = req.get('origin');
    if (
      req.get('sec-fetch-site') === 'cross-site' ||
      (obligatorio && !origen) ||
      (origen && !this.config.origenes.has(origen))
    ) {
      throw new ForbiddenException(
        'El origen de la solicitud no está permitido.',
      );
    }
  }

  validar(req: Request, multipart = false): void {
    this.origen(req, true);
    const formato = multipart ? 'multipart/form-data' : 'application/json';
    if (!req.is(formato))
      throw new UnsupportedMediaTypeException(
        'Envía los datos como ' + formato + '.',
      );
    const nonce = leerCookie(req, this.config.cookieCsrf);
    const recibido = req.get('x-csrf-token');
    if (
      !nonce ||
      !recibido ||
      !/^[0-9a-f]{64}$/.test(recibido) ||
      !timingSafeEqual(
        Buffer.from(recibido, 'hex'),
        Buffer.from(
          this.firma(nonce, leerCookie(req, this.config.cookieSesion)),
          'hex',
        ),
      )
    ) {
      throw new ForbiddenException(
        'La protección CSRF no es válida. Actualiza la sesión e inténtalo nuevamente.',
      );
    }
  }
}
