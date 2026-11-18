# Esquema de cancelación de pedidos

Estado: incorporado a `prisma/schema.prisma` mediante la octava migración, `20261114020000_cancelaciones_pedido`. Validado en MySQL temporal; el usuario confirmó que ya la aplicó a su base local. El cliente Prisma está regenerado. La [API de cancelación y liberación de reservas](api-cancelaciones.md) ya está implementada; la [integración Angular](../../soho-frontend/docs/integracion-cancelaciones.md) ya está implementada.

## Alcance

Se añade `CancelacionPedido`, un registro por pedido. Prisma pasa de veinticinco a veintiséis tablas de negocio. Se conservan intactas las siete migraciones anteriores y las estructuras de las veinticinco tablas existentes. Las relaciones inversas de `Pedido` y `Usuario` no añaden columnas a esas tablas.

La migración no cancela pedidos, cambia pagos, libera reservas, devuelve existencias ni crea reembolsos. Tampoco reconstruye motivos o responsables de estados `CANCELADO` anteriores. El registro y las operaciones comerciales se guardan conjuntamente en una transacción de la API.

La cancelación la registra ADMIN, incluso cuando la solicita el cliente. Se admite antes del despacho desde `PENDIENTE`, `CONFIRMADO`, `EN_PREPARACION` o `INCIDENCIA`; se bloquea desde `ENVIADO`, `ENTREGADO` o `CANCELADO`. El servicio también comprobará la ausencia de despacho, salidas y reservas consumidas, sin confiar únicamente en el estado declarado.

## Modelo incorporado

```prisma
enum DecisionReservasCancelacion {
  LIBERAR
  CONSERVAR
}

model CancelacionPedido {
  id                          String                       @id @default(uuid()) @db.Char(36)
  pedidoId                    String                       @unique @map("pedido_id") @db.Char(36)
  motivo                      String                       @db.VarChar(300)
  canceladaEn                 DateTime                     @default(now()) @map("cancelada_en") @db.DateTime(3)
  registradaPorId             String                       @map("registrada_por_id") @db.Char(36)
  estadoEntregaAnterior       EstadoEntregaPedido          @map("estado_entrega_anterior")
  estadoPagoAnterior          EstadoPagoPedido             @map("estado_pago_anterior")
  versionPedido               Int                          @map("version_pedido") @db.UnsignedInt
  decisionReservasConsultadas DecisionReservasCancelacion? @map("decision_reservas_consultadas")
  pedido                      Pedido                       @relation(fields: [pedidoId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  registradaPor               Usuario                      @relation(fields: [registradaPorId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@index([registradaPorId, canceladaEn], map: "cancelaciones_admin_fecha_idx")
  @@index([canceladaEn, id], map: "cancelaciones_fecha_id_idx")
  @@map("cancelaciones_pedido")
}
```

`Pedido.cancelacion` es opcional y `Usuario.cancelacionesPedido` contiene las operaciones registradas por ese usuario. `pedidoId @unique` impide una segunda cancelación para el mismo pedido. Las claves foráneas con `Restrict` conservan sus referencias; la API trata el registro como solo inserción y no ofrece borrado, edición ni reapertura.

`canceladaEn` corresponde al registro de la acción en el servidor. `registradaPorId` se obtendrá de la sesión ADMIN, sin aceptar un identificador elegido por el cliente. Se conserva su identidad por relación; el nombre mostrado será el del usuario consultado, no una copia histórica de su nombre.

Los estados anteriores describen el pedido y pago justo antes de cancelar. `versionPedido` guarda la **nueva versión aplicada al cancelar**, no la versión anterior abierta en el formulario. Comienza como mínimo en dos, porque cancelar debe incrementar la versión del pedido. Las liberaciones posteriores de reservas incrementarán la versión vigente y añadirán eventos sin reescribir esta copia histórica.

## Política y decisión de reservas

La política histórica existente `ReservaInventario.accionCancelacion` conserva `LIBERAR` o `PREGUNTAR`. No se sustituye ni se toma de la configuración de demostración de Angular. Cambiar la configuración actual tampoco reescribe las políticas de reservas anteriores.

`decisionReservasConsultadas` registra exclusivamente la elección del administrador para las reservas activas cuya política sea `PREGUNTAR`:

| Valor       | Significado                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `NULL`      | No había reservas activas que exigieran preguntar; se aplican las liberaciones automáticas que correspondan |
| `LIBERAR`   | El administrador eligió liberar las reservas consultadas                                                    |
| `CONSERVAR` | El administrador eligió mantener activas las reservas consultadas                                           |

`PREGUNTAR` es una política y no constituye un resultado, por eso no pertenece al nuevo enum. Las reservas activas con política `LIBERAR` deben liberarse aunque otras reservas del pedido se conserven. Una reserva ya liberada no se descuenta del contador nuevamente.

Conservar exige una salida administrativa definida: la API ya incluye la liberación posterior de reservas retenidas de pedidos cancelados, con ADMIN, confirmación, versión e historial. Esta liberación modificará las reservas existentes y añadirá `RESERVA_LIBERADA`; no requiere otra tabla ni modifica la decisión originalmente registrada al cancelar. El mero paso del tiempo no debe reinterpretarse como una liberación ya realizada.

