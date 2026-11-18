import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AutenticacionModule } from '../autenticacion/autenticacion.module.js';
import { ConfiguracionPagosModule } from '../configuracion-pagos/configuracion-pagos.module.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { PreparacionPedidoModule } from '../pedidos/preparacion/preparacion-pedido.module.js';
import { SesionPedidoGuard } from '../pedidos/seguridad/sesion-pedido.guard.js';
import { MetodosPagoController } from './metodos-pago.controller.js';
import { InstruccionesPagoController } from './instrucciones-pago.controller.js';
import { InstruccionesPagoService } from './instrucciones-pago.service.js';
import { ComprobantesPrivadosModule } from '../pedidos/archivos/comprobantes-privados.module.js';
import { CuerpoPedidoMiddleware } from '../pedidos/http/cuerpo-pedido.middleware.js';
import { RecepcionesCompraController } from './recepciones/recepciones-compra.controller.js';
import { RecepcionesCompraService } from './recepciones/recepciones-compra.service.js';
import { ProcesamientoRecepcionService } from './recepciones/procesamiento-recepcion.service.js';
import { AdministracionRecepcionesController } from './recepciones/administracion-recepciones.controller.js';
import { AdministracionRecepcionesService } from './recepciones/administracion-recepciones.service.js';
import { CorreccionesRecepcionService } from './recepciones/correcciones-recepcion.service.js';

@Module({
  imports: [
    PrismaModule,
    AutenticacionModule,
    ConfiguracionPagosModule,
    InventarioModule,
    PreparacionPedidoModule,
    ComprobantesPrivadosModule,
  ],
  controllers: [
    MetodosPagoController,
    InstruccionesPagoController,
    RecepcionesCompraController,
    AdministracionRecepcionesController,
  ],
  providers: [
    InstruccionesPagoService,
    SesionPedidoGuard,
    RecepcionesCompraService,
    ProcesamientoRecepcionService,
    AdministracionRecepcionesService,
    CorreccionesRecepcionService,
  ],
  exports: [InstruccionesPagoService],
})
export class PagosModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CuerpoPedidoMiddleware).forRoutes(
      { path: 'api/pagos/recepciones', method: RequestMethod.POST },
      {
        path: 'api/pagos/recepciones/:id/comprobantes',
        method: RequestMethod.POST,
      },
    );
  }
}
