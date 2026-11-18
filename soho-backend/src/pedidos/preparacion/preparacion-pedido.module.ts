import { Module } from '@nestjs/common';
import { PreparacionPedidoService } from './preparacion-pedido.service.js';
import { ConfiguracionCheckoutPagos } from './configuracion-checkout-pagos.js';
import { ConfiguracionPedidos } from '../configuracion-pedidos.js';
import { RegistroPedidoService } from './registro-pedido.service.js';

@Module({
  providers: [
    PreparacionPedidoService,
    RegistroPedidoService,
    {
      provide: ConfiguracionCheckoutPagos,
      useFactory: () => new ConfiguracionCheckoutPagos(),
    },
    {
      provide: ConfiguracionPedidos,
      useFactory: () => new ConfiguracionPedidos(),
    },
  ],
  exports: [
    RegistroPedidoService,
    PreparacionPedidoService,
    ConfiguracionCheckoutPagos,
    ConfiguracionPedidos,
  ],
})
export class PreparacionPedidoModule {}
