import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { ConfiguracionTiendaService } from './configuracion-tienda.service.js';
import { AdministracionTiendaController } from './administracion-tienda.controller.js';
import { ContactoTiendaController } from './contacto-tienda.controller.js';
// Contactos y políticas tienen versiones independientes de Pagos.
@Module({
  imports: [PrismaModule, AutenticacionModule],
  providers: [ConfiguracionTiendaService],
  controllers: [AdministracionTiendaController, ContactoTiendaController],
})
export class ConfiguracionTiendaModule {}
