# Integración Angular de Configuración → Pagos

Implementada inicialmente el 16 de noviembre y simplificada el 17 de noviembre de 2026, America/Lima, con la [API administrativa existente](../../soho-backend/docs/api-configuracion-pagos.md). Conserva Prisma, trece migraciones y cliente generado; no requiere otra migración ni regeneración. El backend ahora exige desactivar un método antes de modificar sus datos receptores. El [nuevo checkout](integracion-checkout-recepciones.md) ya está conectado; la habilitación local previa se mantiene.

## Desactivar, editar y guardar

`/admin/configuracion/pagos` consulta los datos actuales y las capacidades del servidor. La versión cero muestra Yape y Plin desactivados, sin datos de demostración. Un método activo tiene bloqueados celular, titular y QR. Al desactivarlo, se guarda primero esa desactivación conservando sus datos; solo entonces se habilita la edición. Guardar cambios persiste los datos directamente, sin borrador, publicación ni diálogo adicional. Activar guarda los datos de esa billetera y vuelve a bloquearla. Se admite guardar ambos desactivados y el QR es opcional; activar exige celular y titular válidos.

La pantalla conserva la estructura visual y los controles de Configuración. Tiene una única barra de Guardar cambios y una vista de los datos guardados que verá el cliente. El aviso y guardado de demostración del contenedor no se aplican a Pagos; Tienda mantiene su circuito separado. Envíos e Inventario conservan sus fuentes independientes.

Los campos sin guardar se conservan al navegar durante la sesión de la aplicación. Salir con cambios solicita confirmación y la recarga protege esos cambios. Una consulta nueva conserva los campos; si su versión base cambió, exige una decisión explícita antes de cargar los datos actuales. Un guardado de una sola billetera no aplica ni descarta las ediciones locales de la otra. Los errores no reemplazan campos con datos de ejemplo.

`ConfiguracionPagosApi` comprueba identidad, revisión de sesión, rol y estado autenticado, cancela lecturas anteriores y utiliza turnos/épocas para descartar respuestas antiguas. Ante 401/403 retira configuración, borrador, vista de QR y recuperación visible. Las solicitudes enviadas conservan una copia por cuenta responsable, sin compartirla con otra cuenta administrativa.

## Publicación versionada

Guardar conserva el PATCH conjunto de YAPE y PLIN. Las acciones de una sola billetera envían los datos actuales de la otra y conservan sus campos locales pendientes. La activación/desactivación es una acción directa; ya no hay una segunda confirmación de publicación. El servidor compara los datos con el método vigente y rechaza cualquier cambio de celular, titular o QR mientras siga activo, incluso si el mismo cuerpo intenta desactivarlo. Los campos se normalizan a NFC, se eliminan espacios de presentación del celular y los pendientes se envían como `null`; se rechazan controles invisibles, teléfonos inválidos y datos activos incompletos.

Antes del PATCH se conserva en `sessionStorage`, bajo la cuenta responsable, el cuerpo exacto con clave UUID, versión y métodos. Si falla ese guardado, no se envía. Mientras exista un resultado incierto, el formulario queda bloqueado para otra publicación y ofrece:

- **Consultar publicación:** GET de la operación propia, sin repetir la escritura.
- **Reenviar el mismo guardado:** mismo PATCH, contenido, versión y clave.

Un fallo de red/5xx, una respuesta incompatible o un GET 404 conservan el intento. Un rechazo definitivo del PATCH mantiene el resultado y el borrador, consulta la versión vigente y exige una decisión explícita antes de continuar. Los límites 429 respetan `Retry-After`.

La respuesta recuperada es histórica: debe coincidir con el contenido y la versión esperados, y no sustituye directamente la publicación vigente. Se realiza una lectura independiente. Si esa lectura falla después del éxito, se muestra la confirmación y se reintenta solo la consulta. **Continuar con la publicación vigente** o descartar el intento rechazado carga expresamente el estado actual.

## QR en Cloudinary

La carga usa multipart con `archivo` y `datos: { claveCarga, metodo }`; el interceptor existente añade CSRF y cookies, dejando al navegador generar el encabezado multipart. La clave/identidad del archivo se conserva antes del POST: método, nombre, MIME, tamaño y SHA-256 original, sin guardar bytes ni credenciales.

El frontend limita MIME y tamaño a PNG/JPEG/WebP de hasta 2 MiB; NestJS verifica firma, decodificación, imagen estática, dimensiones y salida PNG sin pérdida de hasta 4096 píxeles por lado. No se generan códigos desde el celular ni se certifica el destinatario al cargar: debe revisarse el QR desde la billetera.

