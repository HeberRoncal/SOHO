# Revisión administrativa de pagos y corrección de comprobantes

Reutiliza los nueve modelos de pedidos y las seis migraciones existentes. No añade migraciones ni cambia la base local. Las piezas nuevas de NestJS se generaron con el CLI local y se adaptaron a Prisma y ESM.

## Rutas

Actualización de identidad administrativa: `clienteId` conserva el UUID de `Usuario` para registrados y utiliza `invitado:<UUID del pedido>` para compras invitadas. Ya no contiene el correo ni sirve para agrupar personas por contacto compartido. Su destino es la [API administrativa de Clientes](api-clientes-administracion.md). No cambia la autorización ni la credencial privada del seguimiento.

| Método | Ruta                                                           | Acceso y resultado                                                                      |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/admin/pagos`                                             | ADMIN. Listado paginado, filtros y conteos por estado.                                  |
| GET    | `/api/admin/pagos/:codigo`                                     | ADMIN. Datos históricos, versiones del comprobante, revisores e historial interno.      |
| GET    | `/api/admin/pedidos`                                           | ADMIN. Listado paginado de pedidos.                                                     |
| GET    | `/api/admin/pedidos/:codigo`                                   | ADMIN. Detalle administrativo.                                                          |
| GET    | `/api/admin/resumen-pedidos?desde=2026-11-01&hasta=2026-11-14` | ADMIN. Totales, listas breves y ventas por aprobación en hora de Lima. Hasta 366 días.  |
| POST   | `/api/admin/pagos/:codigo/decision`                            | ADMIN y CSRF. Aprueba, observa o rechaza la versión pendiente vigente.                  |
| POST   | `/api/pedidos/:codigo/comprobantes`                            | Propietario o invitado con credencial vigente y CSRF. Corrige un comprobante observado. |

Las consultas administrativas no sustituyen `/api/pedidos/mios`: ese listado sigue siendo exclusivamente propio. El archivo se abre con la ruta privada existente `/api/pedidos/:codigo/comprobantes/:id`, que también admite ADMIN. Ninguna respuesta entrega claves de almacenamiento, URLs firmadas, hashes, contraseñas o credenciales de invitado. Las respuestas son `no-store`.

## Listados

Pagos admite `estado` (`PENDIENTE`, `OBSERVADO`, `APROBADO`, `RECHAZADO`, `ANULADO`), `metodo` (`YAPE`, `PLIN`), `busqueda`, `pagina` y `limite`. La búsqueda considera código, nombres, apellidos, correo y operaciones de los comprobantes. Las palabras se combinan, con la comparación de la base MySQL. Los conteos por estado son globales.

Pedidos añade `entrega` (estados de entrega o `POR_PREPARAR`), `cliente` (`registrado`, `invitado`), `desde`, `hasta` y `orden` (`recientes`, `antiguos`, `total-mayor`, `total-menor`). `POR_PREPARAR` exige pago aprobado y entrega confirmada o en preparación. Las fechas del listado se interpretan en Lima. Los listados usan veinte filas por defecto, máximo cincuenta; paginación y conteo comparten una transacción de lectura. La ordenación predeterminada usa la última actualización y un identificador para desempatar.

El Dashboard suma el total histórico, incluido el envío, según la fecha de aprobación del comprobante. Un pago aprobado continúa contando aunque posteriormente se cancele la entrega; no es un cálculo de ingresos netos ni descuenta reembolsos. Los pendientes y observados se cuentan aparte. Las listas de pendientes, observados, preparación e incidencias tienen hasta cinco elementos; recientes, hasta siete. Los contadores se calculan sobre todos los pedidos, sin depender de la página cargada en Angular.

## Decisiones

Cada petición identifica lo que se revisó:

```json
{
  "versionPedido": 1,
  "versionPago": 1,
  "comprobanteId": "32093077-3e17-4197-b8ba-1aa940f6beaa",
  "accion": "APROBADO",
  "confirmado": true
}
```

`APROBADO` exige confirmación explícita de que el administrador verificó el ingreso en la cuenta del negocio. No se verifica automáticamente una transferencia por su imagen, monto u operación. Confirma la entrega si estaba pendiente y conserva las reservas y el stock físico. Si faltan reservas activas o una reserva temporal requiere liberación por vencimiento, responde 409 para revisión administrativa.

`OBSERVADO` exige `motivo` (`ILEGIBLE`, `MONTO`, `INGRESO`, `DATOS`, `OTRO`), `mensaje` de 10 a 500 caracteres sin controles y `solicitud` (`LEGIBLE`, `CORREGIDO`). El mensaje queda visible en el seguimiento. Conserva la reserva con su política histórica; no reinicia su plazo ni solicita otro pago.

`RECHAZADO` exige motivo, mensaje y `confirmado: true`; no admite solicitud de corrección. Libera las reservas activas y reduce el contador reservado en la misma transacción. Conserva el pedido, sus artículos, el stock físico y el historial. No cancela la entrega automáticamente ni ejecuta un reembolso.

Solo se decide sobre el comprobante más reciente pendiente de un pago pendiente y de un pedido no cancelado. El servidor obtiene al responsable desde la sesión, vuelve a comprobar su vigencia y rol ADMIN bajo bloqueo, incrementa las versiones de pedido y pago y agrega eventos. Serializa las escrituras por pedido y pago, y las liberaciones por variante. Un conflicto devuelve `409 / REVISION_CAMBIADA`; no aplica una segunda decisión ni libera dos veces. Cualquier fallo revierte revisión, pago, pedido, reservas y eventos juntos. Angular conserva las versiones abiertas en la ventana y no repite escrituras automáticamente; consulta el estado ante una respuesta incierta.

## Corrección del cliente

El cuerpo contiene las mismas tres referencias de versión y `comprobante`, con `nombreArchivo`, `tipoArchivo`, `contenidoBase64` y `numeroOperacion` opcional. Comparte la validación del comprobante inicial: imagen estática PNG/JPEG/WebP, hasta 5 MiB, decodificación y recodificación real con sharp, archivo privado y sin metadatos. CSRF y el límite de cargas se comprueban antes de leer el JSON de hasta 8 MiB.

Se comprueba propiedad antes de procesar la imagen y nuevamente en la transacción. Una sesión presente inválida no se degrada a invitado. ADMIN no puede corregir una compra ajena aprovechando su permiso de consulta. El código del pedido solo no autoriza. La sesión se revalida después de procesar la imagen y las credenciales de invitado deben seguir vigentes.

La corrección añade una versión y mantiene la anterior observada, incrementa las versiones del pedido y pago, vuelve a `PENDIENTE` y añade un evento. No crea otra compra, no cambia importes ni método, no modifica ni duplica reservas y no reinicia vencimientos. Hay un máximo de cien versiones por pago.

El reintento de la misma corrección se reconoce por comprobante anterior, archivo normalizado y metadatos. No duplica la versión ni el objeto persistido, incluso con dos solicitudes simultáneas o una respuesta perdida después del COMMIT. Un archivo descartado se limpia; ante un COMMIT incierto se consulta su referencia antes de eliminarlo. Si no puede comprobarse el resultado, se conserva el objeto y se solicita actualizar el pedido.

## Límites vigentes

`montoInformado` sigue siendo opcional y la creación no lo rellena. Su ausencia significa «monto no informado», no imagen ilegible. El visor real permite verificar la captura; la aprobación sigue siendo manual. La revisión del comprobante mantiene su propio estado aunque se anule el pago al cancelar el pedido.

Preparación y envíos ya están integrados; la [API de cancelaciones](api-cancelaciones.md) está implementada y conserva las revisiones del comprobante. Su integración Angular también está implementada. La [API de configuración de reservas](api-configuracion-reservas.md) y su integración Angular están implementadas. El [trabajador de vencimientos y sus alertas](vencimientos-reservas.md) conserva pagos aprobados y exige reservas suficientes para aprobar. La [recuperación de reservas por vencimiento](api-recuperacion-reservas.md) y su confirmación Angular están implementadas: recuperan inventario sin aprobar el pago y permiten su revisión posterior. Incidencias generales de stock y posventa requieren otras entregas. Los botones de simulación no operan sobre pedidos reales. No se envían correos de pagos ni se emiten comprobantes fiscales; los mensajes quedan disponibles en el seguimiento. Los datos oficiales de Yape/Plin todavía requieren su configuración comercial.
