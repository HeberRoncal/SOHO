import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import {
  LimitarAcceso,
  Publico,
} from '../autenticacion/seguridad/auth.decoradores.js';
import { sinFiltros } from '../productos/dto/consulta-productos.js';
import { ConfiguracionTiendaService } from './configuracion-tienda.service.js';

@Controller('api/configuracion/tienda')
export class ContactoTiendaController {
  constructor(
    @Inject(ConfiguracionTiendaService)
    private readonly tienda: ConfiguracionTiendaService,
  ) {}

  @Get()
  @Publico()
  @Header('Cache-Control', 'no-store')
  @LimitarAcceso('consultar-pedido')
  consultar(@Query() consulta: unknown) {
    sinFiltros(consulta);
    return this.tienda.consultarContacto();
  }
}
