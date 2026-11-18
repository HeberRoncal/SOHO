import type { Response } from 'express';
import type { ConfiguracionAuth } from '../seguridad/configuracion-auth.js';
import type { PeticionAuth, UsuarioAutenticado } from './contexto-auth.js';
import type { CsrfService } from '../seguridad/csrf.service.js';

export function responderConSesion(
  resultado: { usuario: UsuarioAutenticado; token: string; expiraEn: Date },
  req: PeticionAuth,
  res: Response,
  config: ConfiguracionAuth,
  csrf: CsrfService,
) {
  res.cookie(config.cookieSesion, resultado.token, {
    ...config.cookies,
    expires: resultado.expiraEn,
  });
  return {
    usuario: resultado.usuario,
    csrfToken: csrf.emitir(req, res, resultado.token),
  };
}