Antes de despachar no se descontó stock físico: cancelar solo puede reducir `cantidadReservada` y cerrar reservas como `LIBERADA`, con fecha y motivo. No incrementa existencias ni crea una entrada física de inventario. Una incidencia por existencias inferiores al reservado no impide por sí misma liberar; un contador incoherente o que no permita la reducción requiere conflicto y conciliación, sin escrituras parciales.

## Pago, comprobantes e historial

Para mantener el funcionamiento previsto en las pantallas:

| Pago anterior                          | Pago tras cancelar  |
| -------------------------------------- | ------------------- |
| `PENDIENTE`, `OBSERVADO` o `RECHAZADO` | `ANULADO`           |
| `APROBADO`                             | Conserva `APROBADO` |
| `ANULADO`                              | Conserva `ANULADO`  |

La revisión almacenada en cada comprobante no se cambia. Un comprobante observado o rechazado conserva su revisión, revisor, motivo y fechas; la interfaz podrá explicar que el pago quedó anulado por cancelación. Cancelar no equivale a rechazar una captura ni devuelve dinero. El pago aprobado continúa contando en el resumen de cobros aprobados, que no calcula ingresos netos de reembolsos.

Se conservan artículos, unidades, facturación, importes, destino y la preparación ya registrada en `EnvioPedido`. Se reutilizan `ENTREGA_CAMBIADA`, `PAGO_ANULADO`, `RESERVA_LIBERADA` y, si corresponde, `NOTA_INTERNA`, con secuencia y versión. No se amplían los estados de revisión del comprobante ni los tipos de evento.

El motivo de diez a trescientos caracteres será interno. El cliente y el invitado autorizado podrán consultar el estado cancelado y su fecha, sin empleados, política de reservas ni motivo interno. El DTO público selecciona únicamente la fecha de la cancelación; la selección privada administrativa y el resumen de reservas se documentan en la [API de cancelaciones](api-cancelaciones.md).

## Restricciones y responsabilidad del servicio

SQL incorpora tres `CHECK`: motivo recortado de diez a trescientos caracteres, sin controles salvo CR/LF; estado de entrega anterior limitado a las cuatro etapas previas admitidas; y versión aplicada igual o mayor que dos. Conserva claves obligatorias, unicidad y dos relaciones restrictivas. Prisma representa los campos, relaciones e índices; estos `CHECK` se mantienen en la migración SQL.

Las restricciones de fila no comprueban rol ADMIN, fecha respecto al pedido o preparación, correspondencia con la versión vigente, estado real del pago, existencia de despacho o decisiones según reservas de otras tablas. La API deberá comprobar esas reglas bajo los bloqueos existentes de sesión, pedido, pago y variantes. La operación se revertirá entera ante cualquier fallo. No se añaden triggers comerciales.

La confirmación, CSRF, motivo válido, versiones abiertas y permisos serán obligatorios en la API. Sus piezas nuevas se generarán con Nest CLI. No se añadieron controladores, servicios ni otras piezas NestJS en esta preparación de esquema.

## Validación y aplicación

Pasaron **399 comprobaciones SQL**: las 355 anteriores y 44 nuevas. Se comprobaron unicidad, relaciones restrictivas, campos obligatorios, límites y controles del motivo, Unicode, saltos de línea, etapas previas, extremos de versión, decisiones reales y ausencia de automatismos.

Una base temporal con las siete migraciones y datos sintéticos en las veinticinco tablas se actualizó a ocho. Conservó exactamente cada dato y estructura anterior, incluidas políticas y tarifas editadas, comprobantes observados y aprobados, reservas activas y consumidas, responsables, seguimiento `000123` y movimientos manuales y de envío. La nueva tabla quedó vacía. Un segundo despliegue tampoco reescribió datos. Las ocho migraciones se desplegaron además desde cero y el diff no encontró diferencias representables en Prisma.

Pasaron **457 pruebas del backend**: 273 unitarias, nueve HTTP y 175 con MySQL, incluidas nueve nuevas del modelo, relaciones, decisiones, privacidad del DTO existente, versiones y rollback. Pasaron validación y formato del esquema, generación del cliente, compilación, TypeScript completo y lint. Las fuentes de la API y de Angular permanecieron intactas; no se escribió en `soho_db` ni se enviaron notificaciones externas. Evidencia en `.checkout-review/cancelaciones-esquema/` desde la raíz SOHO. La instancia MySQL temporal se detuvo y retiró.

El usuario confirmó aplicada esta migración. Para aplicar migraciones pendientes en otra instalación, desde `soho-backend`:

```powershell
npm.cmd run db:migrate:deploy
```

El cliente Prisma ya se regeneró durante esta entrega. Una copia que todavía no lo tenga puede ejecutar `npm.cmd run db:generate`; no equivale a aplicar la migración. No se requiere repetir seeds.

Aplicar el esquema no habilita el botón de cancelación. La API de cancelación y liberación posterior de reservas retenidas ya está implementada; la integración Angular también está implementada. Reembolsos, cancelación después del despacho, devoluciones y reapertura del pedido quedan fuera de esta entrega.
