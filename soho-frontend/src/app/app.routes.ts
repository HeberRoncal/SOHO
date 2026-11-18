import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { FUENTE_CATALOGO } from './tienda/catalogo/modelos/fuente-catalogo';
import { SECCIONES_CATALOGO } from './tienda/catalogo/servicios/navegacion-catalogo';
import { normalizarSeccionGuard } from './tienda/catalogo/guardas/normalizar-seccion-guard';
import { cuentaGuard } from './tienda/cuenta/guardas/cuenta-guard';
import { adminGuard } from './tienda/cuenta/guardas/admin-guard';
import { cambiosProductoGuard } from './administracion/productos/guardas/cambios-producto-guard';
export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () =>
      import('./administracion/estructuras/estructura-admin/estructura-admin').then(
        (m) => m.EstructuraAdmin,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'recepciones',
        title: 'Recepciones | SOHO Admin',
        loadComponent: () =>
          import('./administracion/recepciones/paginas/listado-recepciones/listado-recepciones').then(
            (m) => m.ListadoRecepciones,
          ),
      },
      {
        path: 'recepciones/:id',
        title: 'Detalle de recepción | SOHO Admin',
        canDeactivate: [cambiosProductoGuard],
        loadComponent: () =>
          import('./administracion/recepciones/paginas/detalle-recepcion/detalle-recepcion').then(
            (m) => m.DetalleRecepcion,
          ),
      },
      {
        path: 'dashboard',
        canDeactivate: [cambiosProductoGuard],
        title: 'Dashboard | SOHO Admin',
        loadComponent: () =>
          import('./administracion/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'configuracion',
        title: 'Configuración | SOHO Admin',
        loadComponent: () =>
          import('./administracion/configuracion/configuracion').then((m) => m.Configuracion),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'pagos' },
          {
            path: 'pagos',
            canDeactivate: [cambiosProductoGuard],
            loadComponent: () =>
              import('./administracion/configuracion/pagos/pagos').then((m) => m.Pagos),
          },
          {
            path: 'envios',
            canDeactivate: [cambiosProductoGuard],
            loadComponent: () =>
              import('./administracion/configuracion/envios/envios').then((m) => m.Envios),
          },
          {
            path: 'inventario',
            canDeactivate: [cambiosProductoGuard],
            loadComponent: () =>
              import('./administracion/configuracion/inventario/inventario').then(
                (m) => m.Inventario,
              ),
          },
          {
            path: 'tienda',
            canDeactivate: [cambiosProductoGuard],
            loadComponent: () =>
              import('./administracion/configuracion/tienda/tienda').then((m) => m.Tienda),
          },
          {
            path: 'administradores',
            loadComponent: () =>
              import('./administracion/configuracion/administradores/administradores').then(
                (m) => m.Administradores,
              ),
          },
          { path: '**', redirectTo: 'pagos' },
        ],
      },
      {
        path: 'cambios',
        // Posventa permanece oculta hasta integrar el módulo con el backend.
        children: [{ path: '**', redirectTo: '/admin/dashboard' }],
      },
      {
        path: 'clientes',
        title: 'Clientes | SOHO Admin',
        loadComponent: () =>
          import('./administracion/clientes/paginas/listado-clientes/listado-clientes').then(
            (m) => m.ListadoClientes,
          ),
      },
      {
        path: 'clientes/:identificador',
        title: 'Detalle del cliente | SOHO Admin',
        loadComponent: () =>
          import('./administracion/clientes/paginas/detalle-cliente/detalle-cliente').then(
            (m) => m.DetalleCliente,
          ),
      },
      {
        path: 'pagos',
        title: 'Pagos por verificar | SOHO Admin',
        loadComponent: () =>
          import('./administracion/pagos/paginas/listado-pagos/listado-pagos').then(
            (m) => m.ListadoPagos,
          ),
      },
      {
        path: 'pagos/:codigo',
        title: 'Revisión de pago | SOHO Admin',
        loadComponent: () =>
          import('./administracion/pagos/paginas/revision-pago/revision-pago').then(
            (m) => m.RevisionPago,
          ),
      },
      {
        path: 'pedidos',
        title: 'Pedidos | SOHO Admin',
        loadComponent: () =>
          import('./administracion/pedidos/paginas/listado-pedidos/listado-pedidos').then(
            (m) => m.ListadoPedidos,
          ),
      },
      {
        path: 'pedidos/:codigo',
        title: 'Detalle del pedido | SOHO Admin',
        canDeactivate: [cambiosProductoGuard],
        loadComponent: () =>
          import('./administracion/pedidos/paginas/detalle-pedido/detalle-pedido').then(
            (m) => m.DetallePedido,
          ),
      },
      ...[
        { path: 'productos/nuevo', titulo: 'Nuevo producto' },
        { path: 'productos/:identificador/editar', titulo: 'Editar producto' },
      ].map(({ path, titulo }) => ({
        path,
        title: titulo + ' | SOHO Admin',
        canDeactivate: [cambiosProductoGuard],
        loadComponent: () =>
          import('./administracion/productos/paginas/formulario-producto/formulario-producto').then(
            (m) => m.FormularioProducto,
          ),
      })),
      {
        path: 'productos',
        title: 'Productos e inventario | SOHO Admin',
        canDeactivate: [cambiosProductoGuard],
        loadComponent: () =>
          import('./administracion/productos/paginas/listado-productos/listado-productos').then(
            (m) => m.ListadoProductos,
          ),
      },
    ],
  },
  {
    path: '',
    loadComponent: () =>
      import('./estructuras/estructura-tienda/estructura-tienda').then((m) => m.EstructuraTienda),
    children: [
      ...[
        { path: 'iniciar-sesion', vista: 'login', titulo: 'Iniciar sesión' },
        { path: 'crear-cuenta', vista: 'registro', titulo: 'Crear cuenta' },
        { path: 'verificar-correo', vista: 'verificar', titulo: 'Verifica tu correo' },
        { path: 'recuperar-contrasena', vista: 'recuperar', titulo: 'Recuperar contraseña' },
        { path: 'restablecer-contrasena', vista: 'restablecer', titulo: 'Nueva contraseña' },
        { path: 'sesion-no-disponible', vista: 'sesion', titulo: 'No pudimos comprobar tu sesión' },
        { path: 'sin-permiso', vista: 'sin-permiso', titulo: 'Acceso restringido' },
      ].map(({ path, vista, titulo }) => ({
        path,
        title: titulo + ' | SOHO',
        data: { vista },
        loadComponent: () => import('./tienda/cuenta/paginas/acceso/acceso').then((m) => m.Acceso),
      })),
      ...[
        { path: 'mi-cuenta', seccion: 'resumen', titulo: 'Mi cuenta' },
        { path: 'mi-cuenta/perfil', seccion: 'perfil', titulo: 'Mis datos' },
        { path: 'mi-cuenta/direcciones', seccion: 'direcciones', titulo: 'Mis direcciones' },
        { path: 'mi-cuenta/pedidos', seccion: 'pedidos', titulo: 'Mis pedidos' },
      ].map(({ path, seccion, titulo }) => ({
        path,
        title: titulo + ' | SOHO',
        data: { seccion },
        canActivate: [cuentaGuard],
        loadComponent: () =>
          import('./tienda/cuenta/paginas/mi-cuenta/mi-cuenta').then((m) => m.MiCuenta),
      })),
      { path: 'cuenta', pathMatch: 'full', redirectTo: 'mi-cuenta' },
      ...SECCIONES_CATALOGO.map((seccion) => ({
        path: seccion.ruta,
        title: seccion.titulo + ' | SOHO',
        data: { seccion: seccion.ruta },
        canActivate: [normalizarSeccionGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange' as const,
        loadComponent: () => import('./tienda/catalogo/catalogo').then((m) => m.Catalogo),
      })),
      {
        path: 'catalogo',
        canActivate: [normalizarSeccionGuard],
        loadComponent: () => import('./tienda/catalogo/catalogo').then((m) => m.Catalogo),
      },
      {
        path: 'producto/:identificador',
        title: (ruta) => {
          const producto = inject(FUENTE_CATALOGO).obtener(
            ruta.paramMap.get('identificador') ?? '',
          );
          return producto ? producto.nombre + ' | SOHO' : 'Producto no encontrado | SOHO';
        },
        loadComponent: () =>
          import('./tienda/detalle-producto/detalle-producto').then((m) => m.DetalleProducto),
      },
      {
        path: '',
        pathMatch: 'full',
        title: 'SOHO | Zapatillas multimarca en Trujillo',
        loadComponent: () => import('./tienda/inicio/paginas/inicio/inicio').then((m) => m.Inicio),
      },
      {
        path: 'favoritos',
        title: 'Tus favoritos | SOHO',
        loadComponent: () => import('./tienda/favoritos/favoritos').then((m) => m.Favoritos),
      },
      {
        path: 'carrito',
        title: 'Tu carrito | SOHO',
        loadComponent: () => import('./tienda/carrito/carrito').then((m) => m.Carrito),
      },
      {
        path: 'finalizar-compra',
        title: 'Finalizar compra | SOHO',
        loadComponent: () =>
          import('./tienda/finalizar-compra/checkout-compra').then((m) => m.CheckoutCompra),
      },
      {
        path: 'recepcion/:id',
        title: 'Tu comprobante recibido | SOHO',
        loadComponent: () =>
          import('./tienda/finalizar-compra/recepcion-compra').then((m) => m.RecepcionCompra),
      },
      {
        path: 'pedido/:codigo',
        title: 'Seguimiento de tu pedido | SOHO',
        loadComponent: () =>
          import('./tienda/pedidos/seguimiento-pedido/seguimiento-pedido').then(
            (m) => m.SeguimientoPedido,
          ),
      },
      {
        path: 'seguimiento-pedido',
        title: 'Seguimiento de tu pedido | SOHO',
        loadComponent: () =>
          import('./tienda/pedidos/seguimiento-pedido/seguimiento-pedido').then(
            (m) => m.SeguimientoPedido,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
