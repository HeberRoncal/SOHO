import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  Roles,
  UsuarioActual,
} from '../autenticacion/seguridad/auth.decoradores.js';
import type { UsuarioAutenticado } from '../autenticacion/sesiones/contexto-auth.js';
import { RolUsuario } from '../generated/prisma/client.js';
import { DireccionesService } from './direcciones.service.js';
import type { CrearDireccionDto } from './dto/crear-direccion.dto.js';
import type { ActualizarDireccionDto } from './dto/actualizar-direccion.dto.js';
import { DatosDireccionPipe } from './pipes/datos-direccion.pipe.js';
import { IdDireccionPipe } from './pipes/id-direccion.pipe.js';

@Roles(RolUsuario.ADMIN, RolUsuario.CLIENTE)
@Controller('api/direcciones')
export class DireccionesController {
  constructor(
    @Inject(DireccionesService)
    private readonly direcciones: DireccionesService,
  ) {}

  @Post()
  crear(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body(new DatosDireccionPipe()) datos: CrearDireccionDto,
  ) {
    return this.direcciones.crear(usuario.id, datos);
  }

  @Get()
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.direcciones.listar(usuario.id);
  }

  @Get(':id')
  obtener(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', IdDireccionPipe) id: string,
  ) {
    return this.direcciones.obtener(usuario.id, id);
  }

  @Patch(':id')
  actualizar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', IdDireccionPipe) id: string,
    @Body(new DatosDireccionPipe('actualizar')) datos: ActualizarDireccionDto,
  ) {
    return this.direcciones.actualizar(usuario.id, id, datos);
  }

  @Patch(':id/predeterminada')
  predeterminar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', IdDireccionPipe) id: string,
    @Body(new DatosDireccionPipe('predeterminar')) _datos: object,
  ) {
    return this.direcciones.actualizar(usuario.id, id, {
      predeterminada: true,
    });
  }

  @Delete(':id')
  eliminar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', IdDireccionPipe) id: string,
  ) {
    return this.direcciones.eliminar(usuario.id, id);
  }
}
