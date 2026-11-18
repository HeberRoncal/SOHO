# Catálogo y detalle conectados a MySQL

El catálogo público utiliza `CatalogoApi` mediante el contrato `FUENTE_CATALOGO`. Tanto el proveedor predeterminado como la configuración de `app.config.ts` apuntan a la API. La [limpieza del 18 de noviembre de 2026](limpieza-catalogo.md) retiró el servicio antiguo de demostración, separó los filtros compartidos y dejó los proveedores de ejemplo exclusivamente en las pruebas. Los datos compartidos de las simulaciones administrativas pendientes se conservan en Administración.

## Arranque local

Con MySQL disponible y `.env` configurado en el backend, abrir dos terminales:

```powershell
cd soho-backend
npm.cmd run start:dev
```

```powershell
cd soho-frontend
npm.cmd start
```

Abrir `http://localhost:4200/zapatillas`. El proxy de Angular envía `/api/**` al backend en `http://127.0.0.1:3000`. Reiniciar `ng serve` si se incorpora el archivo de proxy a un servidor que ya estaba abierto.

En producción, configurar el servidor para enviar `/api` a NestJS bajo el mismo origen y resolver las demás rutas de Angular con `index.html`. Las credenciales MySQL permanecen en el backend.

## Comportamiento

- El listado envía búsqueda, marcas, categorías, géneros, colores, tallas, precios, selecciones, orden y página al servidor. Los filtros siguen usando las rutas y parámetros existentes. `pagina` se añade solo cuando es necesario; cambiar filtros u orden vuelve a la primera página.
- Se muestran el total real del servidor y los controles Anterior/Siguiente. Atrás y Adelante recuperan los filtros y la página. Una página fuera de rango se corrige hacia la última disponible.
- `switchMap` cancela la consulta anterior al cambiar filtros o producto. Elegir otro color con ficha propia consulta su slug y conserva la talla; seleccionar talla en la misma ficha no vuelve a descargar el detalle.
- Carga, error de red, producto inexistente y resultados vacíos tienen estados distintos. Reintentar conserva los filtros. Un rango de precio invertido sigue mostrando su explicación local.
- Los límites de precio, marcas, categorías, colores y tallas proceden de `/api/catalogo/filtros`, para que no desaparezcan opciones al cambiar de página.
- El precio decimal de la API se adapta a los componentes existentes. El disponible ya descuenta reservas; no se vuelve a descontar en Angular.
- El menú y los consumidores públicos usan el mismo almacén reactivo. La precarga para escaparates tiene un máximo de 100 productos; el catálogo solicita sus páginas al servidor. Los favoritos y los SKU guardados en el carrito se recuperan por lotes si faltan en memoria.
- El carrito conserva SKU y cantidad, consulta el catálogo real y persiste por cuenta en MySQL; el invitado utiliza almacenamiento local. El [checkout actual](integracion-checkout-recepciones.md) obtiene instrucciones y recibe comprobantes mediante las API reales. Añadir al carrito no reserva stock.

## Contrato HTTP

Se consumen `GET /api/productos`, `GET /api/productos/:slug` y `GET /api/catalogo/filtros`; también están disponibles `GET /api/marcas` y `GET /api/categorias`.

El listado devuelve `{ productos, paginacion: { pagina, limite, total, paginas } }`. Los precios se envían como cadenas con dos decimales; las variantes incluyen SKU, color, talla EU, habilitación y disponible. El adaptador conserva el slug como `Producto.identificador`, para mantener enlaces y favoritos.

El contrato completo y sus límites están en `soho-backend/docs/api-catalogo.md`, en el proyecto hermano.

## Validación

La limpieza del 18 de noviembre de 2026 pasó 1162 pruebas Angular en 151 archivos, tipos y producción. Chrome comprobó filtros/orden, vacío, colores/talla y fallo/reintento a 1440/390 px con API real y fallo de lectura controlado, sin escrituras comerciales. La evidencia está en `.checkout-review/limpieza-catalogo/`. Los siguientes resultados corresponden a la entrega inicial de integración.

La entrega registra una compilación de producción correcta y 325 pruebas aprobadas en 94 archivos con `npm.cmd test -- --watch=false`. Las nuevas pruebas usan el backend HTTP de pruebas de Angular y verifican cancelación, parámetros repetidos, céntimos, disponibilidad, 404 frente a 503, reintento, total y navegación de página y uso del mismo precio en detalle y carrito.

El recorrido de Chrome a 1440 y 390 px verificó datos de MySQL mediante el proxy, filtros, detalle, SKU, carrito al recargar, carga lenta, error recuperable, vacío y paginación. No registró excepciones JavaScript, imágenes rotas ni desbordamiento horizontal. La paginación se probó con límite cuatro controlado en red sobre los productos existentes. No se comprobó lector de pantalla ni teléfono físico.

Se aplicó la guía local `impeccable` para los estados nuevos, conservando la identidad y las pantallas migradas. Su detector emitió una advertencia estática por `[src]` de los logotipos, comprobados en el navegador. Las evidencias están en `../.checkout-review/api-catalogo/`, fuera del repositorio.
