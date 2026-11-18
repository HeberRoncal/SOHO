import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ConfiguracionAuth } from '../seguridad/configuracion-auth.js';

export function generarIdentificador(): string {
  return randomBytes(32).toString('base64url');
}
export function hashIdentificador(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

export function leerCookie(req: Request, nombre: string): string | undefined {
  const valores = (req.headers.cookie ?? '')
    .split(';')
    .map((parte) => parte.trim())
    .filter((parte) => parte.slice(0, parte.indexOf('=')) === nombre);
  if (valores.length !== 1) return undefined;
  const valor = valores[0].slice(nombre.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(valor) ? valor : undefined;
}

export function limpiarCookies(res: Response, config: ConfiguracionAuth): void {
  res.clearCookie(config.cookieSesion, config.cookies);
  res.clearCookie(config.cookieCsrf, config.cookies);
  res.clearCookie(config.cookieGoogle, config.cookies);
}
