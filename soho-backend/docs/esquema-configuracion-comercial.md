# Esquema de configuración comercial

Preparado el 15 de noviembre de 2026, America/Lima, conforme al [análisis de Pagos y Tienda](analisis-configuracion-comercial.md). La duodécima migración es [`20261115030000_configuracion_comercial`](../prisma/migrations/20261115030000_configuracion_comercial/migration.sql). El esquema pasa de 32 a 39 tablas de dominio; las once migraciones anteriores conservan sus archivos y checksums.

**Estado:** SQL validado en MySQL temporal y cliente Prisma regenerado. El usuario confirmó posteriormente aplicada la duodécima migración. La confirmación procede del usuario; el agente no volvió a ejecutarla ni verificó su despliegue en `soho_db`. La preparación no consultó ni modificó esa base, no contactó Cloudinary y no implementó rutas ni cambios Angular. Posteriormente se implementó la [API administrativa de Pagos y QR](api-configuracion-pagos.md), sin otra migración; siguen instrucciones/checkout y Tienda.

## Modelos

El [diseño posterior de instrucciones/recepción](analisis-instrucciones-pago.md) identifica otra necesidad: almacenar comprobantes antes de un pedido válido. Estos siete modelos permiten instrucciones y configuración, pero `ComprobantePago` sigue requiriendo un pago y pedido. El [esquema de la decimotercera migración](esquema-recepciones-compra.md) ya está preparado y validado para esa recepción privada, sin modificar esta duodécima. El usuario confirmó su aplicación local; las API de recepción y atención todavía no están implementadas.

