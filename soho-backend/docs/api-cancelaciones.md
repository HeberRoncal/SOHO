# API de cancelación y liberación de reservas

Implementada sobre la octava migración `20261114020000_cancelaciones_pedido`, cuya aplicación local confirmó el usuario. Esta entrega no añade migraciones ni cambia el esquema. Las nuevas piezas se generaron con Nest CLI. La [integración Angular](../../soho-frontend/docs/integracion-cancelaciones.md) ya está implementada.

## Rutas y autorización

| Ruta POST                                                 | Acción                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/api/admin/pedidos/:codigo/cancelacion`                  | Cancelar antes del despacho y aplicar la política histórica de reservas |
| `/api/admin/pedidos/:codigo/cancelacion/liberar-reservas` | Liberar las reservas conservadas de un pedido cancelado                 |

Ambas requieren sesión ADMIN activa, origen autorizado y `X-CSRF-Token`, y usan el límite administrativo `consultar-pedido`. Devuelven `200`, `Cache-Control: no-store` y `{ pedido }`, con la versión vigente y el mismo detalle administrativo de `GET /api/admin/pedidos/:codigo`.

La sesión y su usuario se vuelven a comprobar dentro de la transacción, bajo bloqueo. Se reutiliza `EscrituraPedidoService` para sesión, pedido, pago y reintentos de transacciones revertidas `P2034`. Un usuario CLIENTE no puede registrar estas acciones, aunque sea propietario del pedido.

## Cancelar

Ejemplo cuando una reserva activa exige consultar al administrador:

```json
{
  "versionPedido": 2,
  "versionPago": 2,
  "confirmado": true,
  "motivo": "El cliente solicitó cancelar antes del despacho.",
  "decisionReservasConsultadas": "CONSERVAR"
}
```

`versionPedido` admite enteros entre 1 y 4294967294 y `versionPago`, entre 1 y 4294967295. Deben coincidir con las versiones consultadas. Si la acción necesita incrementar un pago que ya alcanzó su límite, devuelve conflicto.

`confirmado` debe ser literalmente `true`. `motivo` es obligatorio, interno, recortado y de diez a trescientos caracteres Unicode; admite CR/LF y rechaza los demás controles y caracteres de formato invisibles. El cliente no elige responsable, fecha, estados, cantidades, política ni reembolso. Se rechazan campos ajenos a esta operación.

Se admite cancelar desde `PENDIENTE`, `CONFIRMADO`, `EN_PREPARACION` o `INCIDENCIA`. Se bloquean `ENVIADO`, `ENTREGADO`, `CANCELADO`, una cancelación ya registrada, reservas consumidas o cualquier despacho o movimiento asociado al envío, incluso si el estado del pedido fue alterado. Las fechas no pueden anticiparse a la creación, última actualización o preparación del pedido ni al inicio de las reservas que se cerrarán.

La política se lee de cada reserva histórica activa, no de la configuración actual ni de la demostración de Angular. La [API de configuración](api-configuracion-reservas.md) modifica exclusivamente la política de nuevas reservas:

| Política de la reserva               | Resultado                 |
| ------------------------------------ | ------------------------- |
| `LIBERAR`                            | Se libera automáticamente |
| `PREGUNTAR` con decisión `LIBERAR`   | Se libera                 |
| `PREGUNTAR` con decisión `CONSERVAR` | Se mantiene activa        |

`decisionReservasConsultadas` es obligatoria si hay reservas activas con `PREGUNTAR`; debe omitirse cuando no las hay. `null` y `PREGUNTAR` no son decisiones válidas. Una elección de conservar no impide liberar las reservas automáticas de otras líneas. Las reservas ya liberadas no vuelven a descontarse y una fecha vencida no se considera liberada por sí sola.

El servicio bloquea las variantes por identificador, concilia su contador con la suma de todas las reservas activas de cada variante y valida las cantidades del pedido. `InventarioReservadoService` comparte esta conciliación con envíos. La cancelación permite liberar aunque las existencias físicas sean menores que el reservado; el despacho mantiene su comprobación adicional de stock suficiente.

En la misma transacción se crea `CancelacionPedido`, se cierran las reservas elegidas, se reduce `cantidadReservada`, se cambia la entrega a `CANCELADO` y se incrementa la versión del pedido. El registro conserva estados anteriores, responsable, fecha, decisión y nueva versión aplicada. No se vuelve a cotizar ni a validar publicación, precios, habilitación comercial o cobertura vigente.

| Pago anterior                          | Resultado                                         |
| -------------------------------------- | ------------------------------------------------- |
| `PENDIENTE`, `OBSERVADO` o `RECHAZADO` | Pasa a `ANULADO` e incrementa la versión del pago |
| `APROBADO` o `ANULADO`                 | Conserva estado y versión del pago                |

Los comprobantes conservan exactamente sus revisiones, versiones, archivos, motivos, revisores y fechas. Se bloquean nuevas revisiones y correcciones del pedido cancelado mediante las reglas existentes. El archivo privado continúa disponible para quienes ya tienen acceso autorizado a la compra.

Cancelar no modifica existencias físicas ni crea movimientos de inventario. Conserva preparación, artículos, unidades, facturación, dirección, importes y distritos históricos. No devuelve dinero ni registra un reembolso. Un pago aprobado continúa en el resumen de cobros aprobados.

## Liberar reservas retenidas

```json
{
  "versionPedido": 3,
  "versionPago": 3,
  "confirmado": true
}
```

Se exige pedido `CANCELADO`, registro de cancelación con decisión `CONSERVAR`, pago `APROBADO` o `ANULADO` y reservas activas conservadas con política `PREGUNTAR`. Se comprueban nuevamente versiones, autorización, ausencia de despacho o consumo, fechas y conciliación del contador. No admite motivo, otra decisión ni otros campos.

Se liberan todas las reservas retenidas restantes del pedido, se actualiza únicamente el contador reservado y se incrementa la versión del pedido. El pago y su versión, existencias físicas y registro original de cancelación permanecen intactos. La decisión histórica sigue siendo `CONSERVAR`; el cierre posterior se identifica mediante las reservas y el evento de liberación, con fecha y responsable propios.

Un segundo intento, incluso con la versión actual, devuelve conflicto si ya no quedan reservas. Una inconsistencia o un fallo en cualquier variante revierte la operación completa.

## Lecturas y privacidad

Las lecturas existentes del cliente, invitado autorizado y administración incorporan `cancelacion: null` o, para el cliente:

```json
{
  "fecha": "2026-11-14T15:00:00.000Z"
}
```

Un estado cancelado anterior sin registro de cancelación conserva `null`; no se inventa una fecha. La nueva relación pública selecciona únicamente la fecha. No se entregan motivo interno, empleados, decisiones o política de reservas.

En administración, `pedido.cancelacion` añade `motivo`, `registradaPor: { id, nombre }`, `estadoEntregaAnterior`, `estadoPagoAnterior`, `versionPedido` y `decisionReservasConsultadas`. La versión guardada en el registro corresponde al momento de cancelar y no cambia con una liberación posterior.

`reservasCancelacion`, exclusivamente administrativo, contiene cantidades de unidades activas y una indicación para la interfaz:

- `unidadesLiberacionAutomatica`: activas con política `LIBERAR`.
- `unidadesConsultables`: activas con política `PREGUNTAR`.
- `unidadesRetenidas`: activas de un pedido cancelado.
- `puedeLiberarRetenidas`: existe una conservación registrada con reservas consultadas pendientes y sin despacho. Es orientativo; la escritura vuelve a comprobar todas las reglas.

El historial público recibe `ENTREGA_CAMBIADA` al cancelar y `PAGO_ANULADO` si corresponde. El motivo se guarda en `NOTA_INTERNA`. Las liberaciones se registran con `RESERVA_LIBERADA` y visibilidad interna. Los eventos de cada operación comparten su nueva versión y secuencias únicas. `eventosInternos` añade actor y responsable `{ id, nombre }` para identificar también al administrador que realiza una liberación posterior. Los eventos públicos excluyen esos datos.

## Errores y concurrencia

| Estado                           | Situación                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`                            | Contrato, motivo, confirmación o decisión inválidos; incluye `DECISION_RESERVAS_INVALIDA` cuando la elección no corresponde a las reservas activas |
| `401` / `403`                    | Sesión, rol, origen o CSRF insuficientes                                                                                                           |
| `404`                            | Código inválido o pedido inexistente                                                                                                               |
| `409 / CANCELACION_CAMBIADA`     | Versiones, etapa, repetición, despacho o fechas incompatibles                                                                                      |
| `409 / INVENTARIO_INCONSISTENTE` | Contadores o cantidades de reserva requieren conciliación                                                                                          |

