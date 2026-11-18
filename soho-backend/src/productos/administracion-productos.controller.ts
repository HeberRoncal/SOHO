import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  UseFilters,
} from '@nestjs/common';
import {
  Roles,
  LimitarAcceso,
} from '../autenticacion/seguridad/auth.decoradores.js';
import { ErrorCatalogoFilter } from '../catalogo/filtros/error-catalogo.filter.js';
import { ConsultaProductosService } from './consulta-productos.service.js';
import {
  idProducto,
  leerMovimientos,
  leerProductos,
  sinFiltros,
} from './dto/consulta-productos.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErrorCatalogoFilter)
@Controller('api/admin')
export class AdministracionProductosController {
  constructor(
    @Inject(ConsultaProductosService)
    private readonly productos: ConsultaProductosService,
  ) {}
  @Get('productos')
  @Header('Cache-Control', 'no-store')
  listar(@Query() q: unknown) {
    return this.productos.listar(leerProductos(q));
  }
  @Get('productos/opciones')
  @Header('Cache-Control', 'no-store')
  opciones(@Query() q: unknown) {
    sinFiltros(q);
    return this.productos.opciones();
  }
  @Get('productos/:id')
  @Header('Cache-Control', 'no-store')
  detalle(@Param('id') id: string, @Query() q: unknown) {
    sinFiltros(q);
    return this.productos.detalle(idProducto(id));
  }
  @Get('inventario/movimientos')
  @Header('Cache-Control', 'no-store')
  movimientos(@Query() q: unknown) {
    return this.productos.movimientos(leerMovimientos(q));
  }
  @Get('inventario/resumen')
  @Header('Cache-Control', 'no-store')
  resumen(@Query() q: unknown) {
    sinFiltros(q);
    return this.productos.resumen();
  }
}
