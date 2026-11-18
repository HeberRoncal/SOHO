import { Module } from '@nestjs/common';
import { CoberturaController } from './cobertura.controller.js';
import { AdministracionController } from './administracion.controller.js';
import { CoberturaService } from './cobertura.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CoberturaController, AdministracionController],
  providers: [CoberturaService],
})
export class CoberturaModule {}
