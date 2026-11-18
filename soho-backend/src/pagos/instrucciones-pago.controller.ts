import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Publico,
  LimitarAcceso,
} from '../autenticacion/seguridad/auth.decoradores.js';
import {
  SesionPedidoGuard,
  type PeticionPedido,
} from '../pedidos/seguridad/sesion-pedido.guard.js';
import { sinFiltros } from '../productos/dto/consulta-productos.js';
import { InstruccionesPagoService } from './instrucciones-pago.service.js';

@Publico()
@UseGuards(SesionPedidoGuard)
@Controller('api/pagos/instrucciones')
export class InstruccionesPagoController {
  constructor(
    @Inject(InstruccionesPagoService)
    private readonly instrucciones: InstruccionesPagoService,
  ) {}
  @Post()
  @Header('Cache-Control', 'no-store')
  @LimitarAcceso('crear-pedido')
  async emitir(
    @Body() cuerpo: unknown,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    sinFiltros(q);
    const r = await this.instrucciones.emitir(cuerpo, req.identidadPedido);
    res.status(r.reutilizada ? 200 : 201);
    return r.respuesta;
  }
  @Get('operaciones/:clave')
  @Header('Cache-Control', 'no-store')
  @LimitarAcceso('consultar-pedido')
  porClave(
    @Param('clave') clave: string,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.instrucciones.porClave(clave, req.identidadPedido);
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @LimitarAcceso('consultar-pedido')
  porId(
    @Param('id') id: string,
    @Req() req: PeticionPedido,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.instrucciones.porId(id, req.identidadPedido);
  }
}
