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
  UseFilters,
} from '@nestjs/common';
import {
  Roles,
  LimitarAcceso,
} from '../autenticacion/seguridad/auth.decoradores.js';
import type { PeticionAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { ErrorCatalogoFilter } from '../catalogo/filtros/error-catalogo.filter.js';
import { idProducto, sinFiltros } from '../productos/dto/consulta-productos.js';
import { ConsultaVariantes } from './dto/consulta-variantes.js';
import { ConsultaInventarioService } from './consulta-inventario.service.js';
import { MovimientosInventarioService } from './movimientos-inventario.service.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErrorCatalogoFilter)
@Controller('api/admin/inventario')
export class AdministracionInventarioController {
  constructor(
    @Inject(ConsultaInventarioService)
    private readonly consulta: ConsultaInventarioService,
    @Inject(MovimientosInventarioService)
    private readonly movimientos: MovimientosInventarioService,
  ) {}
  @Get('variantes')
  @Header('Cache-Control', 'no-store')
  listar(@Query() q: unknown, @Req() req: PeticionAuth) {
    return this.consulta.listar(ConsultaVariantes.leer(q), req.autenticacion!);
  }
  @Get('variantes/:id')
  @Header('Cache-Control', 'no-store')
  detalle(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() req: PeticionAuth,
  ) {
    sinFiltros(q);
    return this.consulta.detalle(
      idProducto(id).toLowerCase(),
      req.autenticacion!,
    );
  }
  @Post('variantes/:id/movimientos')
  @Header('Cache-Control', 'no-store')
  registrar(
    @Param('id') id: string,
    @Query() q: unknown,
    @Body() cuerpo: unknown,
    @Req() req: PeticionAuth,
  ) {
    sinFiltros(q);
    return this.movimientos.registrar(
      idProducto(id).toLowerCase(),
      cuerpo,
      req.autenticacion!,
    );
  }
  @Get('movimientos/operaciones/:clave')
  @Header('Cache-Control', 'no-store')
  operacion(
    @Param('clave') clave: string,
    @Query() q: unknown,
    @Req() req: PeticionAuth,
  ) {
    sinFiltros(q);
    return this.movimientos.operacion(
      idProducto(clave).toLowerCase(),
      req.autenticacion!,
    );
  }
}
