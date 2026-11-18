import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  Roles,
  UsuarioActual,
} from '../autenticacion/seguridad/auth.decoradores.js';
import type { UsuarioAutenticado } from '../autenticacion/sesiones/contexto-auth.js';
import { RolUsuario } from '../generated/prisma/client.js';
import { CarritoService } from './carrito.service.js';
import { DatosCarritoPipe } from './pipes/datos-carrito/datos-carrito.pipe.js';
import type { OperacionCarritoDto } from './dto/operacion-carrito.dto/operacion-carrito.dto.js';

@Roles(RolUsuario.ADMIN, RolUsuario.CLIENTE)
@Controller('api/carrito')
export class CarritoController {
  constructor(
    @Inject(CarritoService) private readonly carrito: CarritoService,
  ) {}
  @Get()
  obtener(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.carrito.obtener(usuario.id);
  }
  @Put()
  guardar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body(DatosCarritoPipe) datos: OperacionCarritoDto,
  ) {
    return this.carrito.guardar(usuario.id, datos);
  }
}
