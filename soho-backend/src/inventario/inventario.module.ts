import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { AdministracionInventarioController } from './administracion-inventario.controller.js';
import { MovimientosInventarioService } from './movimientos-inventario.service.js';
import { ConsultaInventarioService } from './consulta-inventario.service.js';
import { InventarioReservadoService } from './reservas/inventario-reservado.service.js';
@Module({
  imports: [PrismaModule, AutenticacionModule],
  controllers: [AdministracionInventarioController],
  providers: [
    MovimientosInventarioService,
    ConsultaInventarioService,
    InventarioReservadoService,
  ],
  exports: [InventarioReservadoService],
})
export class InventarioModule {}
