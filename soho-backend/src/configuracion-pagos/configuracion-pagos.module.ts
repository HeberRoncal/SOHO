import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { CloudinaryModule } from '../archivos/cloudinary.module.js';
import { AdministracionPagosController } from './administracion-pagos.controller.js';
import { ConfiguracionPagosService } from './configuracion-pagos.service.js';
import { PrepararQrService } from './qr/preparar-qr.service.js';
import { ArchivosQrService } from './qr/archivos-qr.service.js';
import { MantenimientoQrService } from './qr/mantenimiento-qr.service.js';
import { ProcesadorQrService } from './qr/procesador-qr.service.js';

@Module({
  imports: [PrismaModule, AutenticacionModule, CloudinaryModule],
  controllers: [AdministracionPagosController],
  providers: [
    ConfiguracionPagosService,
    PrepararQrService,
    ArchivosQrService,
    MantenimientoQrService,
    ProcesadorQrService,
  ],
  exports: [ConfiguracionPagosService],
})
export class ConfiguracionPagosModule {}
