import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  Roles,
  LimitarAcceso,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { PagosPedidosService } from './pagos-pedidos.service.js';
import { DatosPagoPipe } from '../pipes/datos-pago.pipe.js';
import type { DecisionPagoDto } from '../dto/decision-pago.dto.js';

@Roles('ADMIN')
@Controller('api/admin')
@LimitarAcceso('consultar-pedido')
export class AdministracionPagosController {
  constructor(
    @Inject(PagosPedidosService) private readonly pagos: PagosPedidosService,
  ) {}
  @Get('pagos')
  listar(@Query() q: unknown) {
    return this.pagos.listar(
      objeto(q, ['estado', 'metodo', 'busqueda', 'pagina', 'limite']),
    );
  }
  @Get('pedidos')
  pedidos(@Query() q: unknown) {
    return this.pagos.listar(
      objeto(q, [
        'estado',
        'metodo',
        'busqueda',
        'pagina',
        'limite',
        'entrega',
        'cliente',
        'desde',
        'hasta',
        'orden',
        'reserva',
      ]),
    );
  }
  @Get('resumen-pedidos')
  resumen(@Query() q: unknown) {
    const d = objeto(q, ['desde', 'hasta']);
    return this.pagos.resumen(d.desde as string, d.hasta as string);
  }
  @Get('pedidos/:codigo')
  pedido(@Param('codigo') codigo: string) {
    return this.pagos.detalle(codigo);
  }
  @Get('pagos/:codigo')
  detalle(@Param('codigo') codigo: string) {
    return this.pagos.detalle(codigo);
  }
  @Post('pagos/:codigo/decision')
  decidir(
    @Param('codigo') codigo: string,
    @Body(DatosPagoPipe) d: DecisionPagoDto,
    @Req() req: PeticionAuth,
  ) {
    return this.pagos.decidir(codigo, d, req.autenticacion!);
  }
}
