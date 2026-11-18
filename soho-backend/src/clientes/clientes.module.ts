import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { AdministracionClientesController } from './administracion-clientes.controller.js';
import { ConsultaClientesService } from './consulta-clientes.service.js';

@Module({
  imports: [PrismaModule, AutenticacionModule],
  controllers: [AdministracionClientesController],
  providers: [ConsultaClientesService],
})
export class ClientesModule {}
