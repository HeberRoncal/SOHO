# Procesamiento automático de vencimientos de reservas

El backend atiende las reservas temporales sin depender de Angular ni de una sesión administrativa. No se modifica el esquema ni se agrega una novena migración. La [configuración temporal](api-configuracion-reservas.md) está habilitada (`reservaTemporalDisponible: true`) y la [recuperación de reservas por vencimiento](api-recuperacion-reservas.md) está integrada. Cambiar configuración se aplica solo a reservas nuevas; cada reserva anterior mantiene su política y plazo históricos.

## Ejecución y selección

`ProcesadorVencimientosService` inicia un lote al arrancar NestJS y programa el siguiente sesenta segundos después de terminar el anterior. No solapa lotes en el mismo proceso. En `NODE_ENV=test` no programa ejecuciones; las pruebas llaman al servicio explícitamente. Al cerrar espera el lote en curso antes de desconectar Prisma.

Cada lote descubre hasta cincuenta reservas, ordenadas por fecha e identificador, y agrupa su atención por pedido. El cursor avanza incluso ante un pedido inconsistente y vuelve al principio al terminar la pasada. Así otros pedidos pueden continuar y los fallos se reintentan en una pasada posterior. Las fechas y marcas en MySQL permiten recuperar vencimientos después de un reinicio; el cursor en memoria no decide si una reserva ya fue atendida.

Son candidatas las reservas `ACTIVA`, `TIEMPO`, con `venceEn <= ahora` y `vencimientoAtendidoEn IS NULL`, de pedidos `PENDIENTE` o `INCIDENCIA` con pago `PENDIENTE` u `OBSERVADO`, sin cancelación ni preparación/envío registrados. Dentro de la transacción se comprueban otra vez estos requisitos y se excluye cualquier pedido con reservas consumidas. No se corrigen estados incoherentes automáticamente.

Nunca se atienden reservas de pagos `APROBADO`, `RECHAZADO` o `ANULADO`, pedidos cancelados, preparados, despachados o entregados, ni reservas ya cerradas o atendidas. Una cancelación con decisión expresa de conservar mantiene sus reservas aunque tengan fecha vencida. Aprobar conserva las reservas para preparar y despachar, independientemente del plazo histórico.

## Política histórica y registro único

Se aplica la política y versión guardadas en cada reserva, sin consultar ni reescribir la configuración actual. Observar o corregir un comprobante no renueva su fecha límite.

