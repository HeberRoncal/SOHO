# Esquema de preparación y envíos

Estado: incorporado a `prisma/schema.prisma` mediante la séptima migración, `20261114010000_preparacion_envios`. Se validó en MySQL temporal y el usuario confirmó que ya la aplicó a su base local. El cliente Prisma está regenerado. La [API de preparación, despacho y entrega](api-envios.md) ya está implementada. Su [conexión a Angular](../../soho-frontend/docs/integracion-preparacion-envios.md) ya está implementada.

## Alcance y correspondencia con las pantallas

La interfaz contempla la secuencia `CONFIRMADO → EN_PREPARACION → ENVIADO → ENTREGADO`, siempre con pago `APROBADO`. `INCIDENCIA` y `CANCELADO` bloquean el avance. Al despachar pide transportista o responsable local, código o referencia de seguimiento y una nota opcional; al registrar entrega exige confirmación explícita.

El esquema mantiene un envío completo por pedido, como la interfaz actual. Admite reparto local con una referencia propia, sin exigir una guía de courier. Conserva los siete distritos, la dirección, destinatario, plazo y tarifa históricos de `Pedido`. Esos datos no se vuelven a cotizar ni se sustituyen por la agenda o la cobertura vigente.

Solo se añade una tabla de negocio: `EnvioPedido`. El total pasa de veinticuatro a veinticinco. Se amplían las relaciones de modelos existentes y el origen de los movimientos de inventario. El estado de entrega y la versión permanecen en `Pedido`; `PagoPedido` y `ReservaInventario` conservan sus modelos.

## Nuevo modelo

La fila se crea al iniciar la preparación. Los datos de despacho permanecen nulos hasta enviar; los de entrega, hasta registrar su recepción. Las fechas corresponden al registro de cada acción en el servidor y los responsables provienen de la sesión ADMIN. No representan una fecha externa declarada por un transportista.

```prisma
model EnvioPedido {
  id                       String               @id @default(uuid()) @db.Char(36)
  pedidoId                 String               @unique @map("pedido_id") @db.Char(36)
  preparacionIniciadaEn     DateTime             @default(now()) @map("preparacion_iniciada_en") @db.DateTime(3)
  preparacionIniciadaPorId  String               @map("preparacion_iniciada_por_id") @db.Char(36)
  transportista             String?              @db.VarChar(80)
  referenciaSeguimiento     String?              @map("referencia_seguimiento") @db.VarChar(80)
  despachadoEn              DateTime?            @map("despachado_en") @db.DateTime(3)
  despachadoPorId           String?              @map("despachado_por_id") @db.Char(36)
  entregadoEn               DateTime?            @map("entregado_en") @db.DateTime(3)
  entregaRegistradaPorId    String?              @map("entrega_registrada_por_id") @db.Char(36)
  pedido                   Pedido               @relation(fields: [pedidoId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  preparacionIniciadaPor    Usuario              @relation("PreparacionEnvio", fields: [preparacionIniciadaPorId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  despachadoPor             Usuario?             @relation("DespachoEnvio", fields: [despachadoPorId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  entregaRegistradaPor      Usuario?             @relation("EntregaEnvio", fields: [entregaRegistradaPorId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  movimientos              MovimientoInventario[]

  @@index([preparacionIniciadaPorId, preparacionIniciadaEn], map: "envios_preparacion_admin_fecha_idx")
  @@index([despachadoPorId, despachadoEn], map: "envios_despacho_admin_fecha_idx")
  @@index([entregaRegistradaPorId, entregadoEn], map: "envios_entrega_admin_fecha_idx")
  @@index([despachadoEn, id], map: "envios_despachado_fecha_id_idx")
  @@map("envios_pedido")
}
```

`pedidoId @unique` limita a un envío por pedido. Los nombres explícitos de índices se mantienen dentro del límite de identificadores de MySQL. La preparación registrada se conserva aunque después se cancele el pedido; la cancelación es una operación posterior con sus propias reglas.

## Cambios en modelos existentes

Se amplía el enum existente, conservando ambos valores anteriores:

```prisma
enum OrigenMovimientoInventario {
  MANUAL
  STOCK_INICIAL
  ENVIO_PEDIDO
}
```

Se añaden estos campos y atributos a los modelos existentes; los siguientes bloques son fragmentos y no reemplazan sus demás campos:

```prisma
model Pedido {
  envio EnvioPedido?
}
```

```prisma
model MovimientoInventario {
  envioPedidoId String?      @map("envio_pedido_id") @db.Char(36)
  envioPedido   EnvioPedido? @relation(fields: [envioPedidoId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([envioPedidoId, varianteId], map: "movimientos_envio_variante_key")
}
```

