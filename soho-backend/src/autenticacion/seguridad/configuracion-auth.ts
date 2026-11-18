import { randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';

export const CONFIGURACION_AUTH = Symbol('CONFIGURACION_AUTH');
export interface ConfiguracionAuth {
  origenes: ReadonlySet<string>;
  secretoCsrf: Buffer;
  cookieSesion: string;
  cookieCsrf: string;
  cookies: CookieOptions;
  duracionMs: number;
  inactividadMs: number;
  googleClientId?: string;
  cookieGoogle: string;
}

export function crearConfiguracionAuth(
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionAuth {
  const produccion = entorno.NODE_ENV === 'production';
  if (produccion && (!entorno.AUTH_ORIGENES || !entorno.AUTH_SECRETO_CSRF)) {
    throw new Error(
      'Configura AUTH_ORIGENES y AUTH_SECRETO_CSRF en producción.',
    );
  }
  const origenes = new Set(
    (entorno.AUTH_ORIGENES ?? 'http://localhost:4200,http://127.0.0.1:4200')
      .split(',')
      .map((valor) => {
        const origen = valor.trim();
        try {
          const url = new URL(origen);
          if (
            url.origin !== origen ||
            !['http:', 'https:'].includes(url.protocol) ||
            (produccion && url.protocol !== 'https:')
          )
            throw new Error();
          return origen;
        } catch {
          throw new Error(
            'AUTH_ORIGENES debe contener orígenes válidos separados por comas.',
          );
        }
      }),
  );
  const secreto = entorno.AUTH_SECRETO_CSRF;
  const googleClientId = entorno.GOOGLE_CLIENT_ID?.trim() || undefined;
  if (
    googleClientId &&
    !/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)
  ) {
    throw new Error(
      'GOOGLE_CLIENT_ID debe contener un ID de cliente web de Google válido.',
    );
  }
  if (
    secreto !== undefined &&
    (Buffer.byteLength(secreto) < 32 ||
      /REEMPLAZAR|CAMBIAR|EJEMPLO/i.test(secreto))
  ) {
    throw new Error(
      'AUTH_SECRETO_CSRF debe ser un secreto aleatorio de al menos 32 bytes.',
    );
  }
  return {
    origenes,
    secretoCsrf: secreto ? Buffer.from(secreto) : randomBytes(32),
    cookieSesion: produccion ? '__Host-soho_sesion' : 'soho_sesion',
    cookieCsrf: produccion ? '__Host-soho_csrf' : 'soho_csrf',
    cookies: { httpOnly: true, secure: produccion, sameSite: 'lax', path: '/' },
    duracionMs: 12 * 60 * 60 * 1000,
    inactividadMs: 30 * 60 * 1000,
    googleClientId,
    cookieGoogle: produccion ? '__Host-soho_google' : 'soho_google',
  };
}
