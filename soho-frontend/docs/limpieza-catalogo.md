# Retirada de dependencias de demostración del Catálogo

18 de noviembre de 2026, America/Lima.

## Aplicación

`FuenteCatalogo` define directamente productos, marcas y operaciones; ya no utiliza `Pick<CatalogoDemostracion>`. El proveedor predeterminado de `FUENTE_CATALOGO` es `CatalogoApi`, además de la vinculación explícita que ya tenía `app.config.ts`. No existe fuente de ejemplo como alternativa ante una API vacía o fallida.

La búsqueda, combinación de filtros, orden y disponibilidad están en `modelos/consulta-catalogo.ts`. CatalogoApi utiliza estas funciones para consultar su caché real, sin importar ningún simulador. Su referencia al contrato es de tipo, evitando una dependencia circular de ejecución.

Se retiraron `servicios/catalogo-demostracion.ts` y su prueba antigua. Las ocho comprobaciones de filtros, stock, tallas y orden se trasladaron a `servicios/consulta-catalogo.spec.ts`, donde los productos se cargan a través del backend HTTP de pruebas de CatalogoApi. La prueba del proveedor predeterminado exige CatalogoApi y cachés inicialmente vacías.

También se retiró del listado el aviso obsoleto que calificaba los productos, precios y existencias como demostración, junto con su regla CSS sin otros usos. No se modificaron componentes visuales ni contratos HTTP.

## Pruebas y datos pendientes de otros módulos

- `CatalogoPrueba` y `proveerCatalogoPrueba()` viven en `catalogo/pruebas/catalogo.fixture.ts`. Veinticinco suites de vistas o servicios eligen expresamente ese proveedor; la aplicación no lo importa.
- Las marcas de ejemplo se trasladaron desde `datos/marcas-demostracion.ts` a `pruebas/marcas.fixtures.ts`.
- Los productos de ejemplo todavía alimentan las simulaciones administrativas de Productos y Pedidos, pendientes de otro lote. Su conjunto compartido se trasladó, sin cambiar sus valores, desde Catálogo a `administracion/productos/datos/catalogo-productos-demo.ts`. Esos dos importadores administrativos se ajustaron sin cambiar su lógica.
- Para evitar duplicar el conjunto durante esta transición, `catalogo/pruebas/productos.fixtures.ts` lo expone a las pruebas. Esta referencia no existe en CatalogoApi ni en la aplicación pública. Cuando se retiren las simulaciones administrativas, el conjunto podrá permanecer exclusivamente en pruebas.
- Los casos de selección de tallas, colores, carrito y aislamiento del catálogo público siguen usando los mismos datos controlados, ahora mediante imports de fixtures.

El análisis de dependencias desde `src/main.ts`, incluidas rutas diferidas, no alcanza archivos de `pruebas/` ni `.fixture.ts`/`.fixtures.ts`. La cadena de dependencias del proveedor del Catálogo no alcanza archivos de demostración ni fixtures. Las simulaciones administrativas continúan en el grafo general porque pertenecen a las entregas pendientes.

## Verificación

- 1162 pruebas Angular en 151 archivos, sin retirar casos; tipos de aplicación y pruebas y compilación de producción.
- Chrome a 1440 y 390 px: marcas y orden comparados con la respuesta de la API, resultados vacíos sin ejemplos, ficha/cambio de color conservando talla y fallos 503 sin productos ficticios, con reintento que recupera datos reales.
- Ocho comprobaciones de navegador, sin desbordes ni excepciones JavaScript. Solo solicitudes de consulta; ninguna compra ni escritura comercial.

Evidencias desde la raíz SOHO: `.checkout-review/limpieza-catalogo/dependencias.json`, `navegador.json` y capturas. No hay cambios de NestJS, Prisma, migraciones, seeds ni datos de MySQL en esta entrega.
