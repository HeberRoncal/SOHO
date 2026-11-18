# Esquema de recepción de compras y procedencia de comprobantes

Continuidad al 16 de noviembre de 2026: la [atención administrativa y las correcciones](api-atencion-recepciones.md) ya están implementadas sobre el esquema vigente. Sigue su integración Angular, manteniendo nuevas emisiones desactivadas. Las referencias del cuerpo a atención futura describen la etapa original de esta guía.

Continuidad al 16 de noviembre de 2026: el [procesamiento de recepciones](api-procesamiento-recepciones.md) ya registra pedido/pago pendiente/reservas o conserva evidencia para atención. Siguen atención ADMIN y Angular; las nuevas emisiones permanecen desactivadas por defecto. Las referencias del cuerpo a procesamiento futuro describen la etapa original de esta guía.

Preparado el 15 de noviembre de 2026, America/Lima, conforme al [diseño de instrucciones y recepción](analisis-instrucciones-pago.md). La decimotercera migración es [`20261115040000_recepciones_compra`](../prisma/migrations/20261115040000_recepciones_compra/migration.sql). Añade tres modelos y pasa de 39 a **42 tablas de dominio**.

**Estado:** esquema y SQL preparados y validados en MySQL temporal, cliente Prisma regenerado. El usuario confirmó posteriormente aplicada la decimotercera migración. La confirmación procede del usuario; el agente no volvió a ejecutarla ni comprobó su despliegue en `soho_db`. La preparación no contactó esa base ni proveedores. Posteriormente se implementaron [métodos/instrucciones](api-instrucciones-pago.md) y [recepción privada recuperable](api-recepciones-compra.md), conservando este esquema y la emisión desactivada por defecto. Siguen procesamiento/atención y Angular. Las referencias a una futura API de recepción en el cuerpo describen la etapa original del esquema.

## Modelos y compatibilidad

