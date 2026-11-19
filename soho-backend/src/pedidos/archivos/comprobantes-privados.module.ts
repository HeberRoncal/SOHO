import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../archivos/cloudinary.module.js';
import { PreparacionPedidoModule } from '../preparacion/preparacion-pedido.module.js';
import { ComprobantesPrivadosService } from './comprobantes-privados.service.js';

@Module({
  imports: [CloudinaryModule, PreparacionPedidoModule],
  providers: [ComprobantesPrivadosService],
  exports: [ComprobantesPrivadosService],
})
export class ComprobantesPrivadosModule {}