La carga de un QR solo se habilita con el método desactivado. Al quedar disponible se selecciona y guarda automáticamente con los datos de esa billetera, sin **Usar este QR**, borrador ni publicación manual. Quitar QR también guarda el cambio y conserva la billetera desactivada. Los errores o estados pendientes mantienen la recuperación anterior y bloquean escrituras incompatibles. Quitar o cerrar un resultado no hace DELETE en Cloudinary; el mantenimiento conserva todas las referencias históricas.

Los estados pendientes/conciliando bloquean nuevas publicaciones y conservan la clave; su consulta respeta la fecha de revisión. Un 202 no se anuncia como carga confirmada. Tras navegar/recargar se recupera por GET, sin otro POST externo. Si el servidor no tiene un resultado propio confirmado, se puede volver a seleccionar exactamente el mismo archivo para reenviar el intento; otro nombre, MIME, tamaño o hash no sustituye la solicitud pendiente. Una imagen distinta requiere resolver o cerrar un resultado definitivo y empezar otra carga.

Los adaptadores validan billetera, UUID, estados, dimensiones y URL HTTPS versionada de `res.cloudinary.com`, ligada a la identidad del recurso. Un QR pendiente no tiene URL seleccionable. El visor permite ampliar y reintentar imágenes sin escribir ni publicar. Una carga confirmada puede recuperarse aunque las nuevas cargas estén deshabilitadas.

## Recuperación local

Las operaciones sobreviven a recargar **esa pestaña** bajo la cuenta responsable. Se restauran como inciertas y no se reenvían automáticamente. El borrador que no llegó a enviarse y los bytes del archivo no se guardan de forma persistente; después de recargar una carga requiere consultar su resultado o volver a seleccionar el archivo original si hace falta reenviarlo.

Un registro local ilegible se conserva y bloquea nuevas escrituras. Cerrar o borrar el almacenamiento de la pestaña elimina la copia local, pero no las versiones o archivos registrados en el servidor. Conviene conservar la clave mientras el resultado sea incierto.

## Validación

La simplificación del 17 de noviembre pasó **1146 pruebas del frontend en 152 archivos**, **27 pruebas de servicio/contratos del backend**, tipos de ambos proyectos y producción Angular. Chrome verificó desactivación previa, carga y aplicación directa del QR, guardado y activación, recuperación después de recargar y conflicto con otro administrador a 1440/768/390 px. Todas las API de navegador fueron simuladas; no se cambiaron pagos reales. Evidencia: `.checkout-review/pagos-edicion-directa-validacion.json`. Las cifras y recorridos siguientes corresponden a la entrega inicial.

- **1015 pruebas aprobadas en 146 archivos**, incluidas **51 nuevas**: contratos, versión cero, permisos, identidad, cancelación, borradores, confirmación, conflictos, resultados históricos, respuestas perdidas, almacenamiento, hash de archivo, multipart, 202, GET 404 y recuperación tras recrear la aplicación.
- Compilación de producción sin avisos, TypeScript de aplicación/pruebas y formato correctos. La revisión de interfaz no encontró fallos; su único aviso se refiere a `padStart` para formar los dos dígitos de cada byte de SHA-256, sin relación con rótulos de interfaz.
- Chrome con Angular compilado, NestJS real, MySQL temporal exclusivo y transporte Cloudinary simulado: ocho recorridos y 39 capturas a 1440/768/390 px, más la revisión visual final. Las imágenes del dominio Cloudinary se interceptan y sirven exclusivamente desde el proveedor local de pruebas.
- Se verificaron versiones cero/1/2, carga con respuesta incierta y conciliación tras recarga, publicación 3 recuperada frente a vigente 4, conflicto entre dos ADMIN, lectura 503 y revocación. Cinco publicaciones conservaron referencias históricas con dos recursos, dos subidas virtuales y cero borrados, pedidos o reservas. No hubo errores JavaScript ni desbordamiento horizontal.
- Backend, Prisma, cliente generado, paquetes y configuración Angular conservan sus hashes. Las trece migraciones se aplicaron solamente al MySQL temporal con 42 tablas de dominio. No se leyó/modificó el `.env` real ni se contactó `soho_db`, Cloudinary o billeteras reales. Evidencia desde SOHO: `.checkout-review/configuracion-pagos-frontend/validacion.json`.

## Siguiente entrega

El [nuevo checkout](integracion-checkout-recepciones.md) ya conecta métodos, instrucciones, recepción, procesamiento y correcciones. Sigue la puesta en marcha controlada con receptores reales; Configuración → Tienda y posventa mantienen sus entregas independientes.
