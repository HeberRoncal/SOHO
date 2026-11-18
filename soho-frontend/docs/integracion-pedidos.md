# Checkout, Mis pedidos y comprobantes privados

Fecha: 14 de noviembre de 2026, America/Lima.

La aplicación conecta `/finalizar-compra`, `/pedido/:codigo` y Mis pedidos con NestJS, Prisma y MySQL. Requiere las seis migraciones del backend. La aplicación local de la sexta sigue pendiente de confirmación del usuario; las pruebas utilizaron MySQL temporal y no modificaron `soho_db`.

## Fuente y contrato

`Pedidos` conserva el contrato de las vistas. `GESTOR_PEDIDOS` proporciona `PedidosApi` por defecto y `app.config.ts` conserva su vinculación explícita. El contrato exige los estados y operaciones completos y la fachada los delega sin alternativas locales. La clase anterior quedó exclusivamente en `pruebas/pedidos.fixture.ts`. Consultar [Limpieza de Pedidos y Pagos](limpieza-pedidos-pagos.md). `PedidosApi` y `AccesoPedidos` se generaron mediante Angular CLI. Los adaptadores traducen [el contrato JSON](../../soho-backend/docs/api-pedidos.md), validan importes, fechas, estados, paginación y metadatos y descartan campos internos.

Se envían contacto, entrega, datos fiscales activos, SKU y cantidades, precios y cotización esperados, YAPE/PLIN y contenido del comprobante. No se envían propietario, roles ni estados. Los importes son texto con dos decimales. Boleta omite campos ocultos de factura; DNI y operación conservan ceros iniciales. Nombres y apellidos admiten ochenta caracteres y el destinatario completo, 140. El backend vuelve a comprobar todos los datos comerciales.

Se conservan los siete distritos y sus tarifas persistidas. La Esperanza permanece gratuita; pendientes y zonas deshabilitadas bloquean continuar. Se cotiza antes del pago y de crear. Un cambio exige revisar la cotización. `DEMO10` no se ofrece ni se aplica a compras reales. Se retiró su lógica del resumen; los descuentos y totales históricos proceden de la API y no se deducen del código de promoción. Consultar [Limpieza del checkout](limpieza-checkout-restos.md).

Se distinguen pago pendiente, observado, aprobado, rechazado y anulado; entrega pendiente, confirmada, en preparación, incidencia, enviada, entregada y cancelada. Un estado desconocido produce error de contrato. Aprobar un pago y confirmar o preparar la entrega son acciones distintas.

## Confirmación y reintentos

El formulario espera la respuesta y bloquea envíos simultáneos. Solo muestra un código `SOHO-…` recibido y validado. El carrito se vacía al confirmar la creación o recuperar el mismo pedido, únicamente si sus SKU y cantidades siguen siendo los comprados. Un carrito modificado durante la solicitud se conserva. Si falla abrir la ruta, se mantiene una confirmación con enlace al pedido.

Antes del primer POST se genera un UUID v4 mediante criptografía del navegador. Ante error de red, respuesta inválida o 5xx se conserva en memoria el cuerpo original, incluida la imagen, y se ofrece comprobar o reintentar el envío con la misma clave.

`GET /api/pedidos/creacion/:clave` recupera una creación cuya respuesta se perdió, con los mismos permisos que el detalle. Se añadió al controlador y servicio existentes; no requirió piezas NestJS nuevas ni otra migración. Un 404 no demuestra que una solicitud anterior haya terminado: al volver a completar datos se conserva la misma clave para que la base impida duplicados. Cuando existe cuerpo original en memoria, el reintento usa exactamente ese contenido. El interceptor no repite escrituras automáticamente.

Los fallos conservan campos y carrito. Si cambia el importe aceptado se retira el comprobante del importe anterior. Una sesión inválida exige iniciar sesión y no se repite como invitado. Cambiar de identidad descarta respuestas tardías y retira los datos privados.

## Invitados y almacenamiento

Cada compra de invitado genera una credencial distinta de 32 bytes que viaja en `X-Pedido-Acceso`, nunca en una URL. El servidor conserva su hash y vencimiento. El código visible no concede acceso y una coincidencia de correo no atribuye la compra a una cuenta.

`AccesoPedidos` guarda en `sessionStorage`, bajo `soho:pedidos:accesos:v1`, solo la referencia del intento, el identificador de propietario cuando existe y credenciales/códigos de invitado. No guarda nombres, correo, celular, dirección, facturación, precios ni imagen. Conserva hasta veinte accesos durante treinta días como máximo y los retira al cambiar de identidad. La pestaña puede recargarse y recuperar la compra. Una pestaña sin credencial necesita la cuenta propietaria; el código no reconstruye ese acceso.

Si el almacenamiento está bloqueado, el recorrido funciona en memoria y la confirmación informa que debe mantenerse abierta la página. No se usa `localStorage` para credenciales o pedidos. El carrito conserva su formato anterior de SKU y cantidades.

## Listado, detalle y comprobantes

`GET /api/pedidos/mios` se consulta al entrar en Mi cuenta y ofrece páginas de veinte pedidos. El resumen muestra dos y el contador utiliza el total real. Carga, error, vacío y paginación se muestran por separado, con reintento. Las respuestas de una cuenta o página anteriores se descartan.

El seguimiento obtiene el pedido al abrirlo o recargarlo. La caché privada es reactiva desde la primera carga y se retira al cambiar de sesión. El backend comprueba la sesión o la credencial y devuelve 404 para compras ajenas.

El botón Ver consulta el archivo por HTTP autorizado y genera una URL Blob local después de validar MIME y tamaño. No incrusta URLs públicas ni confía en rutas arbitrarias recibidas. Cerrar el diálogo, cambiar de pedido o identidad revoca la URL; una respuesta tardía no la vuelve a crear. El modal dispone de carga, error y reintento.

## Validación y pendientes

Pasaron **515 pruebas de Angular**, incluidas 43 nuevas de contratos, acceso por pestaña, HTTP, idempotencia, respuestas tardías, carrito, archivos y reactividad tras recarga. También pasaron compilación de producción y TypeScript de aplicación y pruebas. El backend aprobó **356 pruebas** —230 unitarias, nueve HTTP y 117 con MySQL— y las **293 comprobaciones SQL** existentes, compilación, TypeScript completo y lint.

Ocho recorridos de Chrome sin interfaz, con Angular y NestJS compilados y MySQL 8.0.46 temporal, verificaron invitado, recarga, archivo privado, respuesta perdida después del COMMIT, dirección y factura de una cuenta, listado persistente, acceso desde otra cuenta y sesión revocada durante el envío. Se comprobó reserva exacta sin salida física. Se revisaron capturas a 1440, 768 y 390 px sin desbordamientos ni errores JavaScript. El detector señaló ocho falsos positivos de imágenes con `[src]`, revisados en plantilla y navegador.

Evidencia: `.checkout-review/pedidos-frontend/` desde la raíz SOHO. Las pruebas usan exclusivamente datos sintéticos y bases temporales; no realizan transferencias ni envían correos externos. Los servidores y directorios temporales se retiran al terminar.

Los QR, números y titular oficiales de Yape/Plin siguen pendientes de configuración y la pantalla lo informa. No se hacen cargos automáticos ni se emiten documentos fiscales. La [revisión administrativa de pagos y corrección del cliente](integracion-pagos.md) ya está integrada. Vencimiento de reservas, preparación, envíos, cancelaciones y posventa corresponden a entregas posteriores.
