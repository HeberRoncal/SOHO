# Integración administrativa de Clientes

Entrega del 15 de noviembre de 2026. Las rutas `/admin/clientes` y `/admin/clientes/:identificador` consultan la [API real de Clientes](../../soho-backend/docs/api-clientes-administracion.md). Mantienen el diseño existente y sustituyen los datos, totales y selectores de demostración por peticiones a NestJS/MySQL. No requieren migración ni regeneración Prisma.

## Fuente y contratos

`ClientesAdministracionApi` es una fuente propia, independiente del caché de Pedidos/Pagos. Las pantallas la inyectan directamente; el servicio de demostración y sus datos quedan aislados para las pruebas existentes. Los contratos están en `administracion/clientes/modelos/consulta-clientes-api.ts`.

El servicio y el componente compartido de paginación se generaron con el CLI local de Angular y se adaptaron al contrato existente:

```powershell
npx.cmd --no-install ng generate service administracion/clientes/servicios/clientes-administracion-api
npx.cmd --no-install ng generate component administracion/clientes/componentes/paginacion-clientes
```

Esta entrega no añade piezas del backend ni modifica sus fuentes, Prisma o migraciones. La regla de generación con Nest CLI continúa vigente para futuras piezas del backend.

Los adaptadores comprueban identidad/tipo, capacidades de solo consulta, fechas, teléfono de entrega y su pedido fuente, conteos globales, páginas, importes, estados y artículos históricos. Rechazan fichas de otra identidad, UUID/correo de invitado incompatibles, páginas incoherentes, filas duplicadas e imágenes con protocolos no admitidos. No sustituyen respuestas inválidas por demostración.

Los importes conservan la cadena decimal del servidor. El formato de moneda usa `BigInt` para agrupar la parte entera y conserva los céntimos; no convierte el agregado a `Number` ni suma pagos en Angular. Se prueban cantidades superiores al rango entero seguro de JavaScript.

## Listado y navegación

El listado envía `busqueda`, `tipo`, `orden` y `pagina`. MySQL aplica filtros y orden antes de paginar; Angular utiliza `paginacion.total` para los resultados y `resumen` para las cantidades globales. Nunca cuenta clientes desde la página cargada ni desde el caché de Pedidos.

La URL conserva búsqueda, tipo, orden y página al recargar y al volver desde una ficha. Cambiar búsqueda, tipo u orden reinicia la página. El antiguo parámetro `vista` no controla los estados reales ni se envía al API. Los controles de demostración se retiraron y la estructura administrativa reconoce Clientes como datos reales.

La paginación usa páginas de veinte resultados y contempla enlaces a páginas fuera del rango: ofrece volver a la primera, conservando filtros. Al abrir otra ficha desde el listado se retiran `paginaPedidos`, `paginaDirecciones` y `clienteOrigen`, evitando heredar páginas de otro comprador.

Las compras invitadas usan `invitado:<UUID del pedido>`. Los enlaces tratan esa identidad como opaca, sin interpretar correos o fusionar compradores. La pantalla aclara que los invitados se cuentan por pedido. Registrados mantienen el UUID de cuenta, incluidos clientes sin compras, inactivos y compradores con rol administrativo según el universo del API.

## Ficha, historial y direcciones

El detalle consulta primero la ficha solicitada. Después carga historial y direcciones por canales independientes, con `paginaPedidos` y `paginaDirecciones` en la URL. Los agregados completos proceden del detalle y no se recalculan desde las tablas paginadas.

La cabecera distingue contacto actual de cuenta de contacto histórico invitado. Muestra fecha de cuenta, actividad y verificación solo si existe una cuenta. El celular se etiqueta como **Teléfono de entrega del último pedido** y se acompaña del destinatario: puede pertenecer a otra persona. Una cuenta sin compras no recibe teléfono o fechas inventados.

El historial conserva nombre, SKU, fotografía, talla, color, cantidades, contacto e importes de la compra. Pago y entrega se muestran por separado; un pago ausente se indica expresamente. **Pagos aprobados** incluye cancelados con pago conservado y mantiene la nota de que no descuenta reembolsos.

El enlace de cada pedido conserva filtros y las dos páginas, añadiendo `clienteOrigen`. El detalle de Pedidos verifica que esa identidad corresponde a su comprador antes de ofrecer “Volver al cliente”. Al regresar, Clientes consulta de nuevo ficha y tablas para reflejar cambios de pagos o entrega. Las operaciones de pago, cancelación y envío continúan en sus pantallas actuales.

Las direcciones son copias históricas agrupadas por el API, no la agenda privada. Muestran distrito, provincia, departamento, referencia, usos y fecha del último uso. Conservan los siete distritos de SOHO, incluido Moche aunque su cobertura actual esté deshabilitada. No se cotiza de nuevo ni se reescriben snapshots.

## Estados, reintentos y sesión

Cada canal maneja carga, éxito y error. El detalle distingue ausencia real —404 o identidad local inválida— de un fallo recuperable. Un fallo del historial o las direcciones conserva contacto y agregado, y ofrece reintentar únicamente la tabla afectada. La falta de resultados se distingue de ausencia de cuentas/compras. El límite 429 incluye una indicación de esperar antes de reintentar.

Las consultas nuevas cancelan las anteriores del mismo canal. Cada respuesta comprueba turno e identidad de sesión antes de aceptar datos. Salir de la pantalla cancela sus peticiones; cambiar de ficha retira inmediatamente el contenido anterior. Un 404 en una subconsulta invalida la ficha completa para evitar presentarla como un historial vacío.

La fuente exige `ADMIN`, limpia sus cuatro canales y oculta datos y conteos al cerrar sesión, cambiar de cuenta o perder el rol. Un 401/403 retira la información y muestra falta de acceso. La invalidación global de autenticación también termina en ese estado, evitando una pantalla de carga permanente. No guarda fichas en `localStorage` ni otro almacenamiento persistente.

## Verificación

La suite completa aprobó **923 pruebas en 141 archivos**. Incluye contratos, precisión decimal, identidad, respuestas antiguas, cancelación de peticiones, cambios de sesión, 401/403/404/429/503, paginación independiente, navegación y distintivos reales. También pasaron compilación de producción, TypeScript de aplicación/pruebas y formato.

Chrome comprobó nueve recorridos con Angular compilado, NestJS y once migraciones en MySQL 8.0.46 temporal: listado y paginación; ida/vuelta por Pedidos con filtros y páginas conservados y agregado recargado; invitados con correo compartido; cuenta sin compras y texto extenso; ausencia 404; error 503 del listado; fallo parcial; página fuera de rango; teclado y cierre de sesión. Se guardaron 30 capturas a 1440, 768 y 390 px, sin desbordamiento ni errores JavaScript, con imágenes reales cargadas. Los tamaños móviles son emulados en Chrome; no se probaron dispositivos físicos.

El detector visual señaló un `<img>` sin `src`: es un falso positivo del enlace Angular `[src]="articulo.imagen"`. Se comprobaron la validación de URLs, la carga efectiva de imágenes y las capturas. Se conservó la identidad visual del proyecto.

Las 263 fuentes/esquema del backend conservaron sus hashes. No se consultó ni modificó `soho_db`, ni se contactaron SMTP, Google o Cloudinary reales. Los datos sintéticos, servidores y perfiles de navegador temporales se retiraron. Evidencia en `.checkout-review/clientes-frontend/`, especialmente `validacion.json`, `browser.json`, registros y capturas.
