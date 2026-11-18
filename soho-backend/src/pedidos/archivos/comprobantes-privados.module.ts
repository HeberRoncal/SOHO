import { Module } from '@nestjs/common';
import { PreparacionPedidoModule } from '../preparacion/preparacion-pedido.module.js';
import { ComprobantesPrivadosService } from './comprobantes-privados.service.js';

@Module({
  imports: [PreparacionPedidoModule],
  providers: [ComprobantesPrivadosService],
  exports: [ComprobantesPrivadosService],
})
export class ComprobantesPrivadosModule {}
