# API de preparación y envíos

Implementada sobre la séptima migración `20261114010000_preparacion_envios`, ya aplicada por el usuario. Esta entrega no añade migraciones. Las nuevas piezas se generaron con Nest CLI y se adaptaron a Prisma, sesiones, validación y ESM.

Continuidad de inventario: el despacho utiliza además `versionExistencias`, incorporada por la [undécima migración](esquema-movimientos-inventario.md). Al descontar cada variante incrementa su versión física dentro de la misma transacción y conserva la salida única por envío/variante. Una versión agotada rechaza y revierte el despacho completo. Entregar no cambia el físico ni esa versión. Esto permite detectar cambios simultáneos desde la [API de movimientos manuales](api-movimientos-inventario.md).

## Rutas y contrato

Las tres operaciones requieren sesión `ADMIN`, origen autorizado y `X-CSRF-Token`. Devuelven `200`, `Cache-Control: no-store` y `{ pedido }` con el mismo detalle administrativo de `GET /api/admin/pedidos/:codigo`, incluida su nueva versión. El límite de consultas administrativas también se aplica a estas operaciones.

| Ruta POST                                | Estado previo    | Estado resultante | Cuerpo adicional                         |
| ---------------------------------------- | ---------------- | ----------------- | ---------------------------------------- |
| `/api/admin/pedidos/:codigo/preparacion` | `CONFIRMADO`     | `EN_PREPARACION`  | Ninguno                                  |
| `/api/admin/pedidos/:codigo/envio`       | `EN_PREPARACION` | `ENVIADO`         | `transportista`, `referenciaSeguimiento` |
| `/api/admin/pedidos/:codigo/entrega`     | `ENVIADO`        | `ENTREGADO`       | `confirmado: true`                       |

En todas las rutas se exige `versionPedido`, entero entre 1 y 4294967294. `nota` es opcional, privada y de hasta 300 caracteres; admite saltos de línea. Transportista admite entre dos y ochenta caracteres y referencia entre tres y ochenta, después de recortar espacios. Se conservan los ceros iniciales. No se admiten controles ni caracteres de formato invisibles. Se rechazan campos ajenos a cada acción; el cliente no elige estados, fechas, responsables ni importes.

Ejemplo de despacho después de consultar la versión actual:

```json
{
  "versionPedido": 3,
  "transportista": "Reparto SOHO",
  "referenciaSeguimiento": "000123",
  "nota": "Verificar el embalaje antes de salir."
}
```

La referencia admite reparto local; no exige contratar un courier. Se trata como texto, nunca como URL ni instrucción para consultar un servicio externo.

## Reglas de escritura

Las tres acciones exigen pago `APROBADO` y exactamente el estado previo de la tabla. `PENDIENTE`, `INCIDENCIA` y `CANCELADO` bloquean el avance. No se permite saltar etapas ni repetir una acción ya registrada, aunque se envíe la versión actual. No se cambia la versión ni el estado del pago.

Cada acción corre en una transacción. Se vuelve a consultar y bloquear la sesión y su usuario para comprobar vigencia, actividad y rol; después se bloquean pedido y pago. Se comparten estas operaciones con revisión de pagos mediante `EscrituraPedidoService`. Solo se reintentan automáticamente los conflictos de transacción que Prisma identifica como revertidos (`P2034`), hasta tres intentos.

Preparar crea un único `EnvioPedido`, fecha de servidor y responsable. Comprueba las reservas activas completas de cada artículo y la coherencia del inventario, sin modificar existencias ni contadores reservados.

Enviar vuelve a comprobar las reservas, bloquea las variantes por identificador y verifica que su contador coincida con la suma de reservas activas de todos los pedidos. El stock físico debe cubrir ese total: no basta con cubrir únicamente este despacho. Una diferencia devuelve conflicto para revisar inventario y conserva el pedido en preparación.

En la misma transacción se registran transportista y seguimiento, se consumen las reservas del pedido y se descuentan existencias y reservado. Se crea una `SALIDA` de origen `ENVIO_PEDIDO` por variante, con cantidad negativa, saldos físicos, reservado posterior, habilitación, responsable, fecha y relación con el envío. La unicidad por envío y variante y la versión del pedido impiden una segunda salida. Un fallo en cualquier línea revierte también las anteriores, el envío, estado e historial.

Entregar exige confirmación explícita y un despacho coherente con sus reservas consumidas y movimientos. Conserva fecha, responsable y metadatos originales del despacho. Registra fecha de entrega y responsable actual, sin volver a modificar inventario. La fecha de cada etapa no puede preceder a la anterior.

El vencimiento de una fecha no libera reservas de pedidos aprobados. La API conserva la política histórica y no ejecuta un trabajador de vencimientos. Tampoco vuelve a cotizar cobertura ni a validar publicación, precio, habilitación comercial o agenda: mantiene los datos históricos del pedido y sus siete distritos.

## Lecturas, historial y privacidad

Las respuestas existentes de creación, consulta privada, Mis pedidos y administración incorporan `envio: null` antes de preparar, o este objeto:

```json
{
  "transportista": "Reparto SOHO",
  "referenciaSeguimiento": "000123",
  "preparacionIniciadaEn": "2026-11-14T15:00:00.000Z",
  "despachadoEn": "2026-11-14T16:00:00.000Z",
  "entregadoEn": null
}
```

Durante preparación los datos de despacho son nulos. Solo el detalle administrativo añade `responsablesEnvio`, con `preparacion`, `despacho` y `entrega`, cada uno `{ id, nombre }` o `null`. Sus notas permanecen en `eventosInternos`. Las respuestas del cliente y del invitado autorizado excluyen empleados y notas internas; conservan las comprobaciones de propiedad existentes.

Se añade un evento público `ENTREGA_CAMBIADA` por etapa y `RESERVA_CONSUMIDA` al enviar. La nota opcional se registra como `NOTA_INTERNA`, con visibilidad `INTERNA`. Todos obtienen actor y responsable de la sesión y comparten la nueva versión del pedido; las secuencias son únicas y crecientes.

## Errores y recuperación

- `400`: contrato inválido, metadatos incompletos, campos no admitidos o entrega sin confirmación.
- `401` / `403`: sesión ausente o inválida, rol insuficiente, origen o CSRF inválidos.
- `404`: pedido inexistente o código inválido.
- `409`, `ENTREGA_CAMBIADA`: versión o etapa incompatible, envío repetido o fechas incoherentes.
- `409`, `INVENTARIO_INCONSISTENTE`: reservas, stock, contadores o movimientos incompatibles con la acción.

Ante conflicto se consulta nuevamente el pedido. Si se pierde una respuesta de escritura, el cliente debe consultar `GET /api/admin/pedidos/:codigo` antes de decidir un nuevo intento. Un despacho ya confirmado permanece visible con versión, fecha y seguimiento; repetirlo no vuelve a descontar unidades.

## Integración Angular

Los botones administrativos y los datos de seguimiento ya están conectados en Angular. Consultar [Integración de preparación y envíos](../../soho-frontend/docs/integracion-preparacion-envios.md). La entrega original de API conservó las fuentes del frontend; la conexión se realizó en la entrega posterior. Envíos parciales, edición posterior de seguimiento, resolución de incidencias, cancelaciones, devoluciones, reembolsos, contratación de couriers y notificaciones externas quedan para operaciones posteriores.

La validación y sus resultados se registran en [Estado de integración](estado-integracion.md) y `.checkout-review/envios-api/` desde la raíz SOHO. Las pruebas de escritura utilizan MySQL temporal exclusivo, nunca `soho_db`.
