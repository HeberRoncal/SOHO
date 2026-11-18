import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../seguridad/configuracion-auth.js';
import { normalizarCorreo } from '../acceso/datos-auth.js';

export interface IdentidadGoogleVerificada {
  sub: string;
  correo: string;
  correoConfiable: boolean;
  nombres?: string;
  apellidos?: string;
}

@Injectable()
export class VerificadorGoogleService {
  readonly cliente = new OAuth2Client({
    transporterOptions: { timeout: 10000, retry: false },
  });
  constructor(
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
  ) {}

  async verificar(
    credential: string,
    nonce: string,
  ): Promise<IdentidadGoogleVerificada> {
    if (!this.config.googleClientId)
      throw new ServiceUnavailableException(
        'El acceso con Google no está configurado.',
      );
    try {
      const encabezado: unknown = JSON.parse(
        Buffer.from(credential.split('.')[0], 'base64url').toString('utf8'),
      );
      if (
        !encabezado ||
        typeof encabezado !== 'object' ||
        !('alg' in encabezado) ||
        encabezado.alg !== 'RS256'
      )
        throw new Error();
      const ticket = await this.cliente.verifyIdToken({
        idToken: credential,
        audience: this.config.googleClientId,
      });
      const datos = ticket.getPayload();
      const recibidoNonce: unknown =
        datos && 'nonce' in datos ? datos.nonce : undefined;
      if (
        !datos ||
        datos.aud !== this.config.googleClientId ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(
          datos.iss,
        ) ||
        !Number.isInteger(datos.exp) ||
        datos.exp * 1000 <= Date.now() ||
        !Number.isInteger(datos.iat) ||
        datos.iat * 1000 > Date.now() + 60000 ||
        typeof datos.sub !== 'string' ||
        !datos.sub.length ||
        datos.sub.length > 255 ||
        /[^!-~]/.test(datos.sub) ||
        recibidoNonce !== nonce ||
        datos.email_verified !== true
      )
        throw new Error();
      const correo = normalizarCorreo(datos.email);
      return {
        sub: datos.sub,
        correo,
        correoConfiable:
          correo.endsWith('@gmail.com') ||
          (typeof datos.hd === 'string' && !!datos.hd),
        nombres: datos.given_name,
        apellidos: datos.family_name,
      };
    } catch (error) {
      // Los fallos de red no se confunden con una credencial inválida ni exponen el JWT.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(
          String(error.code),
        )
      ) {
        throw new ServiceUnavailableException(
          'No pudimos consultar Google. Inténtalo nuevamente.',
        );
      }
      throw new BadRequestException({
        codigo: 'GOOGLE_CREDENCIAL_INVALIDA',
        message:
          'No pudimos validar el acceso con Google. Vuelve a intentarlo.',
      });
    }
  }
}
