import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CatalogoModule } from './catalogo/catalogo.module.js';
import { AutenticacionModule } from './autenticacion/autenticacion.module.js';
import { DireccionesModule } from './direcciones/direcciones.module.js';
import { CoberturaModule } from './cobertura/cobertura.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { ProductosModule } from './productos/productos.module.js';
import { InventarioModule } from './inventario/inventario.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { ConfiguracionPagosModule } from './configuracion-pagos/configuracion-pagos.module.js';
import { PagosModule } from './pagos/pagos.module.js';
import { ConfiguracionTiendaModule } from './configuracion-tienda/configuracion-tienda.module.js';
import { CarritoModule } from './carrito/carrito.module.js';

@Module({
  imports: [
    PrismaModule,
    CatalogoModule,
    AutenticacionModule,
    DireccionesModule,
    CoberturaModule,
    PedidosModule,
    ProductosModule,
    InventarioModule,
    ClientesModule,
    ConfiguracionPagosModule,
    PagosModule,
    ConfiguracionTiendaModule,
    CarritoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
