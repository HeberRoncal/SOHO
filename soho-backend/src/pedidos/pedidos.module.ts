import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { PedidosService } from './pedidos.service.js';
import { PedidosController } from './pedidos.controller.js';
import { ComprobantesPrivadosModule } from './archivos/comprobantes-privados.module.js';
import { PreparacionPedidoModule } from './preparacion/preparacion-pedido.module.js';
import { DatosPedidoPipe } from './pipes/datos-pedido.pipe.js';
import { SesionPedidoGuard } from './seguridad/sesion-pedido.guard.js';
import { CuerpoPedidoMiddleware } from './http/cuerpo-pedido.middleware.js';
import { PagosPedidosService } from './pagos/pagos-pedidos.service.js';
import { AdministracionPagosController } from './pagos/administracion-pagos.controller.js';
import { DatosPagoPipe } from './pipes/datos-pago.pipe.js';
import { EscrituraPedidoService } from './seguridad/escritura-pedido.service.js';
import { EnviosPedidosService } from './envios/envios-pedidos.service.js';
import { AdministracionEnviosController } from './envios/administracion-envios.controller.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { CancelacionesPedidosService } from './cancelaciones/cancelaciones-pedidos.service.js';
import { AdministracionCancelacionesController } from './cancelaciones/administracion-cancelaciones.controller.js';
import { ConfiguracionReservasService } from './reservas/configuracion-reservas.service.js';
import { AdministracionConfiguracionReservasController } from './reservas/administracion-configuracion-reservas.controller.js';
import { DatosConfiguracionReservasPipe } from './pipes/datos-configuracion-reservas.pipe.js';
import { DatosRecuperacionReservasPipe } from './pipes/datos-recuperacion-reservas.pipe.js';
import { VencimientosReservasService } from './reservas/vencimientos-reservas.service.js';
import { ProcesadorVencimientosService } from './reservas/procesador-vencimientos.service.js';
import { RecuperacionReservasService } from './reservas/recuperacion-reservas.service.js';
import { AdministracionRecuperacionReservasController } from './reservas/administracion-recuperacion-reservas.controller.js';

@Module({
  imports: [
    PrismaModule,
    AutenticacionModule,
    InventarioModule,
    PreparacionPedidoModule,
    ComprobantesPrivadosModule,
  ],
  controllers: [
    PedidosController,
    AdministracionPagosController,
    AdministracionEnviosController,
    AdministracionCancelacionesController,
    AdministracionConfiguracionReservasController,
    AdministracionRecuperacionReservasController,
  ],
  providers: [
    PedidosService,
    DatosPedidoPipe,
    DatosPagoPipe,
    DatosConfiguracionReservasPipe,
    DatosRecuperacionReservasPipe,
    SesionPedidoGuard,
    PagosPedidosService,
    EscrituraPedidoService,
    EnviosPedidosService,
    CancelacionesPedidosService,
    ConfiguracionReservasService,
    VencimientosReservasService,
    ProcesadorVencimientosService,
    RecuperacionReservasService,
  ],
})
export class PedidosModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CuerpoPedidoMiddleware).forRoutes(
      { path: 'api/pedidos', method: RequestMethod.POST },
      {
        path: 'api/pedidos/:codigo/comprobantes',
        method: RequestMethod.POST,
      },
    );
  }
}
