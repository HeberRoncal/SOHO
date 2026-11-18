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
import { PublicacionProductoService } from './publicacion-producto.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErroresAuthFilter)
@Controller('api/admin/productos')
export class PublicacionProductoController {
  constructor(
    @Inject(PublicacionProductoService)
    private readonly publicacion: PublicacionProductoService,
  ) {}
  @Post(':id/publicacion')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  publicar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
    @Query() q: unknown,
  ) {
    sinFiltros(q);
    return this.publicacion.publicar(
      idProducto(id).toLowerCase(),
      cuerpo,
      req.autenticacion!,
    );
  }
}
