import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { LimitarAcceso, Publico } from '../seguridad/auth.decoradores.js';
import {
  CONFIGURACION_AUTH,
  type ConfiguracionAuth,
} from '../seguridad/configuracion-auth.js';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';
import { limpiarCookies } from '../sesiones/cookies-auth.js';
import { DesafiosGoogleService } from '../google/desafios-google.service.js';
import {
  leerRestablecimiento,
  leerSolicitudRecuperacion,
  leerTokenRecuperacion,
} from './datos-recuperacion.js';
import { RecuperacionService } from './recuperacion.service.js';

@Controller('api/auth/recuperacion')
export class RecuperacionController {
  constructor(
    @Inject(RecuperacionService)
    private readonly recuperacion: RecuperacionService,
    @Inject(CONFIGURACION_AUTH) private readonly config: ConfiguracionAuth,
    @Inject(DesafiosGoogleService)
    private readonly desafiosGoogle: DesafiosGoogleService,
  ) {}
  @Publico()
  @LimitarAcceso('recuperacion')
  @HttpCode(202)
  @Post()
  solicitar(@Body() cuerpo: unknown) {
    this.recuperacion.solicitar(leerSolicitudRecuperacion(cuerpo).correo);
    return {
      mensaje:
        'Si existe una cuenta con contraseña para ese correo, recibirás instrucciones para restablecerla.',
    };
  }
  @Publico()
  @LimitarAcceso('comprobar-recuperacion')
  @HttpCode(200)
  @Post('comprobar')
  comprobar(@Body() cuerpo: unknown) {
    return this.recuperacion.comprobar(leerTokenRecuperacion(cuerpo).token);
  }
  @Publico()
  @LimitarAcceso('restablecer')
  @HttpCode(200)
  @Post('restablecer')
  async restablecer(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Res({ passthrough: true }) res: Response,
  ) {
    const datos = leerRestablecimiento(cuerpo);
    await this.recuperacion.restablecer(datos.token, datos.clave);
    this.desafiosGoogle.invalidar(req, res);
    limpiarCookies(res, this.config);
    return {
      mensaje:
        'Tu contraseña se actualizó. Inicia sesión con la nueva contraseña.',
    };
  }
}