```prisma
model Usuario {
  preparacionesEnvio EnvioPedido[] @relation("PreparacionEnvio")
  despachosEnvio     EnvioPedido[] @relation("DespachoEnvio")
  entregasEnvio      EnvioPedido[] @relation("EntregaEnvio")
}
```

El movimiento conserva sus campos actuales: variante, responsable, tipo, cantidad con signo, saldos, reservado, habilitación, motivo, referencia, origen y fecha. Un despacho genera un movimiento `SALIDA / ENVIO_PEDIDO` por variante, vinculado al envío. La pareja única impide una segunda salida del mismo SKU en ese envío. Ya existe una sola línea de pedido por variante; el servicio verificará que cada variante del movimiento corresponda a una línea de ese pedido y a su cantidad completa.

Los movimientos anteriores mantienen `envioPedidoId = NULL`, sus orígenes y sus datos. La unicidad permite múltiples movimientos manuales con relación nula en MySQL. Se conserva `referencia` como texto legible —por ejemplo, el código del pedido— y se usa la clave foránea para el vínculo real.

No se añade un catálogo de transportistas, otro enum de estado ni otra versión para el envío. `Pedido.estadoEntrega` y `Pedido.version` controlan el agregado. Las notas se guardan en `EventoPedido`, evitando duplicarlas en la fila de envío.

## Restricciones de la séptima migración

Además de las claves foráneas y los índices representados en Prisma, la migración añade `CHECK` de fila:

- Sin despacho: transportista, referencia, fecha y responsable de despacho son todos nulos; también lo son los datos de entrega.
- Con despacho: transportista de 2 a 80 caracteres, referencia de 3 a 80, fecha y responsable obligatorios. Los textos deben estar recortados y no admiten caracteres de control.
- Entrega: fecha y responsable aparecen juntos, requieren despacho y respetan `preparacionIniciadaEn ≤ despachadoEn ≤ entregadoEn`.
- Un movimiento `ENVIO_PEDIDO` requiere `envioPedidoId`, responsable y tipo `SALIDA`. Los orígenes anteriores requieren relación de envío nula. Se conservan todas las restricciones previas de cantidad, signo y reconciliación de saldos.

La coherencia entre tablas, los roles de los responsables, las cantidades y las transiciones se comprobarán en la transacción del servicio. Un `CHECK` de fila no sustituye esas validaciones.

## Operaciones previstas

| Acción              | Condiciones                                                                                                          | Escrituras atómicas                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iniciar preparación | ADMIN, pago aprobado, entrega confirmada y versión vigente                                                           | Crear `EnvioPedido`, pasar a `EN_PREPARACION`, incrementar `Pedido.version` y añadir evento. Sin cambiar saldos.                                                 |
| Registrar envío     | ADMIN, pago aprobado, entrega en preparación, versión vigente, datos de seguimiento y reservas/inventario coherentes | Guardar despacho, consumir reservas, reducir contador reservado y existencias, registrar movimientos, pasar a `ENVIADO`, incrementar versión y añadir historial. |
| Registrar entrega   | ADMIN, pago aprobado, entrega enviada, despacho registrado, versión vigente y confirmación explícita                 | Guardar fecha y responsable de registro, pasar a `ENTREGADO`, incrementar versión y añadir evento. Sin nuevos movimientos de stock.                              |

El servicio usará el bloqueo del pedido y de sus variantes en un orden estable, además de revalidar la sesión y el pago. Para despachar exigirá reservas `ACTIVA` suficientes para cada línea y conciliará sus cantidades con el contador de la variante. Un saldo físico por debajo de lo reservado requiere resolver la incidencia de inventario antes de enviar; no se asigna unilateralmente el stock de otros pedidos.

Para una línea de cantidad `q`, el despacho guarda `cantidad = -q`, `saldoPosterior = saldoAnterior - q` y reduce `Variante.cantidadReservada` en `q`. El campo histórico `MovimientoInventario.cantidadReservada` representa el reservado después de esa operación. Las reservas consumidas conservan su fila, con fecha y motivo de cierre. Un fallo en cualquier línea revierte el despacho completo.

La versión del pedido, el envío único y los movimientos únicos impiden volver a descontar por doble clic o reintento. Una petición desactualizada devuelve conflicto y exige consultar el estado vigente. Si se pierde la respuesta después del COMMIT, la lectura del pedido y su envío permite comprobar lo ocurrido; el cliente no repite la escritura automáticamente.

