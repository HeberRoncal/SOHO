import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Publico, LimitarAcceso } from '../seguridad/auth.decoradores.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../seguridad/configuracion-auth.js';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';
import { leerCookie } from '../sesiones/cookies-auth.js';
import { CsrfService } from '../seguridad/csrf.service.js';
import { objeto } from '../acceso/datos-auth.js';
import { responderConSesion } from '../sesiones/respuesta-auth.js';
import { DesafiosGoogleService } from './desafios-google.service.js';
import { leerGoogle, leerVinculacionGoogle } from './datos-google.js';
import { GoogleService } from './google.service.js';
import { VerificadorGoogleService } from './verificador-google.service.js';

@Controller('api/auth/google')
export class GoogleController {
  constructor(
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
    @Inject(DesafiosGoogleService)
    private readonly desafios: DesafiosGoogleService,
    @Inject(VerificadorGoogleService)
    private readonly verificador: VerificadorGoogleService,
    @Inject(GoogleService) private readonly google: GoogleService,
    @Inject(CsrfService) private readonly csrf: CsrfService,
  ) {}

  @Publico()
  @Get('configuracion')
  configuracion() {
    return {
      habilitado: !!this.config.googleClientId,
      clientId: this.config.googleClientId ?? null,
    };
  }

  @Publico()
  @LimitarAcceso('google')
  @HttpCode(200)
  @Post('desafio')
  desafio(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    objeto(cuerpo, []);
    return this.desafios.emitir(req, res, 'acceso');
  }

  @Get('vinculacion')
  estado(@Req() req: PeticionAuth) {
    return this.google.estado(req.autenticacion!.usuario.id);
  }

  @LimitarAcceso('google')
  @HttpCode(200)
  @Post('vinculacion/desafio')
  desafioVinculacion(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    objeto(cuerpo, []);
    return this.desafios.emitir(req, res, 'vinculacion');
  }

  @Publico()
  @LimitarAcceso('google')
  @HttpCode(200)
  @Post()
  async acceder(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    const datos = leerGoogle(cuerpo);
    const reserva = this.desafios.reservar(req, 'acceso');
    let preservar = false;
    try {
      const identidad = await this.verificador.verificar(
        datos.credential,
        reserva.nonce,
      );
      const resultado = await this.google.acceder(
        identidad,
        datos.perfil,
        leerCookie(req, this.config.cookieSesion),
      );
      return responderConSesion(resultado, req, res, this.config, this.csrf);
    } catch (error) {
      preservar = error instanceof HttpException && error.getStatus() === 422;
      throw error;
    } finally {
      reserva.finalizar(preservar);
      if (!preservar)
        res.clearCookie(this.config.cookieGoogle, this.config.cookies);
    }
  }

  @LimitarAcceso('google')
  @HttpCode(200)
  @Post('vinculacion')
  async vincular(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    const datos = leerVinculacionGoogle(cuerpo);
    const reserva = this.desafios.reservar(req, 'vinculacion');
    try {
      const identidad = await this.verificador.verificar(
        datos.credential,
        reserva.nonce,
      );
      const resultado = await this.google.vincular(
        identidad,
        req.autenticacion!.usuario.id,
        datos.clave,
        leerCookie(req, this.config.cookieSesion),
      );
      return responderConSesion(resultado, req, res, this.config, this.csrf);
    } finally {
      reserva.finalizar();
      res.clearCookie(this.config.cookieGoogle, this.config.cookies);
    }
  }
}
