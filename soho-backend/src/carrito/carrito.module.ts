import { Module } from '@nestjs/common';
import { CarritoController } from './carrito.controller.js';
import { CarritoService } from './carrito.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CarritoController],
  providers: [CarritoService],
})
export class CarritoModule {}
