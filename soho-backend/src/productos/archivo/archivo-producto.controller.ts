import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
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
import { ErroresAuthFilter } from '../../autenticacion/seguridad/errores-auth.filter.js';
import { idProducto, sinFiltros } from '../dto/consulta-productos.js';
import { ArchivoProductoService } from './archivo-producto.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErroresAuthFilter)
@Controller('api/admin/productos')
export class ArchivoProductoController {
  constructor(
    @Inject(ArchivoProductoService)
    private readonly archivo: ArchivoProductoService,
  ) {}

  @Post(':id/archivo')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  archivar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.archivo.archivar(
      idProducto(id).toLowerCase(),
      cuerpo,
      req.autenticacion!,
    );
  }

  @Post(':id/restauracion')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  restaurar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.archivo.restaurar(
      idProducto(id).toLowerCase(),
      cuerpo,
      req.autenticacion!,
    );
  }
}
