import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../seguridad/configuracion-auth.js';
import {
  generarIdentificador,
  hashIdentificador,
  leerCookie,
} from '../sesiones/cookies-auth.js';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';

type PropositoGoogle = 'acceso' | 'vinculacion';
interface Desafio {
  nonce: string;
  expira: number;
  proposito: PropositoGoogle;
  sesion: string;
  sesionId?: string;
  ocupado: boolean;
}

/** Almacén acotado para una instancia. Compartir en Redis antes de escalar procesos. */
@Injectable()
export class DesafiosGoogleService {
  private readonly desafios = new Map<string, Desafio>();
  constructor(
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
  ) {}

  emitir(req: PeticionAuth, res: Response, proposito: PropositoGoogle) {
    if (!this.config.googleClientId)
      throw new ServiceUnavailableException(
        'El acceso con Google no está configurado.',
      );
    for (const [id, desafio] of this.desafios)
      if (desafio.expira <= Date.now()) this.desafios.delete(id);
    this.invalidar(req, res);
    if (this.desafios.size >= 1024)
      throw new ServiceUnavailableException(
        'No se pudo iniciar Google. Inténtalo más tarde.',
      );
    const secreto = generarIdentificador();
    const nonce = generarIdentificador();
    const expira = Date.now() + 5 * 60 * 1000;
    this.desafios.set(hashIdentificador(secreto), {
      nonce,
      expira,
      proposito,
      sesion: hashIdentificador(
        leerCookie(req, this.config.cookieSesion) ?? 'anonimo',
      ),
      sesionId: req.autenticacion?.sesionId,
      ocupado: false,
    });
    res.cookie(this.config.cookieGoogle, secreto, {
      ...this.config.cookies,
      maxAge: 5 * 60 * 1000,
    });
    return {
      clientId: this.config.googleClientId,
      nonce,
      expiraEn: new Date(expira).toISOString(),
    };
  }

  reservar(req: PeticionAuth, proposito: PropositoGoogle) {
    const cookie = leerCookie(req, this.config.cookieGoogle);
    const id = cookie ? hashIdentificador(cookie) : '';
    const desafio = this.desafios.get(id);
    if (
      !desafio ||
      desafio.ocupado ||
      desafio.expira <= Date.now() ||
      desafio.proposito !== proposito ||
      desafio.sesion !==
        hashIdentificador(
          leerCookie(req, this.config.cookieSesion) ?? 'anonimo',
        ) ||
      (proposito === 'vinculacion' &&
        (!req.autenticacion || desafio.sesionId !== req.autenticacion.sesionId))
    ) {
      throw new BadRequestException({
        codigo: 'GOOGLE_DESAFIO_INVALIDO',
        message: 'Vuelve a iniciar el acceso con Google.',
      });
    }
    desafio.ocupado = true;
    return {
      nonce: desafio.nonce,
      finalizar: (preservar = false) => {
        if (this.desafios.get(id) !== desafio) return;
        if (preservar && desafio.expira > Date.now()) desafio.ocupado = false;
        else this.desafios.delete(id);
      },
    };
  }

  invalidar(req: PeticionAuth, res: Response): void {
    const cookie = leerCookie(req, this.config.cookieGoogle);
    if (cookie) this.desafios.delete(hashIdentificador(cookie));
    res.clearCookie(this.config.cookieGoogle, this.config.cookies);
  }
}