| Política            | Resultado                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIBERAR_Y_ALERTAR` | Marca la atención, cierra la reserva como `LIBERADA`, registra fecha y motivo, resta únicamente sus unidades del contador reservado y pasa el pedido a `INCIDENCIA`. |
| `SOLO_ALERTAR`      | Marca la atención y mantiene la reserva `ACTIVA`, su contador reservado y el estado de entrega anterior.                                                             |

Cada reserva atendida genera un evento `RESERVA_VENCIDA`, de actor `SISTEMA`, responsable nulo y visibilidad `INTERNA`. Identifica reserva, SKU, cantidad, fecha límite, versión histórica y resultado. Artículos con vencimientos diferentes pueden producir eventos en transacciones posteriores: la unicidad se garantiza por reserva atendida, no por un único evento para todo el pedido.

Reservas, contador, eventos y versión del pedido se guardan en una sola transacción. La versión del pedido aumenta una vez por atención con cambios; la versión del pago permanece intacta. Un reintento sin cambios no aumenta versiones ni repite alertas. Un fallo antes del COMMIT revierte todo; una respuesta perdida después del COMMIT se recupera consultando las marcas persistidas.

No se modifican existencias físicas, comprobantes ni estados de pago. No se crean movimientos físicos, cancelaciones ni reembolsos.

## Concurrencia

La búsqueda de candidatas no bloquea reservas. La escritura reutiliza `EscrituraPedidoService` y `InventarioReservadoService`: bloquea pedido, pago y variantes ordenadas, verifica el contador contra la suma de reservas activas y atiende solo el pedido bloqueado. Dos instancias pueden descubrir la misma reserva; el bloqueo y la marca persistida impiden atenderla dos veces. Los errores transaccionales recuperables usan los reintentos existentes.

- Si primero se aprobó el pago, el trabajador relee `APROBADO` y no atiende el vencimiento.
- Una reserva vencida con política de liberar ya impide aprobar el pago, aunque el trabajador todavía no la haya liberado. Después de liberarla tampoco se puede aprobar sin resolver su reserva.
- Con `SOLO_ALERTAR`, aprobar sigue permitido con reservas suficientes y versiones actuales. Un formulario anterior a la atención debe actualizarse.
- Cancelación, rechazo, corrección y despacho comparten el bloqueo del pedido. El trabajador comprueba el resultado actual y no vuelve a restar cantidades liberadas o consumidas.
- Una diferencia entre reservas y contador impide atender el pedido y revierte cualquier cambio. Los demás pedidos del lote pueden continuar.

## Lectura y alertas administrativas

El detalle administrativo agrega `vencimientoReservas: { unidadesLiberadas, unidadesConservadas }`. Son cantidades de vencimientos atendidos con alerta vigente, derivadas de las reservas; no se calculan comparando fechas en el navegador.

Después de incorporar recuperación, se considera únicamente la última reserva por artículo, ordenada por fecha de creación e identificador. Las reservas liberadas reemplazadas permanecen en el historial y dejan de sumar alertas; los ciclos posteriores no acumulan cantidades de vencimientos anteriores. Las alertas vigentes de otras líneas con `SOLO_ALERTAR` se conservan.

`GET /api/admin/pedidos?reserva=vencida` filtra pedidos con estas alertas y conserva búsqueda, paginación y demás filtros. Solo admite `reserva=vencida`. `GET /api/admin/resumen-pedidos` agrega `reservasVencidas` (hasta cinco pedidos) y `reservasVencidasTotal` (total de pedidos, no de unidades); estas alertas operativas son independientes del período de ventas.

Angular muestra un panel en el Dashboard con acceso al listado filtrado, un filtro en Pedidos y avisos en los detalles de pedido y pago. El historial interno conserva la atención. Aprobar, rechazar o cancelar retira la alerta vigente sin borrar ese historial. No se incorpora un estado de leído/descartado ni se envían notificaciones externas.

Los endpoints públicos de cuenta e invitado no devuelven la alerta, el evento interno ni la política histórica. Sus estados y cantidades públicas existentes se mantienen como parte del seguimiento.

## Generación y comprobación

Los dos servicios y sus pruebas iniciales se generaron desde `soho-backend` con Nest CLI y después se adaptaron:

```powershell
npx.cmd --no-install nest generate service pedidos/reservas/vencimientos-reservas --flat
npx.cmd --no-install nest generate service pedidos/reservas/procesador-vencimientos --flat
```

Se verificaron 669 pruebas del backend (382 unitarias, nueve HTTP y 278 con MySQL temporal), incluidas 29 nuevas de vencimientos con MySQL y nueve unitarias. Angular aprobó 666 pruebas, incluidas doce nuevas del contrato, resumen, filtro y bloqueo de aprobación. Pasaron compilación de ambos proyectos, TypeScript y lint del backend sin avisos. Las bases de prueba terminan en `_test`; nunca se utiliza `soho_db` como alternativa ni se repiten seeds en ella.

Siete recorridos de Chrome con Angular y NestJS compilados y MySQL 8.0.46 temporal comprobaron Dashboard, filtro del servidor, detalles de pedido y pago, conservación, privacidad y retiro de alertas al aprobar o cancelar. Se revisaron capturas a 1440, 768 y 390 px sin desbordamientos ni excepciones. Los servidores, perfiles de Chrome y directorios de datos temporales se retiraron al terminar.

Evidencia de esta entrega: `.checkout-review/vencimientos-reservas/` desde la raíz SOHO.
