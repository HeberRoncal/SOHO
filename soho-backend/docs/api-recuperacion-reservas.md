# Recuperación de reservas y resolución de incidencias por vencimiento

Implementada sobre el esquema existente, sin una novena migración. Las reservas liberadas permanecen en el historial; recuperar crea reservas nuevas y resuelve únicamente incidencias causadas por su vencimiento automático. La recuperación no aprueba pagos, modifica precios ni descuenta existencias físicas.

## Rutas y autorización

Las dos rutas requieren sesión `ADMIN`. La escritura exige además origen autorizado y `X-CSRF-Token`; se aplica el límite de consultas administrativas. La autorización se revalida dentro de la transacción.

| Método y ruta                                           | Resultado                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/admin/pedidos/:codigo/reservas/recuperacion`  | `{ pedido, recuperacion }`: detalle administrativo y disponibilidad para confirmar. |
| `POST /api/admin/pedidos/:codigo/reservas/recuperacion` | `200` y `{ pedido }` con las nuevas reservas y versión.                             |

El GET no cambia reservas, inventario, versiones ni historial del pedido. Su disponibilidad es una consulta, no una retención de unidades mientras el administrador completa el formulario. El POST vuelve a comprobarla bajo bloqueo.

```json
{
  "versionPedido": 3,
  "versionPago": 1,
  "motivo": "Cliente confirma que continuará con el pedido.",
  "confirmado": true
}
```

`versionPedido` debe estar entre 1 y 4294967294; `versionPago`, entre 1 y 4294967295. El motivo se recorta y exige entre diez y trescientos caracteres, sin controles o caracteres de formato; admite saltos de línea. La confirmación debe ser el booleano `true`. No se admiten campos adicionales: el cliente no elige cantidades, política, duración, fechas, estado ni responsable.

## Pedidos elegibles y comprobación de stock

- Estado de entrega `INCIDENCIA` y pago `PENDIENTE` u `OBSERVADO`.
- Sin cancelación, preparación/envío ni reservas consumidas.
- Cada línea conserva una reserva activa completa y válida, o su última reserva fue liberada automáticamente por vencimiento.
- La liberación recuperable tiene política temporal `LIBERAR_Y_ALERTAR`, atención y cierre coherentes y un evento interno `RESERVA_VENCIDA` de actor `SISTEMA` en la fecha correspondiente.
- No se recuperan liberaciones por rechazo, cancelación o decisiones manuales. Tampoco se resuelve una incidencia genérica sin reservas vencidas recuperables.
- Otra reserva activa con política de liberar que acaba de vencer impide confirmar hasta procesar ese vencimiento y actualizar el pedido.

Se bloquean todas las variantes del pedido en orden y se concilia el contador reservado con la suma de reservas activas de todos los pedidos. Las existencias físicas deben cubrir las reservas actuales. Cada línea que necesita una reserva nueva exige variante habilitada y suficientes unidades libres: `existencias - cantidadReservada`.

Si falta una sola línea, no se recupera ninguna parcialmente. La consulta devuelve el bloqueo y las cantidades necesarias/disponibles por SKU. El pedido continúa en incidencia; se puede esperar reposición o utilizar la cancelación existente. No se sustituyen artículos ni se libera inventario de otros pedidos para obtener disponibilidad.

La asignación utiliza la misma variante del pedido y sus datos comerciales históricos. No vuelve a cotizar el precio, la cobertura, tarifas, descuentos o imágenes del catálogo vigente. Tampoco cambia talla, color, SKU histórico o cantidades compradas. La disponibilidad comercial de una compra nueva continúa siendo responsabilidad del checkout; recuperar una reserva administrativa exige la habilitación de la variante y los controles de inventario indicados.

## Reserva nueva y política histórica

La reserva anterior conserva identificador, política, fechas, estado `LIBERADA`, motivo y atención del vencimiento. Se crea otra reserva `ACTIVA` por línea necesaria, copiando configuración, versión, modo, duración y acciones históricas de la anterior.

El plazo comienza al confirmar la recuperación: `venceEn = creadoEn + horas históricas`. Su marca de atención y datos de cierre empiezan vacíos. Una duración histórica de 24 horas se renueva por otras 24 horas, aunque la configuración general haya cambiado después. Las reservas activas válidas de otras líneas conservan sus plazos y marcas originales; no se renuevan por esta operación.

La unicidad existente permite una sola reserva activa por artículo y múltiples reservas cerradas. No se reactiva una reserva antigua ni se borra una atención para reutilizarla.

## Transacción y estados

Se reutilizan los bloqueos de sesión, pedido, pago y variantes ordenadas, compartidos con revisión de pagos, corrección de comprobantes, vencimientos, cancelación y despacho. Se validan las versiones consultadas y se comprueba otra vez el tiempo después de esperar el inventario.

En la misma transacción se crean las reservas, se incrementan sus contadores reservados, se registra el historial y el pedido vuelve a `PENDIENTE`. Su versión aumenta una sola vez. El estado y versión del pago, comprobantes y revisores permanecen intactos:

| Pago anterior                      | Después de recuperar                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `PENDIENTE`                        | Continúa pendiente de revisión. Aprobar exige las versiones actuales y reservas válidas. |
| `OBSERVADO`                        | Continúa observado. El cliente debe corregir el comprobante para volver a revisión.      |
| `APROBADO`, `RECHAZADO`, `ANULADO` | Recuperación por vencimiento no permitida.                                               |

La aprobación no resuelve por sí sola un pedido que todavía siga en `INCIDENCIA`. Recuperar permite la revisión posterior, no la sustituye. Un pago aprobado conserva sus reservas aunque venza su plazo; el descuento físico sigue ocurriendo al despachar.

Dos administradores con las mismas versiones no pueden recuperar dos veces. Dos pedidos que compiten por las últimas unidades se serializan sobre la variante. Un fallo revierte también las líneas anteriores, contadores, eventos y versión.

## Historial, alertas y privacidad

Se registra un evento interno `RESERVA_CREADA` por reserva nueva, con actor `ADMIN`, responsable de sesión, SKU, cantidad, identificadores anterior/nuevo, plazo y versión histórica. Un evento interno `ENTREGA_CAMBIADA`, titulado `Incidencia de reserva resuelta`, conserva el motivo y la versión de la operación.

El detalle administrativo agrega:

- `recuperacionReservas.puedeSolicitar`: elegibilidad estructural para consultar el formulario; no garantiza disponibilidad hasta ejecutar la consulta y confirmar.
- `recuperacionReservas.ultima`: versión, fecha, motivo y responsable de la última recuperación, o `null`.

Las alertas de vencimiento consideran la última reserva de cada artículo, ordenada por fecha e identificador. Dashboard, filtro y detalle dejan de contar las reservas liberadas que ya fueron reemplazadas; vencimientos posteriores generan sus propias alertas sin sumar unidades de ciclos anteriores. Las alertas `SOLO_ALERTAR` de otras líneas permanecen vigentes hasta la decisión correspondiente.

El seguimiento público de cuenta e invitado mantiene sus estados y cantidades seguras. No recibe metadatos de recuperación, motivos, responsables, política o eventos internos.

## Angular y resultados inciertos

El detalle del pedido ofrece **Recuperar reservas** cuando corresponde. El diálogo consulta la disponibilidad real y muestra cantidades, plazo renovado, política al cancelar y unidades que se conservan con su plazo actual. Exige motivo y confirmación explícita y advierte si falta stock.

El formulario conserva el motivo ante conflictos, errores de red o respuestas incoherentes; actualizar restablece la confirmación. Un cambio de versión impide guardar hasta consultar de nuevo. Bloquea doble envío y salida durante una operación y protege el borrador al cerrar, navegar o recargar mediante los guardas existentes del detalle.

Si se pierde una respuesta, se consulta el pedido sin repetir automáticamente el POST. Para confirmar el resultado se comprueban la nueva versión, pago intacto, estado pendiente, datos comerciales y metadatos de recuperación con el motivo y responsable esperados. Un `409` se conserva como conflicto aunque otra ventana haya obtenido un resultado equivalente. Si la lectura no confirma la operación, se exige actualización expresa antes de otro intento. Las respuestas de otra cuenta, rol o revisión de sesión se descartan.

## Errores y alcance

- `400`: contrato, versiones, motivo o confirmación inválidos; campos no admitidos.
- `401 / 403`: sesión, rol, origen o CSRF insuficientes.
- `404`: pedido inexistente o código inválido.
- `409 / RECUPERACION_CAMBIADA`: versiones distintas a las consultadas.
- `409 / RESERVAS_NO_RECUPERABLES`: estado, reservas, fechas o disponibilidad no permiten recuperar.
- `409 / INVENTARIO_INCONSISTENTE`: el contador y las reservas activas no coinciden.

No incluye recuperación de pedidos pagados con incidencias generales de stock, reapertura de cancelados, sustituciones, recuperación parcial, reembolsos o ajustes de existencias. El modo **Por un tiempo definido** ya está habilitado en [configuración](api-configuracion-reservas.md); recuperar una reserva sigue copiando su política histórica aunque la configuración general haya cambiado.

Las piezas nuevas se generaron con Nest CLI: clase de reglas, servicio, controlador, DTO y pipe. Se adaptaron después a Prisma, validación, autorización y ESM con `.js`. Evidencia de validación en `.checkout-review/recuperacion-reservas/` desde la raíz SOHO.
