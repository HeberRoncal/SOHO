import {
  Body,
  Controller,
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
} from '../../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import { ErroresAuthFilter } from '../../autenticacion/seguridad/errores-auth.filter.js';
import { idProducto, sinFiltros } from '../dto/consulta-productos.js';
import { PublicadosProductoService } from './publicados-producto.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErroresAuthFilter)
@Controller('api/admin/productos')
export class PublicadosProductoController {
  constructor(
    @Inject(PublicadosProductoService)
    private readonly publicados: PublicadosProductoService,
  ) {}

  @Patch(':id/publicado')
  @Header('Cache-Control', 'no-store')
  actualizar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.publicados.actualizar(
      idProducto(id).toLowerCase(),
      cuerpo,
      req.autenticacion!,
    );
  }
}
