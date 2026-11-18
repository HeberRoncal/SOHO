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
import type { CancelarPedidoDto } from '../dto/cancelar-pedido.dto.js';
import type { LiberarReservasCancelacionDto } from '../dto/liberar-reservas-cancelacion.dto.js';
import { DatosCancelacionPipe } from '../pipes/datos-cancelacion.pipe.js';
import { CancelacionesPedidosService } from './cancelaciones-pedidos.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@Controller('api/admin/pedidos')
export class AdministracionCancelacionesController {
  constructor(
    @Inject(CancelacionesPedidosService)
    private readonly cancelaciones: CancelacionesPedidosService,
  ) {}

  @Post(':codigo/cancelacion')
  @HttpCode(200)
  cancelar(
    @Param('codigo') codigo: string,
    @Body(new DatosCancelacionPipe('CANCELAR')) d: CancelarPedidoDto,
    @Req() req: PeticionAuth,
  ) {
    return this.cancelaciones.cancelar(codigo, d, req.autenticacion!);
  }

  @Post(':codigo/cancelacion/liberar-reservas')
  @HttpCode(200)
  liberar(
    @Param('codigo') codigo: string,
    @Body(new DatosCancelacionPipe('LIBERAR')) d: LiberarReservasCancelacionDto,
    @Req() req: PeticionAuth,
  ) {
    return this.cancelaciones.liberar(codigo, d, req.autenticacion!);
  }
}
