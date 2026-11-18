# Esquema inicial de pedidos, pagos y reservas

Fecha: 14 de noviembre de 2026 (America/Lima).

La sexta migración, `20261114000000_pedidos_iniciales`, añadió nueve modelos al esquema Prisma y llevó el total a veinticuatro tablas de negocio. Está preparada y comprobada en MySQL temporal; **no se aplicó a `soho_db` durante su preparación**. Las cinco migraciones anteriores permanecen intactas. La preparación del esquema no añadió endpoints; la [API de pedidos](api-pedidos.md), la conexión al checkout y la [revisión de pagos](api-pagos.md) se implementaron posteriormente. La séptima migración amplía el esquema a veinticinco tablas con el [registro de envíos](esquema-envios.md), sin alterar este núcleo.

## Modelos y relaciones

| Modelo Prisma          | Tabla                      | Responsabilidad                                                                                                                         |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Pedido`               | `pedidos`                  | Identidad, propietario opcional, acceso de invitado, contacto y domicilio históricos, cotización, importes, estado de entrega y versión |
| `PedidoArticulo`       | `pedido_articulos`         | Variante y copia histórica de SKU, nombre, color, talla, imagen, cantidad, precio y descuento                                           |
| `PedidoArticuloUnidad` | `pedido_articulo_unidades` | Par lógico y reparto exacto del descuento para futuras devoluciones parciales                                                           |
| `PedidoFacturacion`    | `pedido_facturacion`       | Datos solicitados para boleta o factura, uno por pedido                                                                                 |
| `PagoPedido`           | `pagos_pedido`             | Método y estado agregado del pago manual, uno por pedido                                                                                |
| `ComprobantePago`      | `comprobantes_pago`        | Versiones de archivos privados y la revisión propia de cada versión                                                                     |
| `ReservaInventario`    | `reservas_inventario`      | Historial de cantidades reservadas por artículo y política aplicada                                                                     |
| `ConfiguracionReserva` | `configuracion_reserva`    | Política única de duración, vencimiento y cancelación                                                                                   |
| `EventoPedido`         | `eventos_pedido`           | Historial ordenado, responsable y visibilidad para cliente o interna                                                                    |

Un usuario puede tener varios pedidos; un invitado conserva `usuarioId = NULL`. Cada artículo referencia una `Variante` existente y pertenece a un pedido. La combinación `(pedidoId, varianteId)` es única: dos pares iguales se agrupan en una línea. El SKU es único en el catálogo y puede repetirse entre pedidos. La posición de línea también es única dentro del pedido.

Cada unidad tiene UUID y número único dentro de su línea. No representa un nuevo SKU ni un número de serie físico. El número comienza en uno. Por ejemplo, dos pares de S/ 99.99 con descuento conjunto de S/ 0.01 conservan netos de S/ 99.98 y S/ 99.99. El futuro servicio guardará ese reparto en lugar de recalcularlo con promociones posteriores.

Las claves foráneas conservan `Restrict` para borrado y actualización. Las relaciones inversas añadidas a `Usuario` y `Variante` no modifican sus columnas ni sus filas. La facturación y el pago son relaciones uno a uno; el servicio deberá crear sus registros obligatorios junto con el pedido. La clave foránea por sí sola no exige que todo pedido tenga ambos hijos.

## Identidad, propiedad y datos históricos

- Los ID usan UUID de 36 caracteres, generados por Prisma. El código visible admite `SOHO-` y de seis a veinticuatro letras mayúsculas o números. El código no autoriza consultar un pedido.
- `claveCreacion` es un UUID único para impedir duplicar una creación repetida. `solicitudHash` guarda SHA-256 de la solicitud normalizada. La API deberá comprobar también propietario y contenido antes de reutilizar una respuesta.
- Un pedido registrado referencia al usuario de la sesión. Un invitado requiere `accesoInvitadoHash` y vencimiento; solo se almacena el hash, nunca el secreto. Los pedidos registrados conservan esos campos nulos. Un correo coincidente no atribuye una compra de invitado a una cuenta.
- Contacto, destinatario completo, distrito, provincia, departamento, dirección, referencia y plazo son copias históricas. No dependen de una fila editable de la agenda. Los nombres admiten hasta 80 caracteres, de acuerdo con el perfil existente.
- El código y nombre del distrito se copian después de cotizar. No se añade una relación que reemplace el nombre o la tarifa históricos al editar cobertura. Se conservan los siete distritos existentes; la migración no altera su configuración. La Esperanza conserva costo de envío cero.
- La imagen del artículo conserva una ruta; su disponibilidad futura requerirá una política de conservación de archivos. Guardar una ruta histórica no conserva por sí solo el archivo.

El domicilio, los artículos y los importes se tratarán como históricos en el servicio. Esta migración no añade disparadores que prohíban toda edición SQL directa.

## Importes y facturación

Todos los importes usan `Decimal`, en PEN. Precio unitario e importes por unidad usan `DECIMAL(8,2)`; acumulados de líneas y pedido usan `DECIMAL(14,2)`. La cantidad por línea admite de uno a 99,999, coherente con el límite existente de inventario. La API deberá imponer los límites comerciales de cantidad y tamaño de pedido.

Los `CHECK` exigen subtotal positivo, descuento no negativo y no superior al subtotal, envío no negativo y `total = subtotal - descuento + costoEnvio`. En cada línea se comprueba `importeBruto = precioUnitario * cantidad` y `importeNeto = importeBruto - descuento`. Cada unidad comprueba su importe bruto, descuento y neto. Los campos opcionales pendientes se representan con `NULL`.

La suma entre tablas se comprobará en la transacción de creación: subtotal y descuento del pedido deben coincidir con las líneas; el número de unidades debe coincidir con la cantidad; sus importes deben reconciliar con la línea. Un `CHECK` de fila no garantiza esas sumas.

La boleta admite DNI de ocho dígitos, CE de nueve a doce caracteres alfanuméricos o pasaporte de seis a doce. La factura requiere tipo RUC, su formato de once dígitos conforme al formulario actual, razón social y domicilio fiscal. Los números se guardan como texto para conservar ceros iniciales. Esto prepara datos de facturación; no implementa emisión fiscal ni validación externa del documento.

`cuponCodigo` es una referencia histórica opcional. No crea un catálogo de cupones ni convierte `DEMO10` en una promoción comercial.

## Pagos y comprobantes

`PagoPedido.estado` admite `PENDIENTE`, `OBSERVADO`, `APROBADO`, `RECHAZADO` y `ANULADO`; los métodos son `YAPE` y `PLIN`. La entrega se mantiene separada en `Pedido.estadoEntrega`: `PENDIENTE`, `CONFIRMADO`, `EN_PREPARACION`, `INCIDENCIA`, `ENVIADO`, `ENTREGADO` y `CANCELADO`.

Cada comprobante tiene versión única dentro de su pago. Su revisión admite `PENDIENTE`, `OBSERVADO`, `APROBADO` y `RECHAZADO`. Anular el pago no borra ni sustituye revisiones anteriores. La futura API podrá presentar el comprobante vigente como anulado conforme a la pantalla administrativa, manteniendo su revisión almacenada.

La revisión pendiente conserva revisor, fecha, motivo, mensaje y solicitud de corrección nulos. Una revisión final requiere responsable y fecha posterior o igual a la presentación. Observar exige motivo, mensaje de diez a quinientos caracteres y petición de imagen legible o corregida. Rechazar exige motivo y mensaje; aprobar conserva esos campos de observación nulos. El rol `ADMIN` del revisor se comprobará en el servicio, pues la clave foránea solo verifica que exista.

Se guarda una clave única de objeto privado bajo `comprobantes/`, hash SHA-256 del archivo, nombre original, MIME y tamaño. No se guarda base64 ni una URL pública o temporal. Los formatos previstos son PNG, JPEG y WebP de uno a 5 MiB. El monto informado es opcional y no negativo; el número de operación opcional admite hasta doce dígitos y conserva ceros iniciales. Los metadatos no prueban la existencia ni el contenido del archivo: la carga real y su validación pertenecen a la próxima integración.

El servicio deberá revisar exclusivamente la versión vigente pendiente, comprobar concurrencia, mantener coherentes el estado agregado y la revisión y añadir un evento. Una corrección añadirá otra versión al mismo pago y pedido. Aprobar confirmará el pedido; rechazar el pago no cancelará automáticamente el pedido. Cancelar un pedido pagado conservará `APROBADO`; el reembolso será otro registro en una etapa posterior.

## Reservas y configuración

La migración incorpora una sola fila de configuración, ID 1, versión 1: `HASTA_DECISION`, sin duración ni vencimiento, y `LIBERAR` al cancelar. Es la configuración inicial expresada en el frontend. No crea reservas ni cambia existencias. `TIEMPO` exige de una a 999,999 horas y una acción al vencer: `LIBERAR_Y_ALERTAR` o `SOLO_ALERTAR`. La cancelación admite `LIBERAR` o `PREGUNTAR`.

La [API de configuración de reservas](api-configuracion-reservas.md) ya consulta y guarda esta política con ADMIN y control de versiones, sin ampliar el esquema. Su integración Angular ya está implementada y los nuevos cambios temporales permanecen bloqueados hasta implementar vencimientos.

Cada reserva guarda la versión y copia de política aplicada. Cambiar la configuración no reescribe reservas anteriores. Una reserva temporal exige un vencimiento igual a su creación más la duración aplicada. `vencimientoAtendidoEn` permite registrar la atención del vencimiento sin volver a generar alertas en cada ejecución.

El estado admite `ACTIVA`, `LIBERADA` o `CONSUMIDA`. Vencer y solo alertar mantiene `ACTIVA`; la mera comparación de la fecha no libera inventario. Un cierre requiere fecha y motivo, conservando la fila histórica. Un índice funcional SQL permite como máximo una reserva activa por artículo y varias cerradas.

Las reglas operativas que deberá implementar el servicio son:

1. Crear el pedido y comprobante junto con las reservas y el incremento de `Variante.cantidadReservada`, verificando disponibilidad y concurrencia en la misma transacción.
2. Mantener las reservas de un pago observado conforme a su política. Aprobar el pago confirma el pedido y no descuenta stock físico.
3. Al registrar el envío, consumir las reservas, reducir el contador reservado, descontar existencias y añadir los movimientos históricos en una transacción.
4. Liberar, consumir o atender vencimientos una sola vez. La suma de reservas activas debe conciliar con el contador de la variante.

No se modifica la regla existente que permite un ajuste físico por debajo de las reservas. Esa situación requiere tratar una incidencia antes de enviar. La revisión administrativa implementada libera las reservas activas al rechazar el pago, sin cancelar automáticamente el pedido ni realizar un reembolso. Las decisiones manuales de liberación y el vencimiento requieren operaciones posteriores. Consultar [API de pagos](api-pagos.md).

## Historial y alcance

Los eventos tienen secuencia única por pedido, versión del pedido, tipo, actor y responsable. `SISTEMA` requiere responsable nulo; `ADMIN` y `CLIENTE` requieren un usuario. La comprobación de identidad y rol corresponde a la sesión. La visibilidad comienza en `INTERNA`; una nota interna no puede marcarse como visible para el cliente. El servicio tratará el historial como solo inserción y entregará al público una selección explícita de campos y eventos.

Esta entrega no crea modelos de envíos, cancelaciones, solicitudes posventa, evidencias, notas posventa o reembolsos. Las ampliaciones posteriores están en [Preparación y envíos](esquema-envios.md) y [Cancelaciones](esquema-cancelaciones.md); esta última incorpora la octava migración, cuya aplicación local confirmó el usuario. Las relaciones con unidades y los estados preparan esas ampliaciones. Tampoco incorpora configuración real de QR y cuentas de Yape/Plin, tareas programadas, notificaciones o movimientos comerciales automáticos.

No fue necesario generar componentes NestJS para modificar el esquema y sus pruebas SQL. El recurso y las piezas de la API posterior se generaron con Nest CLI según `AGENTS.md` y se adaptaron después a Prisma y ESM. `src/generated/prisma` se regeneró mediante Prisma, sin edición manual.

## Aplicación y validación

La sexta migración está pendiente de aplicación local por el usuario. Desde `soho-backend`, para aplicar únicamente las migraciones pendientes y regenerar el cliente:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

No se requiere volver a cargar el catálogo ni restablecer datos. La migración crea las nueve tablas, índices, restricciones y la fila inicial de configuración. No modifica estructura ni datos de las quince tablas anteriores.

La comprobación utilizó dos bases temporales en MySQL 8.0.46: una con las cinco migraciones y datos sintéticos, y otra vacía para desplegar las seis. Se verificó conservación de estructura y datos de las quince tablas, incluidos importes configurados de cobertura, y los hashes de las cinco migraciones previas.

Pasaron **113 comprobaciones SQL nuevas**, más las **180 previas**: **293 en total**. El cliente Prisma verificó creación anidada, relaciones de los nueve modelos, UUID, céntimos por unidad, datos históricos tras editar perfil, catálogo y agenda, versiones de comprobante, control de versión y propiedad de invitado. El segundo despliegue conservó una política de reserva modificada. El diff no encontró cambios representables pendientes; los `CHECK` y el índice funcional se verificaron mediante SQL.

También pasaron las **274 pruebas del backend**: 179 unitarias, nueve HTTP y 86 con MySQL, además de validación y formato de Prisma, generación del cliente, compilación, TypeScript completo y lint. Los resultados detallados quedan en `.checkout-review/pedidos-esquema/` desde la raíz SOHO. Las pruebas SQL revierten sus filas y eliminan los procedimientos auxiliares. Ejecutarlas exclusivamente en una base temporal terminada en `_test`, con seis migraciones, y sin `--force`. Angular no cambió en esta entrega. La base local, el SMTP y sus credenciales permanecieron intactos.