| Modelo                       | Finalidad                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RecepcionCompra`            | Referencia `REC-…`, instrucción/checkout y solicitud únicos, hash, estado/versión, motivos, fechas, comprobante actual y pedido/pago opcionales. Su propietario se obtiene de la instrucción.                                      |
| `ComprobanteRecepcionCompra` | Versiones de evidencia privada: identidad reservada antes de IO, hashes original/preparado, formato, bytes, nombre, operación informada y confirmación del archivo. Incluye leases y revisión para recuperar escrituras inciertas. |
| `OperacionRecepcionCompra`   | Intento y resultado recuperable: acción, clave/hash, actor/responsable, versiones, antes/después, respuesta/HTTP, motivo y fechas. Puede reservar la identidad y metadatos de la copia privada destinada al pedido.                |

La migración no inserta recepciones, archivos, operaciones, pedidos ni datos de demostración. Tampoco cambia precios, SKU, stock, reservas, cobertura o configuración comercial. Las doce migraciones anteriores conservan sus archivos y checksums.

`ComprobantePago.comprobanteRecepcionId` es nullable y único. Los comprobantes anteriores permanecen con `NULL`; no se inventan recepciones u orígenes a partir de su imagen o de la configuración vigente. Los demás cambios en modelos existentes son relaciones inversas e índices técnicos para las FK compuestas. No se modifican los valores de sus columnas anteriores.

## Recepción y comprobante actual

Los estados son `RECIBIENDO`, `RECIBIDA`, `REQUIERE_ATENCION` y `PEDIDO_CREADO`.

- `RECIBIENDO` conserva el intento sin anunciar evidencia confirmada: no tiene comprobante actual, fecha de recepción ni respuesta final.
- Los otros estados exigen comprobante actual, fecha válida y respuesta JSON objeto de la recepción inicial. Esa respuesta se conservará aunque cambie después el estado vigente.
- `REQUIERE_ATENCION` exige uno o más motivos tipados, únicos y conocidos; los demás estados tienen lista vacía. Las razones históricas se conservan en las operaciones.
- `PEDIDO_CREADO` exige UUID de pedido/pago y fecha de registro coherentes. Los demás estados no admiten esos vínculos parciales.

La FK del comprobante actual incluye el UUID de recepción y la constante `estadoComprobanteActual = DISPONIBLE`. Impide seleccionar un archivo pendiente o de otra recepción. Esa constante es un detalle de integridad, no un campo editable del futuro contrato HTTP. SQL garantiza el estado registrado y las relaciones; la futura API comprobará la existencia y contenido del archivo antes de confirmarlo.

Una recepción referencia una sola instrucción y una sola clave de checkout, que deben coincidir. Si se vincula al pedido, otra FK exige que sea el pedido de esa instrucción. El pago también debe pertenecer a ese pedido y usar esa misma instrucción; el vínculo previo de `PagoPedido` conserva la comprobación de método YAPE/PLIN.

El vencimiento de acceso invitado es opcional y, cuando existe, posterior al registro. El esquema no duplica ni acepta un propietario alternativo. La futura API validará si corresponde ese vencimiento, calculará sus treinta días y revalidará la identidad autorizada; el SQL no consulta la sesión ni el rol actual.

## Archivos privados y procedencia

Cada comprobante de recepción reserva una clave privada `comprobantes/<uuid>.png`, `.jpg` o `.webp` y registra el hash de los bytes originales y preparados. Los metadatos exigen MIME/extensión coherentes, tamaño entre 1 byte y 5 MiB y nombre válido. El número de operación, si existe, conserva de uno a doce dígitos como texto, incluidos sus ceros iniciales.

Los estados de almacenamiento son `PENDIENTE` y `DISPONIBLE`. Confirmar disponibilidad exige fecha válida y liberar el lease y la revisión pendiente. Un archivo pendiente no puede asignarse como origen de un pago. Los pares token/vencimiento se guardan completos; no bastan un token suelto o una fecha anterior a la creación.

`pagoDestinoId` se vinculará una vez desde la futura API al pago de su propia recepción. Las FK de procedencia exigen que el comprobante del pedido use ese pago y conserve SHA-256 preparado, formato y cantidad de bytes. Una versión fuente no puede originar dos comprobantes de pago; tampoco puede vincularse al pago de otra compra. Las versiones anteriores se conservan con `RESTRICT`.

La copia del pedido usa una clave privada nueva y mantiene esos mismos bytes, como define el análisis. `OperacionRecepcionCompra` puede reservar clave/hash/formato/bytes/estado de esa copia antes de escribirla. El conjunto se guarda completo y la FK exige contenido idéntico al comprobante fuente seleccionado. Las acciones de copia son `PROCESAR` y `REGISTRAR_PEDIDO`; una operación confirmada no puede dejar la copia pendiente, y el registro administrativo confirmado exige una copia.

La futura implementación deberá comprobar que la clave de copia sea distinta de la fuente, escribir/verificar bytes, vincular la copia correcta al comprobante del pago y conservarla ante un COMMIT incierto. SQL no inspecciona disco ni calcula hashes. Esta entrega no escribe, copia ni elimina imágenes reales.

## Operaciones y auditoría

Las acciones son `PROCESAR`, `REGISTRAR_PEDIDO`, `SOLICITAR_CORRECCION` y `ADJUNTAR_COMPROBANTE`. Cada operación selecciona un comprobante de su misma recepción y conserva clave única, hash y versión esperada positiva.

`PENDIENTE` conserva el intento y `antes`, sin respuesta, HTTP, fecha final ni versión resultante. `CONFIRMADA` exige respuesta/después como objetos JSON, HTTP 2xx, fecha final y versión resultante igual a la esperada o incrementada en una unidad; admite un resultado sin cambios sin inventar una transición. `RECHAZADA` conserva un resultado de cliente 4xx, versión resultante y auditoría final. Un error 5xx incierto no se registra como decisión final rechazada. Ambas terminaciones liberan el lease y la revisión pendiente.

`REGISTRAR_PEDIDO` y `SOLICITAR_CORRECCION` exigen actor declarado ADMIN, responsable y motivo. Solicitar corrección también exige un mensaje. Para actor CLIENTE/ADMIN se conserva un usuario responsable; SISTEMA no lo tiene y permite representar al invitado siguiendo el patrón existente. La comprobación de sesión, rol real, propietario y autorización para cada acción corresponde a la futura API; declarar el actor no prueba ese permiso.

Las respuestas, snapshots, motivo y acción serán inmutables después de finalizar por las reglas del servicio. Las restricciones no convierten por sí solas una fila en un historial de solo inserción ni comprueban profundamente la forma del contrato dentro de todos los objetos JSON.

## Orden de vinculación para la futura API

Las FK se comprueban inmediatamente. El registro se realizará en una sola transacción, después de preparar una copia privada confirmada:

1. Crear pedido, artículos/unidades y reservas completas, inicialmente sin el pago.
2. Vincular la instrucción a ese UUID y clave de creación de pedido.
3. Crear el pago con esa instrucción, todavía sin su comprobante inicial.
4. Vincular la recepción a pedido/pago con estado `PEDIDO_CREADO` y fecha válida.
5. Vincular el comprobante fuente a ese pago mediante `pagoDestinoId`.
6. Crear `ComprobantePago` con la copia privada y `comprobanteRecepcionId`; registrar el resultado recuperable y confirmar todo junto.

Antes de esto se insertan recepción `RECIBIENDO` y comprobante pendiente; se confirma el archivo y después la recepción. Las relaciones cíclicas no permiten insertar todos los vínculos finales desde la primera fila. Un fallo durante el registro del pedido deberá revertir esa transacción y mantener la recepción/archivo previamente confirmados.

La futura API validará disponibilidad completa, propietario del pedido, método, condiciones originales y política de reservas, y resolverá concurrencia con sus bloqueos. Esta migración solo prepara estructura: no crea reservas, aprueba pagos, inicia procesamiento ni expone destinos para transferir.

## SQL y validación

La base del SQL se generó mediante `prisma migrate diff` entre el esquema anterior y el nuevo. Se añadieron `CHECK` para identidades, versiones, hashes, estados, fechas, metadatos completos, leases, JSON, actores y resultados, con validación explícita de nulos. Los motivos usan `JSON_SCHEMA_VALID` inline. Requiere MySQL 8.0.17 o posterior, igual que la ampliación comercial anterior; se probó con **MySQL 8.0.46**. Referencias: [validación JSON](https://dev.mysql.com/doc/refman/8.0/en/json-validation-functions.html), [CHECK](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html) y [FK inmediatas](https://dev.mysql.com/doc/refman/8.0/en/ansi-diff-foreign-keys.html).

Pasaron **1457 pruebas del backend**: 807 unitarias, nueve HTTP generales, 545 de regresión MySQL —incluidas las 103 nuevas del esquema—, 59 de la API de Pagos/QR y 37 de Clientes. Verifican recepción sin pedido, confirmación por pasos, atención sin reservas, versiones anteriores, origen correcto, vínculos cruzados, claves duplicadas, copia recuperable, resultados parciales, UUID/hash/JSON inválidos, fechas, leases, actores y conservación con `RESTRICT`. No son pruebas funcionales de los endpoints de recepción todavía pendientes.

Se aplicaron las trece migraciones desde cero y se actualizó una base con las doce anteriores y datos sintéticos. Las 39 tablas anteriores conservaron exactamente los valores de todas sus columnas previas: compras, pagos pendientes/aprobados, comprobantes, cancelación, reservas, movimientos, agenda, versiones comerciales, QR e instrucciones vinculadas y no vinculadas. Los tres comprobantes previos quedaron sin origen inventado. Un segundo deploy no encontró pendientes ni alteró esos datos. Se comprobaron 42 tablas, checksums de las trece migraciones y estructuras nuevas vacías en cuatro bases temporales; el diff representable por Prisma quedó vacío.

Pasaron formato/validación Prisma, regeneración del cliente, compilación NestJS, TypeScript completo, lint sin avisos y formato. Las fuentes de backend no generado y Angular, las doce migraciones anteriores y las pruebas previas conservaron sus archivos. No hubo acceso a `soho_db` ni a proveedores. Evidencia: `.checkout-review/recepciones-esquema/validacion.json`.

## Aplicación local y siguiente entrega

Comandos de aplicación desde `soho-backend`, conservados como referencia; el usuario ya confirmó aplicada la [decimotercera migración](../prisma/migrations/20261115040000_recepciones_compra/migration.sql):

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

El primer comando aplica los SQL pendientes en la conexión local del usuario; el segundo regenera el cliente y no migra datos. El cliente ya fue regenerado durante la preparación; repetir el comando reproduce ese paso. Aplicar la migración antes de iniciar el backend con el nuevo cliente, que incluye la columna opcional de procedencia en sus consultas.

No se necesita seed, reset ni repetir la conversión del catálogo. El usuario confirmó aplicada esta migración, además de las doce anteriores. No se generaron piezas NestJS en la preparación del esquema. Posteriormente se implementaron [métodos/instrucciones](api-instrucciones-pago.md) y [recepción privada recuperable](api-recepciones-compra.md), sin otra migración ni regeneración del cliente. Sigue procesamiento idempotente, después atención ADMIN y Angular, generando piezas nuevas con Nest CLI y manteniendo la activación pendiente hasta cerrar el recorrido completo.
