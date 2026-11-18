import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import {
  Roles,
  LimitarAcceso,
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ErrorCatalogoFilter } from '../../catalogo/filtros/error-catalogo.filter.js';
import { idProducto, sinFiltros } from '../dto/consulta-productos.js';
import { BorradoresProductoService } from './borradores-producto.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErrorCatalogoFilter)
@Controller('api/admin/productos')
export class BorradoresProductoController {
  constructor(
    @Inject(BorradoresProductoService)
    private readonly borradores: BorradoresProductoService,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  crear(
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.borradores.crear(cuerpo, req.autenticacion!);
  }
  @Patch(':id/borrador')
  @Header('Cache-Control', 'no-store')
  actualizar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.borradores.actualizar(
      idProducto(id).toLowerCase(),
      cuerpo,
      req.autenticacion!,
    );
  }
  @Get('operaciones/:clave')
  @Header('Cache-Control', 'no-store')
  operacion(
    @Param('clave') clave: string,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.borradores.consultarOperacion(
      idProducto(clave).toLowerCase(),
      req.autenticacion!,
    );
  }
}
