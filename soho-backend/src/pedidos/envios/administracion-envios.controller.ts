import {
  Body,
  Controller,
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
import type { CambioEntregaDto } from '../dto/cambio-entrega.dto.js';
import { DatosEnvioPipe } from '../pipes/datos-envio.pipe.js';
import { EnviosPedidosService } from './envios-pedidos.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@Controller('api/admin/pedidos')
export class AdministracionEnviosController {
  constructor(
    @Inject(EnviosPedidosService) private readonly envios: EnviosPedidosService,
  ) {}

  @Post(':codigo/preparacion')
  @HttpCode(200)
  preparar(
    @Param('codigo') codigo: string,
    @Body(new DatosEnvioPipe('PREPARAR')) d: CambioEntregaDto,
    @Req() req: PeticionAuth,
  ) {
    return this.envios.cambiar(codigo, 'PREPARAR', d, req.autenticacion!);
  }

  @Post(':codigo/envio')
  @HttpCode(200)
  enviar(
    @Param('codigo') codigo: string,
    @Body(new DatosEnvioPipe('ENVIAR')) d: CambioEntregaDto,
    @Req() req: PeticionAuth,
  ) {
    return this.envios.cambiar(codigo, 'ENVIAR', d, req.autenticacion!);
  }

  @Post(':codigo/entrega')
  @HttpCode(200)
  entregar(
    @Param('codigo') codigo: string,
    @Body(new DatosEnvioPipe('ENTREGAR')) d: CambioEntregaDto,
    @Req() req: PeticionAuth,
  ) {
    return this.envios.cambiar(codigo, 'ENTREGAR', d, req.autenticacion!);
  }
}
