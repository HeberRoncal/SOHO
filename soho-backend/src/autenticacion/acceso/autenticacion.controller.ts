import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AutenticacionService } from './autenticacion.service.js';
import {
  LimitarAcceso,
  Publico,
  Roles,
  UsuarioActual,
} from '../seguridad/auth.decoradores.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../seguridad/configuracion-auth.js';
import { leerCookie, limpiarCookies } from '../sesiones/cookies-auth.js';
import { CsrfService } from '../seguridad/csrf.service.js';
import { leerLogin, leerPerfil, leerRegistro } from './datos-auth.js';
import { SesionesService } from '../sesiones/sesiones.service.js';
import type {
  PeticionAuth,
  UsuarioAutenticado,
} from '../sesiones/contexto-auth.js';
import { RolUsuario } from '../../generated/prisma/client.js';
import { responderConSesion } from '../sesiones/respuesta-auth.js';
import { DesafiosGoogleService } from '../google/desafios-google.service.js';
import { VerificacionService } from '../verificacion/verificacion.service.js';

@Controller('api/auth')
export class AutenticacionController {
  constructor(
    @Inject(AutenticacionService) private readonly auth: AutenticacionService,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(CsrfService) private readonly csrf: CsrfService,
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
    @Inject(DesafiosGoogleService)
    private readonly desafiosGoogle: DesafiosGoogleService,
    @Inject(VerificacionService)
    private readonly verificacion: VerificacionService,
  ) {}

  @Publico()
  @LimitarAcceso('csrf')
  @Get('csrf')
  obtenerCsrf(
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    return { csrfToken: this.csrf.emitir(req, res) };
  }

  @Publico()
  @LimitarAcceso('registro')
  @Post('registro')
  async registrar(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resultado = await this.auth.registrar(
      leerRegistro(cuerpo),
      leerCookie(req, this.config.cookieSesion),
    );
    this.verificacion.solicitarAutomatica(resultado.usuario.id);
    return this.iniciarSesion(resultado, req, res);
  }

  @Publico()
  @LimitarAcceso('login')
  @HttpCode(200)
  @Post('login')
  async acceder(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resultado = await this.auth.acceder(
      leerLogin(cuerpo),
      leerCookie(req, this.config.cookieSesion),
    );
    return this.iniciarSesion(resultado, req, res);
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.CLIENTE)
  @Get('me')
  actual(@UsuarioActual() usuario: UsuarioAutenticado) {
    return { usuario };
  }

  @Roles(RolUsuario.ADMIN, RolUsuario.CLIENTE)
  @Patch('me')
  async actualizarPerfil(
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return {
      usuario: await this.auth.actualizarPerfil(usuario.id, leerPerfil(cuerpo)),
    };
  }

  @HttpCode(204)
  @Post('logout')
  async salir(
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sesiones.revocar(req.autenticacion!.sesionId);
    this.desafiosGoogle.invalidar(req, res);
    limpiarCookies(res, this.config);
  }

  private iniciarSesion(
    resultado: { usuario: UsuarioAutenticado; token: string; expiraEn: Date },
    req: PeticionAuth,
    res: Response,
  ) {
    return responderConSesion(resultado, req, res, this.config, this.csrf);
  }
}