| Modelo                       | Finalidad                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ConfiguracionPagos`         | Control único con puntero a la publicación vigente.                                                                          |
| `VersionConfiguracionPagos`  | Número de versión, responsable, fecha, clave/hash de solicitud y respuesta recuperable.                                      |
| `MetodoPagoConfigurado`      | Cuenta receptora YAPE o PLIN de una publicación, con activación, celular, titular y QR opcional.                             |
| `ArchivoQrPago`              | Identidad Cloudinary, contenido, confirmación, conciliación y limpieza de un QR público.                                     |
| `InstruccionPago`            | Método versionado mostrado antes de transferir, propietario, preparación e importe de referencia, con respuesta recuperable. |
| `ConfiguracionTienda`        | Control y publicación vigente independientes de Pagos.                                                                       |
| `VersionConfiguracionTienda` | Contacto, horario, dos enlaces, tres políticas y auditoría de cada publicación.                                              |

La migración inserta únicamente las dos filas de control, con `id = 1` y `versionActualId = NULL`. Esto representa la versión pública cero, sin publicaciones, métodos habilitados, beneficiarios, QR ni textos de ejemplo. La futura API debe interpretar ese estado y publicar cada apartado de forma independiente.

## Pagos y QR

Los métodos admitidos siguen siendo `YAPE` y `PLIN`. La clave única por versión y método impide repetirlos. Un método activo exige celular de nueve dígitos que empiece por 9 y titular no vacío de hasta 120 caracteres; QR es opcional. Un método desactivado admite datos pendientes, aunque los datos presentes deben ser válidos.

El QR tiene dominio propio: no pertenece a `ArchivoImagen` de productos ni al almacenamiento privado de comprobantes. Guarda cuenta Cloudinary, `publicId`, `assetId`, versión, URL HTTPS, tipo de recurso/entrega, carpeta, hash SHA-256, formato, dimensiones y bytes. Reserva una identidad única antes de subir y dispone de claves, bloqueos, intentos y fechas para recuperar cargas inciertas y limpiar archivos no referenciados.

La carpeta sigue `SOHO/pagos/yape/<identificador>` o `SOHO/pagos/plin/<identificador>`. El contenido admite PNG/JPEG/WebP, de 1 byte a 2 MiB y de 1 a 4096 píxeles por eje. Los metadatos de confirmación se guardan completos; un archivo disponible o en eliminación exige esa confirmación. La futura carga deberá decodificar y validar el archivo, rechazar animación y comprobar los metadatos del proveedor. SQL no verifica los bytes ni que el QR corresponda al beneficiario.

Una clave foránea compuesta obliga a que el QR y el método configurado correspondan a la misma billetera. Las referencias usan `RESTRICT`: un QR utilizado por una versión histórica no puede borrarse de MySQL. La futura limpieza también debe comprobar esas referencias antes de tocar Cloudinary.

## Instrucciones y pedidos

La instrucción referencia un método de una publicación concreta y guarda moneda PEN, importe de referencia, hash de la preparación verificada, clave de creación del pedido y clave/hash/respuesta de emisión. Tiene exactamente un propietario: cuenta o hash de acceso invitado. Emitirla no crea un pedido, reserva stock ni aprueba un pago.

`pedidoId` comienza en `NULL`. Al crear finalmente el pedido, la clave foránea compuesta exige que coincidan su UUID y su `claveCreacion` con los de la instrucción. `PagoPedido.instruccionId` también es opcional; cuando existe, otra clave foránea exige la misma instrucción, pedido y método. Las claves únicas impiden usarla en dos pagos o vincular dos instrucciones al mismo pedido. Pueden existir varias emisiones todavía no vinculadas para una misma clave de checkout, por ejemplo al cambiar de método.

La futura creación debe ejecutar dentro de una sola transacción:

1. Validar identidad, instrucción, preparación y reglas vigentes de pedido.
2. Crear el pedido y sus demás datos, inicialmente sin la fila de pago.
3. Vincular la instrucción al pedido mediante una actualización condicional.
4. Crear el pago con esa referencia y completar la transacción.

Las claves foráneas de MySQL se comprueban inmediatamente; ese orden evita un ciclo de inserción. Cualquier fallo debe revertir todo. La aplicación tendrá que impedir cambiar el destino de una instrucción y permitir su vinculación una sola vez; las restricciones por sí solas no convierten una fila en inmutable. Debe comprobar también que el propietario coincida con el del pedido, sin inferirlo del correo.

Los pagos anteriores quedan con `instruccionId = NULL`; no se inventan destinos históricos. La API existente sigue pudiendo crear pagos sin esa referencia hasta integrar el nuevo contrato. La recuperación de solicitudes antiguas debe conservar sus reglas antes de exigir una instrucción a compras nuevas.

Cambiar o desactivar la configuración futura no debe reescribir instrucciones ni destinos anteriores. La instrucción no tiene vencimiento automático. Los cambios de precio, stock o tarifa posteriores a transferir requieren el tratamiento descrito en el análisis antes de habilitar cobros reales; este esquema no inmoviliza esas condiciones.

## Contenido de Tienda

Cada versión admite correo de atención de hasta 160 caracteres, WhatsApp nacional, horario de hasta 160, exactamente dos posiciones de enlace y textos de cambios, privacidad y términos de hasta 10000 caracteres cada uno. Los campos pendientes son `NULL`; cada enlace conserva `{ texto, url }`, con `url: null` si está pendiente. Un enlace publicado exige texto válido y URL HTTP(S), sin credenciales ni espacios.

Las políticas son texto plano, con saltos de línea y tabulaciones permitidos. El esquema no registra aceptación de términos ni implementa devoluciones o reembolsos. La futura API debe normalizar, validar y servir este contenido; los consumidores deben omitir datos pendientes.

## Alcance de las restricciones

Prisma declara relaciones, tipos, índices y unicidad. La migración añade `CHECK` para identidad UUID, hashes, datos completos, estados, propietarios y contenido comercial, incluido `JSON_SCHEMA_VALID` para los enlaces. Requiere **MySQL 8.0.17 o posterior**; se probó con 8.0.46. La validación JSON en `CHECK` sigue la [documentación oficial de MySQL](https://dev.mysql.com/doc/refman/8.0/en/json-validation-functions.html); el orden de inserción sigue sus [reglas de claves foráneas](https://dev.mysql.com/doc/refman/8.0/en/create-table-foreign-keys.html).

Las API futuras todavía deben validar ADMIN/CSRF, versión esperada, claves idempotentes y respuestas, publicar YAPE/PLIN juntos, exigir QR disponible, conservar las publicaciones e instrucciones y bloquear conflictos con limpieza o creación de pedidos. Los `CHECK` no prueban el rol del responsable, la disponibilidad de otra fila, la cantidad exacta de métodos por publicación ni la igualdad de propietarios entre tablas. Los textos presentes en JSON se validarán también en los contratos; SQL solo exige un objeto para las respuestas recuperables.

Esta entrega no genera piezas NestJS. Los nuevos módulos, controladores, servicios y contratos de las siguientes entregas se crearán con el generador local de Nest CLI.

## Validación y aplicación local

Pasaron **1252 pruebas**: 764 unitarias, nueve HTTP, 442 de regresión MySQL —incluidas las 92 nuevas del esquema— y 37 de Clientes. También pasaron validación y formato Prisma, regeneración del cliente, compilación NestJS, TypeScript completo y lint sin avisos.

Se aplicaron las doce migraciones desde cero y se comprobó una actualización desde las once anteriores con datos sintéticos de compras, pagos pendientes/aprobados, comprobantes, cancelación, reservas y movimientos. Las 32 tablas anteriores conservaron exactamente sus columnas de datos originales y los tres pagos de prueba quedaron sin instrucción inventada. Un segundo despliegue no encontró migraciones pendientes ni alteró esos datos. Los checksums y las 39 tablas se comprobaron en tres bases temporales; el diff de estructura representable por Prisma quedó vacío.

La evidencia se guarda en `.checkout-review/configuracion-comercial-esquema/validacion.json`. Las bases usaron una instancia independiente en loopback y nombres terminados en `_test`; nunca `soho_db` como alternativa.

Comandos de aplicación desde `soho-backend`, conservados como referencia; el usuario ya confirmó aplicada esta migración:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

El primer comando aplica las migraciones pendientes en la conexión local configurada por el usuario; el segundo regenera el cliente y no aplica SQL. No se necesita seed, reset ni repetir la conversión de productos. La aplicación ya fue confirmada y la [API administrativa de Pagos y QR](api-configuracion-pagos.md) está implementada; siguen instrucciones y checkout, y el circuito independiente de Tienda.