Los bloqueos serializan estas operaciones frente a revisión de pagos, corrección de comprobantes y despacho. Si otra operación gana, la petición anterior recibe conflicto y debe consultar el estado actual. No se sobrescriben decisiones posteriores ni se liberan reservas dos veces.

Si se pierde la respuesta de una escritura, consultar `GET /api/admin/pedidos/:codigo` antes de decidir un nuevo intento. La cancelación y su fecha, la versión, el historial y las unidades retenidas permiten comprobar el resultado. No se repite automáticamente un POST cuyo resultado pueda estar confirmado. Los errores distintos de una transacción revertida no se reintentan automáticamente en el servicio.

## Validación y siguiente entrega

Pasaron **533 pruebas del backend**: 307 unitarias, nueve HTTP y 217 con MySQL 8.0.46 temporal, incluidas 34 unitarias y 42 con MySQL nuevas. Se comprobaron contratos, permisos, CSRF, invitados, privacidad, política histórica, reservas mixtas, pagos y comprobantes conservados, responsables, incidencias con stock físico insuficiente, versiones, doble clic, rollback en la segunda variante, sesión revocada mientras esperaba un bloqueo y respuesta perdida después de COMMIT. Las carreras incluyeron dos cancelaciones, dos liberaciones, aprobación, corrección y despacho.

Se aprobaron compilación, TypeScript completo, lint sin avisos y formato. La API compilada se comprobó además en un proceso real por HTTP con MySQL aislado. El esquema, las ocho migraciones y las fuentes de Angular permanecieron intactos; no se escribió en `soho_db` ni se enviaron notificaciones externas. Evidencia en `.checkout-review/cancelaciones-api/` desde la raíz SOHO. Los procesos y directorios temporales se retiran al terminar.

La integración Angular conecta la cancelación y liberación de reservas, con confirmaciones, borradores, lectura ante respuesta incierta, estados de pago independientes y presentación privada del motivo. Esta API no incorpora cancelación después del despacho, reembolsos, devoluciones, reapertura ni un trabajador de vencimientos.
