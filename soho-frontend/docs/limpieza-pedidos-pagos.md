# Pedidos y Pagos sin fuentes de simulación

18 de noviembre de 2026, America/Lima.

## Fuentes reales

`GESTOR_PEDIDOS` proporciona `PedidosApi` por defecto, además de la vinculación explícita existente en `app.config.ts`. El contrato `GestorPedidos` exige los estados y operaciones completos. La fachada `Pedidos` los delega directamente: no repone estados locales, confirma consultas inexistentes ni devuelve resultados alternativos de demostración. Mis pedidos y Seguimiento utilizan siempre las consultas y comprobantes privados de la API.

`PagosAdministracion` es un token con el contrato independiente `FuentePagosAdministracion`. Proporciona `PagosAdministracionApi` por defecto. Se retiró la implementación local de sus dependencias de aplicación y se quitaron de la API los métodos inactivos `simularCorreccion` y `restablecer`. Se conservan consultas, caché por identidad, versiones, decisiones e imágenes privadas.

`PedidosAdministracion` consulta la fuente real de Pagos y delega preparación, despacho y entrega en `EnviosAdministracionApi`; cancelación, liberación y actualización en `CancelacionesAdministracionApi`. Ya no inyecta los servicios de envío y cancelación en memoria ni expone escrituras locales o restablecimientos del prototipo. Los servicios de API conservan sus validaciones, autorización, confirmaciones y recuperación tras respuestas inciertas.

## Pantallas

Se retiraron las ramas y controles de escenarios, los filtros locales alternativos, la corrección ficticia de comprobantes, el relleno de un courier de ejemplo y los mensajes de simulación de Pedidos/Pagos. El parámetro antiguo `vista` no fuerza carga, error o vacío. Los estados visibles proceden de la API y se mantienen los filtros y páginas en la URL.

El visor muestra exclusivamente el Blob privado del comprobante. Conserva zoom, rotación, restablecimiento de la vista y ampliación; se retiraron el documento ficticio dibujado con HTML y su CSS. El restablecimiento del visor solo ajusta zoom/rotación, no modifica datos.

Los formularios mantienen versiones fijadas al abrir, confirmaciones, bloqueo durante una solicitud, conservación de campos y actualización ante conflictos. El seguimiento permite corregir comprobantes observados en el mismo pedido. El pie compartido de compra dejó de ofrecer su aviso de demostración y los consumidores ya no necesitan ese indicador.

## Ejemplos y pruebas

Las clases locales se trasladaron a `tienda/pedidos/pruebas/pedidos.fixture.ts`, `administracion/pagos/pruebas/pagos-administracion.fixture.ts` y `administracion/pedidos/pruebas/`. Sus suites anteriores se conservan allí; las pruebas aisladas que los necesitan eligen sus proveedores explícitamente. Las pantallas no los importan y ningún fixture es alcanzable desde el arranque.

El conjunto de pagos ilustrativos quedó en `pagos/pruebas/pagos.fixtures.ts`. Los pedidos, productos de catálogo y tarifas que aún necesita posventa se trasladaron, sin cambiar sus valores, a `cambios/datos/pedidos-posventa-demo.ts`, `catalogo-posventa-demo.ts` y `cobertura-posventa-demo.ts`. Los fixtures anteriores de Catálogo, Cobertura y Productos actualizaron sus referencias. Cambios y devoluciones permanece sin integrar, oculto y fuera de las rutas operativas.

Los validadores y modelos puros compartidos con los ejemplos de posventa se conservan. Esta entrega no implementa posventa ni retira sus datos. Configuración, el panel de demostración de Inicio y los componentes antiguos del checkout que ya no entran en el arranque quedan para revisión posterior.

## Verificación

- 1166 pruebas Angular en 151 archivos, conservando las suites anteriores. Las nuevas comprobaciones verifican los proveedores predeterminados reales y que un fallo de las API no se convierta en una escritura local exitosa.
- Tipos de aplicación y pruebas y compilación de producción. Después de depurar textos constantes y CSS sin uso se repitieron producción y 232 pruebas de los módulos afectados en 27 archivos.
- Grafo de imports, incluidas rutas diferidas: 199 archivos alcanzables desde `src/main.ts`, sin fixtures. Las dependencias de las fuentes de Pedidos de tienda, Pedidos administrativos y Pagos administrativos no contienen ejemplos.
- Catorce comprobaciones Chrome a 1440/390 px: listado, error/reintento y vacío, comprobante privado decodificado, zoom/rotación, aprobación confirmada, preparación, despacho, entrega, seguimiento privado, Mis pedidos, cancelación con pago aprobado conservado, observación, corrección con archivo y rechazo sin cancelar el pedido.
- Todas las solicitudes `/api/*` se interceptaron, incluidas las escrituras y las imágenes. No se permitieron llamadas reales como alternativa. Sin excepciones JavaScript ni desbordamiento horizontal en los recorridos.

Evidencia desde la raíz SOHO: `.checkout-review/limpieza-pedidos-pagos/dependencias.json`, `navegador.json`, scripts y capturas. No se modificaron backend ejecutable, esquema, Prisma, migraciones, seeds, datos de MySQL ni archivos de proveedores externos.
