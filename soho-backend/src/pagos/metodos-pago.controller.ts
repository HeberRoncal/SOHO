import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import {
  Publico,
  LimitarAcceso,
} from '../autenticacion/seguridad/auth.decoradores.js';
import { sinFiltros } from '../productos/dto/consulta-productos.js';
import { InstruccionesPagoService } from './instrucciones-pago.service.js';

@Controller('api/configuracion/pagos')
export class MetodosPagoController {
  constructor(
    @Inject(InstruccionesPagoService)
    private readonly instrucciones: InstruccionesPagoService,
  ) {}
  @Publico()
  @Get()
  @Header('Cache-Control', 'no-store')
  @LimitarAcceso('consultar-pedido')
  consultar(@Query() q: unknown) {
    sinFiltros(q);
    return this.instrucciones.metodos();
  }
}
