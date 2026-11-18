import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import {
  Roles,
  LimitarAcceso,
} from '../autenticacion/seguridad/auth.decoradores.js';
import { ErroresAuthFilter } from '../autenticacion/seguridad/errores-auth.filter.js';
import type { PeticionAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { sinFiltros } from '../productos/dto/consulta-productos.js';
import { ConfiguracionTiendaService } from './configuracion-tienda.service.js';
@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErroresAuthFilter)
@Controller('api/admin/configuracion/tienda')
export class AdministracionTiendaController {
  constructor(
    @Inject(ConfiguracionTiendaService)
    private readonly tienda: ConfiguracionTiendaService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  consultar(@Req() req: PeticionAuth, @Query() q: unknown) {
    sinFiltros(q);
    return this.tienda.consultar(req.autenticacion!);
  }
  @Patch()
  @Header('Cache-Control', 'no-store')
  guardar(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.tienda.actualizar(cuerpo, req.autenticacion!);
  }
  @Get('operaciones/:clave')
  @Header('Cache-Control', 'no-store')
  recuperar(
    @Param('clave') clave: string,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.tienda.recuperar(clave, req.autenticacion!);
  }
}
