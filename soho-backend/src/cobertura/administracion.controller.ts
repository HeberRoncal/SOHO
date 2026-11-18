import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { Roles } from '../autenticacion/seguridad/auth.decoradores.js';
import { RolUsuario } from '../generated/prisma/client.js';
import { CoberturaService } from './cobertura.service.js';
import type { ActualizarCoberturaDto } from './dto/actualizar-cobertura.dto.js';
import { DatosCoberturaPipe } from './pipes/datos-cobertura.pipe.js';

@Roles(RolUsuario.ADMIN)
@Controller('api/admin/cobertura')
export class AdministracionController {
  constructor(
    @Inject(CoberturaService) private readonly cobertura: CoberturaService,
  ) {}

  @Get()
  consultar() {
    return this.cobertura.consultarAdministracion();
  }

  @Patch()
  actualizar(@Body(DatosCoberturaPipe) datos: ActualizarCoberturaDto) {
    return this.cobertura.actualizar(datos);
  }
}
