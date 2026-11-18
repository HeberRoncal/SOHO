# Integración de cancelaciones y reservas retenidas

Fecha: 14 de noviembre de 2026 (America/Lima).

Administración → Pedidos utiliza la [API de cancelaciones](../../soho-backend/docs/api-cancelaciones.md) sobre la octava migración, ya aplicada por el usuario. Esta integración conserva el diseño existente, los siete distritos, precios, importes y datos históricos. No modifica las fuentes del backend ni requiere otra migración.

## Cancelar un pedido

El detalle ofrece **Cancelar pedido** antes del despacho, desde Pendiente, Confirmado, En preparación o Incidencia. El backend comprueba además que no haya despacho, consumo o movimientos de envío registrados. La interfaz usa los datos consultados del pedido; las opciones de demostración de Configuración → Inventario no cambian su política.

El formulario exige un motivo interno de diez a trescientos caracteres Unicode y una confirmación explícita. Solo administración recibe el motivo y el responsable. El cliente consulta el estado cancelado y su fecha. Un pago aprobado se conserva y la cancelación no realiza un reembolso; los demás pagos pasan a Anulado. Se mantienen las revisiones y archivos de los comprobantes.

El resumen de reservas distingue las cantidades de unidades:

- Las reservas históricas con `LIBERAR` se liberan automáticamente.
- Si hay reservas con `PREGUNTAR`, se exige elegir **Liberar para otras compras** o **Conservar reservadas y liberarlas después**. No hay una elección inicial.
- La elección afecta solo a las reservas consultadas. Las automáticas se liberan igualmente.
- Si no quedan reservas activas, no se ofrece una decisión sobre ellas.

`CancelacionesAdministracionApi` envía únicamente versiones de pedido y pago, confirmación, motivo y la decisión cuando corresponde. Reutiliza la fuente confirmada de `PagosAdministracionApi` y el interceptor de cookies y CSRF. No envía responsables, fechas, estados o cantidades elegidos en el navegador.

## Liberar las reservas conservadas

El detalle cancelado conserva la decisión original y muestra cuántas unidades siguen retenidas. Si la API permite liberarlas, ofrece **Liberar reservas retenidas**. El diálogo identifica la cantidad y exige confirmar la liberación de todas las reservas restantes; no solicita otro motivo de cancelación.

La liberación incrementa la versión del pedido y registra su fecha y responsable en la actividad interna. La cancelación original mantiene su fecha, motivo, responsable, versión y decisión `CONSERVAR`. El pago y su versión se conservan. No modifica existencias físicas ni registra un reembolso. Al terminar no quedan reservas activas y desaparece la acción de liberar.

## Errores, versiones y borradores

La ventana fija las versiones y estados consultados al abrirse. Una respuesta posterior no sustituye esas versiones silenciosamente. Guardar bloquea campos, doble envío, cierre y navegación durante la operación. Los errores conservan motivo y elección, muestran un resumen con foco y asocian los campos inválidos.

Un borrador modificado pide confirmación antes de cerrar o navegar. Recargar activa el aviso nativo del navegador. Los datos del formulario permanecen únicamente en memoria.

Ante conflicto o un resultado incierto se consulta el pedido sin repetir automáticamente el POST. Para recuperar una cancelación se comprueban la siguiente versión, responsable, motivo, decisión, estados anteriores, pago y unidades retenidas. Para una liberación se comprueban también la cancelación original intacta y el evento nuevo con el responsable. Si no puede confirmarse el resultado, se requiere **Actualizar pedido** antes de guardar nuevamente.

La actualización explícita conserva el borrador, adopta las versiones confirmadas y desmarca la confirmación para revisar nuevamente. Si otra operación ya canceló o despachó el pedido, o liberó sus reservas, la ventana mantiene bloqueada esa acción. Una respuesta de otra cuenta o revisión de sesión se descarta; perder autorización retira los datos privados.

Una acción equivalente realizada desde otra ventana de la misma cuenta podría producir el mismo resultado. Ante dudas sobre su autoría concreta, revisar fecha y actividad del pedido; no se repite una escritura para comprobarla.

## Mis pedidos y seguimiento

El adaptador público conserva exclusivamente `cancelacion.fecha`, aunque lleguen campos administrativos por error. Los pedidos cancelados anteriores sin registro mantienen la fecha ausente; no se inventa una.

Mis pedidos y el seguimiento de cuenta o invitado autorizado muestran la cancelación y su fecha en hora de Perú. El pago se presenta por separado: un cancelado con pago aprobado continúa mostrándolo y aclara que cancelar no realiza un reembolso. El seguimiento deja de anunciar etapas futuras o una corrección de comprobante para el pedido cancelado. Los datos históricos y el acceso privado al comprobante se conservan.

## Validación

Pasaron **606 pruebas de Angular**, incluidas 44 nuevas respecto de la integración anterior: contratos y privacidad, cookies y CSRF, decisiones, versiones de pedido y pago, liberación única, autorización, cambio de sesión, doble envío, borradores, respuesta perdida y bloqueo de formularios abiertos cuando otra operación termina el pedido o libera sus reservas. Pasaron TypeScript de aplicación y pruebas, formato y compilación de producción sin avisos.

Siete recorridos en Chrome con Angular y NestJS compilados y MySQL 8.0.46 temporal comprobaron cancelación automática, elección obligatoria, error 503, recuperación tras COMMIT en cancelación y liberación, comprobantes conservados, pago aprobado independiente, seguimiento privado y conflicto entre dos sesiones. Las capturas a 1440, 768 y 390 px no presentaron desbordamientos ni errores JavaScript. Los cuatro avisos del detector corresponden a imágenes con atributos Angular `[src]`, verificados en las plantillas y capturas.

Evidencia en `.checkout-review/cancelaciones-frontend/` desde la raíz SOHO. Las pruebas usaron datos sintéticos y una instancia MySQL exclusiva; no escribieron en `soho_db`, no enviaron notificaciones externas ni modificaron fuentes del backend, esquema o las ocho migraciones. Los servidores, perfiles de Chrome y el directorio de datos temporal se retiraron al terminar.

La configuración administrativa real de reservas, su trabajador de vencimientos, la cancelación después del despacho, reembolsos, devoluciones y reapertura requieren otras entregas.
