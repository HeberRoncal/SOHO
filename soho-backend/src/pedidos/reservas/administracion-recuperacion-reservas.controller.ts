import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  Roles,
  LimitarAcceso,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { RecuperacionReservasService } from './recuperacion-reservas.service.js';
import { DatosRecuperacionReservasPipe } from '../pipes/datos-recuperacion-reservas.pipe.js';
import type { RecuperarReservasDto } from '../dto/recuperar-reservas.dto.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@Controller('api/admin/pedidos')
export class AdministracionRecuperacionReservasController {
  constructor(
    @Inject(RecuperacionReservasService)
    private readonly reservas: RecuperacionReservasService,
  ) {}
  @Get(':codigo/reservas/recuperacion')
  consultar(@Param('codigo') codigo: string, @Req() req: PeticionAuth) {
    return this.reservas.consultar(codigo, req.autenticacion!);
  }
  @Post(':codigo/reservas/recuperacion')
  @HttpCode(200)
  recuperar(
    @Param('codigo') codigo: string,
    @Body(DatosRecuperacionReservasPipe) d: RecuperarReservasDto,
    @Req() req: PeticionAuth,
  ) {
    return this.reservas.recuperar(codigo, d, req.autenticacion!);
  }
}
