import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import {
  LimitarAcceso,
  Roles,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import type { ActualizarConfiguracionReservasDto } from '../dto/actualizar-configuracion-reservas.dto.js';
import { DatosConfiguracionReservasPipe } from '../pipes/datos-configuracion-reservas.pipe.js';
import { ConfiguracionReservasService } from './configuracion-reservas.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@Controller('api/admin/configuracion/reservas')
export class AdministracionConfiguracionReservasController {
  constructor(
    @Inject(ConfiguracionReservasService)
    private readonly reservas: ConfiguracionReservasService,
  ) {}

  @Get()
  consultar(@Req() req: PeticionAuth) {
    return this.reservas.consultar(req.autenticacion!);
  }

  @Patch()
  actualizar(
    @Body(DatosConfiguracionReservasPipe)
    datos: ActualizarConfiguracionReservasDto,
    @Req() req: PeticionAuth,
  ) {
    return this.reservas.actualizar(datos, req.autenticacion!);
  }
}
