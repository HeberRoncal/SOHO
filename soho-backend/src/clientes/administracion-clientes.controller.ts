import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseFilters,
} from '@nestjs/common';
import {
  Roles,
  LimitarAcceso,
} from '../autenticacion/seguridad/auth.decoradores.js';
import { objeto } from '../autenticacion/acceso/datos-auth.js';
import { ConsultaClientesService } from './consulta-clientes.service.js';
import {
  identidadCliente,
  leerClientes,
  leerPaginaClientes,
} from './dto/consulta-clientes.js';
import { ErrorClientesFilter } from './filtros/error-clientes.filter.js';

@Roles('ADMIN')
@LimitarAcceso('consultar-pedido')
@UseFilters(ErrorClientesFilter)
@Controller('api/admin/clientes')
export class AdministracionClientesController {
  constructor(
    @Inject(ConsultaClientesService)
    private readonly clientes: ConsultaClientesService,
  ) {}
  @Get()
  listar(@Query() q: unknown) {
    return this.clientes.listar(leerClientes(q));
  }
  @Get(':identificador')
  detalle(@Param('identificador') id: string, @Query() q: unknown) {
    objeto(q, []);
    return this.clientes.detalle(identidadCliente(id));
  }
  @Get(':identificador/pedidos')
  pedidos(@Param('identificador') id: string, @Query() q: unknown) {
    return this.clientes.pedidos(identidadCliente(id), leerPaginaClientes(q));
  }
  @Get(':identificador/direcciones')
  direcciones(@Param('identificador') id: string, @Query() q: unknown) {
    return this.clientes.direcciones(
      identidadCliente(id),
      leerPaginaClientes(q),
    );
  }
}
