import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { LimitarAcceso, Publico } from '../seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../sesiones/contexto-auth.js';
import { objeto } from '../acceso/datos-auth.js';
import { leerVerificacion } from './datos-verificacion.js';
import { VerificacionService } from './verificacion.service.js';

@Controller('api/auth/verificacion')
export class VerificacionController {
  constructor(
    @Inject(VerificacionService)
    private readonly verificacion: VerificacionService,
  ) {}
  @LimitarAcceso('reenviar-verificacion')
  @HttpCode(202)
  @Post('reenviar')
  reenviar(@Body() cuerpo: unknown, @Req() req: PeticionAuth) {
    objeto(cuerpo, []);
    this.verificacion.solicitar(req.autenticacion!.usuario.id);
    return {
      mensaje:
        'Si tu correo aún está pendiente, recibirás un enlace para verificarlo.',
    };
  }
  @Publico()
  @LimitarAcceso('comprobar-verificacion')
  @HttpCode(200)
  @Post('comprobar')
  comprobar(@Body() cuerpo: unknown) {
    return this.verificacion.comprobar(leerVerificacion(cuerpo).token);
  }
  @Publico()
  @LimitarAcceso('confirmar-verificacion')
  @HttpCode(200)
  @Post('confirmar')
  async confirmar(@Body() cuerpo: unknown) {
    await this.verificacion.confirmar(leerVerificacion(cuerpo).token);
    return { mensaje: 'Tu correo se verificó correctamente.' };
  }
}
