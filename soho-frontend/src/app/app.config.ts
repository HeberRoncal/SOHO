import { registerLocaleData } from '@angular/common';
import idiomaPeru from '@angular/common/locales/es-PE';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { autenticacionInterceptor } from './tienda/cuenta/servicios/autenticacion-interceptor';
import { Cuenta } from './tienda/cuenta/servicios/cuenta';
import { FUENTE_CATALOGO } from './tienda/catalogo/modelos/fuente-catalogo';
import { CatalogoApi } from './tienda/catalogo/servicios/catalogo-api';
import { CoberturaApi } from './tienda/finalizar-compra/servicios/cobertura-api';
import { FUENTE_COBERTURA } from './tienda/finalizar-compra/servicios/cobertura-entrega';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { GESTOR_PEDIDOS } from './tienda/pedidos/servicios/pedidos';
import { PedidosApi } from './tienda/pedidos/servicios/pedidos-api';
import { PagosAdministracion } from './administracion/pagos/servicios/pagos-administracion';
import { PagosAdministracionApi } from './administracion/pagos/servicios/pagos-administracion-api';
import { ProductosAdministracion } from './administracion/productos/servicios/productos-administracion';
import { ProductosAdministracionApi } from './administracion/productos/servicios/productos-administracion-api';
import { Carrito, GESTOR_CARRITO } from './tienda/carrito/servicios/carrito';
import { CarritoPersistente } from './tienda/carrito/servicios/carrito-persistente';
registerLocaleData(idiomaPeru);
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([autenticacionInterceptor])),
    { provide: FUENTE_CATALOGO, useExisting: CatalogoApi },
    { provide: FUENTE_COBERTURA, useExisting: CoberturaApi },
    { provide: GESTOR_PEDIDOS, useExisting: PedidosApi },
    { provide: PagosAdministracion, useExisting: PagosAdministracionApi },
    { provide: ProductosAdministracion, useExisting: ProductosAdministracionApi },
    { provide: GESTOR_CARRITO, useExisting: CarritoPersistente },
    provideAppInitializer(() => {
      inject(CatalogoApi).iniciar();
      inject(Cuenta).iniciar();
      inject(Carrito);
      void inject(CoberturaApi).cargar();
    }),
    { provide: LOCALE_ID, useValue: 'es-PE' },
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
  ],
};