El mero vencimiento de una fecha no libera una reserva. Las reservas de pedidos aprobados se conservan hasta despachar; el futuro trabajador de vencimientos deberá distinguirlas de los pagos pendientes u observados. Cambiar la configuración no reescribe las copias históricas de política.

## Historial y presentación

Se reutiliza `ENTREGA_CAMBIADA` para las transiciones, con un mensaje público de estado sin datos internos. La nota opcional de hasta 300 caracteres se registra como `NOTA_INTERNA`, con responsable ADMIN y visibilidad interna. La nota puede conservar saltos de línea conforme a la restricción actual del historial. La interfaz deberá aclarar su visibilidad al integrar el formulario.

El detalle administrativo mostrará las tres fechas y responsables. El seguimiento privado del cliente podrá mostrar transportista, referencia de seguimiento y fechas de despacho/entrega; excluirá identificadores de empleados y notas internas. Los datos no se interpretan como una URL ni se consultan automáticamente en un proveedor externo.

## Validación y próxima implementación

La preparación previa del diseño se conserva como evidencia histórica en `.checkout-review/envios-diseno/`. La implementación del esquema y la migración se validaron en MySQL 8.0.46 temporal. Evidencia vigente: `.checkout-review/envios-esquema/resultado.json`.

Pasaron **355 comprobaciones SQL**: las 293 anteriores y 62 nuevas de envíos. Se comprobaron fechas y datos parciales, extremos de longitud, espacios y controles, claves foráneas, responsables, envío único, salida única por envío y variante, movimientos anteriores con relación nula y ausencia de automatismos sobre stock y estados. La prueba anterior de pedidos conserva sus 113 casos y excluye la nueva tabla de envíos de su conteo de las veinticuatro tablas del núcleo.

Una base con las seis migraciones y datos sintéticos en las veinticuatro tablas se actualizó mediante `prisma migrate deploy`. Conservó cada columna y dato anterior, incluidos movimientos sin responsable, políticas y tarifas editadas, pedidos, unidades, facturación, revisiones y reservas. Veintitrés tablas conservaron además su estructura exacta; movimientos solo recibió la ampliación prevista. El segundo despliegue no reescribió datos. También se desplegaron las siete migraciones desde cero y el diff no encontró diferencias representables en Prisma.

Pasaron **391 pruebas del backend**: 244 unitarias, nueve HTTP y 138 con MySQL, incluidas siete nuevas de creación anidada, relaciones, referencias con ceros iniciales, compatibilidad de movimientos anteriores, unicidad, restricciones y rollback. Se aprobaron formato, validación, generación del cliente, compilación, TypeScript completo y lint. No se cambiaron las seis migraciones anteriores, las fuentes de la API ni el frontend; no se aplicaron seeds a la base de trabajo. El servidor y el directorio de MySQL temporal se retiraron al finalizar.

Para aplicar las migraciones pendientes en la base configurada, desde `soho-backend`:

```powershell
npm.cmd run db:migrate:deploy
```

El cliente Prisma ya se regeneró durante esta entrega; una copia del proyecto que todavía no lo tenga puede ejecutar `npm.cmd run db:generate`. La migración no crea envíos, movimientos ni transportistas ficticios ni recalcula direcciones o tarifas históricas. No habilita acciones administrativas por sí sola.

La API ya se implementó con piezas generadas mediante Nest CLI. Sus pruebas cubren permisos, transiciones, concurrencia entre administradores, última unidad, rollback entre varias líneas, doble envío, COMMIT incierto y entrega sin un segundo descuento. Consultar [API de envíos](api-envios.md) y el [estado vigente](estado-integracion.md) para resultados y próxima integración de pantallas.

Envíos parciales, correcciones de seguimiento ya despachado, cancelaciones, resolución formal de incidencias, devoluciones, reembolsos, contratación de couriers y notificaciones externas quedan para operaciones posteriores. La API y Angular implementan las tres acciones visibles y conservan deshabilitadas las simulaciones de cancelación y posventa sobre pedidos reales.

## Fuentes revisadas

- [Reglas actuales de entrega](../../soho-frontend/src/app/administracion/pedidos/modelos/entrega-admin.ts).
- [Formulario de entrega](../../soho-frontend/src/app/administracion/pedidos/componentes/formulario-entrega/formulario-entrega.html).
- [Movimientos e inventario](../../soho-frontend/src/app/administracion/productos/modelos/movimiento-inventario.ts).
- [Esquema vigente de pedidos y reservas](esquema-pedidos.md).
- [Esquema vigente de Prisma](../prisma/schema.prisma).
