# Productos e inventario sin fuente de demostración

18 de noviembre de 2026, America/Lima.

## Fuente y pantallas

`ProductosAdministracion` es ahora un token de inyección con el contrato independiente `FuenteProductosAdministracion`. Proporciona `ProductosAdministracionApi` por defecto y conserva la vinculación explícita de `app.config.ts`. La API administra sus propios estados, sin heredar de la clase de demostración ni ofrecer sus escrituras locales. Las consultas, cancelaciones por canal, limpieza de sesión, paginación, adaptación y recarga tras una escritura conservan su implementación real.

El listado obtiene productos, opciones, conteos y detalle de esa fuente. El historial consulta los movimientos remotos con sus filtros y fechas. Se retiraron los selectores de escenarios, el restablecimiento del prototipo, los mensajes de demostración y las ramas de consulta local. `?vista=error` ya no selecciona otro estado visual: carga, error y vacío dependen de las respuestas HTTP.

`FormularioProducto` monta únicamente `EditorProducto` y delega la protección de salida. `MovimientoInventario` monta únicamente `MovimientoInventarioReal`, conserva sus entradas y eventos y delega la misma protección. Se retiraron las dos plantillas antiguas; se conservaron los CSS que importan directamente los componentes reales. El panel lateral de consulta mantiene variantes, reservas, stock y acceso al historial, sin controles de escritura del prototipo.

Las altas, edición, fotografías y publicación siguen utilizando `EdicionProductosApi`. Archivo/restauración conservan `EstadoProducto`, su confirmación, versiones y recuperación de solicitudes. Los cambios de existencias siguen utilizando `MovimientosInventarioApi`. Esta entrega retira las alternativas simuladas de estas pantallas; no modifica sus contratos HTTP.

## Ejemplos conservados

La antigua clase local se aisló como `ProductosAdministracionPrueba` en `productos/pruebas/productos-administracion.fixture.ts`. La eligen explícitamente las pruebas antiguas de Dashboard, pedidos, envíos, cancelaciones y posventa que todavía necesitan un entorno en memoria. Su suite se trasladó a esa carpeta para conservar la cobertura. No se importa desde código de aplicación.

Los productos ilustrativos que aún necesita Cambios y devoluciones se trasladaron, sin modificar sus valores, de `productos/datos/productos-administracion-demo.ts` a `cambios/datos/productos-posventa-demo.ts`. El catálogo ilustrativo compartido por los pedidos administrativos pasó de `productos/datos/catalogo-productos-demo.ts` a `pedidos/datos/catalogo-productos-demo.ts`. Los fixtures de pruebas actualizan sus referencias a estos conjuntos. No son una reserva de datos de Productos e inventario ni del catálogo público.

Pedidos, Pagos y sus servicios antiguos, Configuración y el panel de demostración de Inicio requieren revisión en lotes posteriores. Cambios y devoluciones continúa pendiente de integración y permanece oculto. No se retiran datos de ejemplo que todavía sostienen esos módulos.

## Validación

- 1164 pruebas Angular en 150 archivos; tipos de aplicación y pruebas; compilación de producción. Tras renombrar el último control de reintento se repitieron la suite del listado y producción.
- Comprobación del grafo de imports, incluidas rutas diferidas: 202 archivos alcanzables desde `src/main.ts`, sin fixtures. Las dependencias de `ProductosAdministracion` no contienen ejemplos, proveedores de pruebas ni herencia de simulación.
- Chrome recorrió alta modal, guardado de datos y tallas, rechazo que conserva campos, existencias, dos fotografías, portada y publicación confirmada a 1440/768/390 px.
- Ocho comprobaciones adicionales a 1440/390 px: listado y detalle por API, parámetro de escenario ignorado, archivo/restauración confirmados con versiones y recarga, historial y consulta sin movimientos, error/reintento y lista vacía sin productos de reserva.
- Sin excepciones JavaScript ni desbordamiento horizontal. Todas las solicitudes `/api/*` de los recorridos se interceptaron, incluidas las escrituras y cargas de fotografías; las rutas no preparadas recibieron un error controlado.

Evidencia desde la raíz SOHO: `.checkout-review/limpieza-productos/dependencias.json`, `listado.json`, scripts `editor.mjs`/`listado.mjs` y capturas. No se modificaron backend ejecutable, Prisma, migraciones, seeds, MySQL ni archivos externos de Cloudinary.
