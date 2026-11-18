# API de configuración de reservas

Implementada sobre `ConfiguracionReserva`, incluida desde la sexta migración. El usuario confirmó aplicadas las ocho migraciones existentes. Esta entrega no cambia el esquema ni añade migraciones. Las nuevas piezas se generaron con Nest CLI y se registraron en `PedidosModule`, reutilizando la autorización transaccional de `EscrituraPedidoService`.

## Rutas y acceso

| Método y ruta                             | Acción                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| `GET /api/admin/configuracion/reservas`   | Consultar política vigente, versión y último responsable |
| `PATCH /api/admin/configuracion/reservas` | Guardar la configuración completa para nuevas reservas   |

Ambas requieren sesión ADMIN activa, utilizan el límite existente `consultar-pedido` y devuelven `200` con `Cache-Control: no-store`. La escritura exige origen autorizado y `X-CSRF-Token`. La sesión, inactividad, vigencia, usuario activo y rol se comprueban nuevamente dentro de la transacción bajo bloqueo. No hay lectura pública ni creación o eliminación de esta configuración.

## Consulta

```json
{
  "configuracion": {
    "version": 1,
    "modo": "HASTA_DECISION",
    "horas": null,
    "accionVencimiento": null,
    "accionCancelacion": "LIBERAR",
    "creadoEn": "2026-11-14T12:00:00.000Z",
    "actualizadoEn": "2026-11-14T12:00:00.000Z",
    "actualizadoPor": null
  },
  "capacidades": {
    "reservaTemporalDisponible": true
  }
}
```

Las fechas y valores son ilustrativos; la API devuelve los datos persistidos. Tras una modificación, `actualizadoPor` contiene exclusivamente `{ id, nombre }`; no expone correo, sesión o credenciales. Se registra la última modificación, no una bitácora completa de todos los ajustes.

Si falta la fila única ID 1, devuelve `503 / CONFIGURACION_RESERVAS_NO_DISPONIBLE`. No crea otra fila ni restablece una política inicial silenciosamente.

## Guardado

```json
{
  "version": 1,
  "confirmado": true,
  "modo": "HASTA_DECISION",
  "horas": null,
  "accionVencimiento": null,
  "accionCancelacion": "PREGUNTAR"
}
```

Los seis campos son obligatorios. Se rechazan campos adicionales, versiones como texto y confirmaciones distintas del booleano `true`. El cliente no elige ID, responsable, fechas, capacidades ni cantidades de inventario.

- `version`: entero entre 1 y 4294967295; debe coincidir con la consultada.
- `modo`: `HASTA_DECISION` o `TIEMPO`.
- `HASTA_DECISION`: exige `horas: null` y `accionVencimiento: null`.
- `TIEMPO`: exige horas enteras entre 1 y 999999 y acción `LIBERAR_Y_ALERTAR` o `SOLO_ALERTAR`. Se permite activarlo y editarlo con la versión consultada y confirmación explícita.
- `accionCancelacion`: `LIBERAR` o `PREGUNTAR`; `CONSERVAR` es una decisión de cancelación de un pedido, no una política de configuración.

El servicio bloquea la fila de configuración, vuelve a leerla y comprueba su versión. Si los valores coinciden, devuelve el mismo detalle y `modificada: false`, sin cambiar versión, fecha ni responsable. Una versión atrasada devuelve conflicto incluso si los valores coinciden.

Si hay cambios permitidos, incrementa una vez la versión y registra responsable y fecha del servidor; devuelve `modificada: true`. Una versión máxima permite leer y confirmar sin cambios, pero bloquea nuevas modificaciones. Una fecha persistida futura impide reescribir la cronología.

## Modo temporal

La API informa `reservaTemporalDisponible: true` y permite activar o editar una política `TIEMPO`. Una duración, acción o confirmación inválida devuelve `400` sin escrituras. Un guardado válido incrementa la versión una vez, registra responsable y fecha y se aplica únicamente a reservas creadas después del cambio.

La reserva temporal guarda `venceEn = creadoEn + horas` junto a su política y versión históricas. Editar duración, acción o modalidad general no renueva ni elimina plazos anteriores. Se permite volver a `HASTA_DECISION`, enviando duración y acción de vencimiento como `null`; los pedidos anteriores mantienen su política temporal.

El [trabajador de vencimientos](vencimientos-reservas.md) se ejecuta al arrancar y programa lotes separados por sesenta segundos; no promete ejecución exacta al segundo de la fecha límite. Atiende reservas activas de pagos pendientes u observados según su política histórica: `LIBERAR_Y_ALERTAR` libera y registra una incidencia; `SOLO_ALERTAR` mantiene las unidades reservadas y registra la alerta interna. Conserva pagos aprobados y reservas retenidas expresamente al cancelar. La marca persistida y los bloqueos impiden atender dos veces una reserva.

La [recuperación administrativa](api-recuperacion-reservas.md) permite continuar después de liberar, si hay disponibilidad completa, sin aprobar el pago automáticamente. Angular muestra alertas reales; no libera inventario por una comparación de fecha en el navegador. No se envían correos de vencimiento ni se cancela o rechaza automáticamente un pago.

## Pedidos e historial de reservas

La creación de pedidos mantiene un bloqueo compartido sobre la misma fila mientras copia la política. El guardado administrativo utiliza un bloqueo exclusivo; así, un checkout concurrente recibe una versión y política coherentes.

Los cambios se aplican únicamente a reservas nuevas. Cada reserva anterior conserva versión, modo, duración, acciones y vencimiento históricos. Guardar configuración no modifica pedidos, estados de pago, comprobantes, eventos, contadores reservados, existencias físicas, movimientos o cobertura. No cambia distritos, precios ni tarifas y no envía notificaciones.

Cambiar de `LIBERAR` a `PREGUNTAR` afecta a futuras cancelaciones de las reservas nuevas. Las anteriores siguen usando su política original mediante la [API de cancelaciones](api-cancelaciones.md).

## Conflictos y respuesta incierta

| Estado o código                              | Situación                                                     |
| -------------------------------------------- | ------------------------------------------------------------- |
| `400`                                        | Cuerpo, campos, confirmación, versión o política incoherentes |
| `401 / 403`                                  | Sesión, rol, origen o CSRF insuficientes                      |
| `409 / CONFIGURACION_RESERVAS_CAMBIADA`      | Otra operación modificó la versión consultada                 |
| `409 / VERSION_RESERVAS_AGOTADA`             | Un cambio requiere incrementar la versión máxima              |
| `409 / CONFIGURACION_RESERVAS_INCONSISTENTE` | Las fechas persistidas no permiten registrar el cambio        |
| `503 / CONFIGURACION_RESERVAS_NO_DISPONIBLE` | Falta la fila única de configuración                          |

Ante conflicto, conservar el borrador y consultar nuevamente antes de decidir otro guardado. Si se pierde la respuesta, consultar por GET y comparar política, versión y metadatos; no repetir automáticamente el PATCH. Una escritura confirmada hace que un reintento con su versión anterior reciba conflicto. Se reutilizan únicamente los reintentos existentes de transacciones revertidas `P2034`; los errores de resultado incierto no se repiten en el servicio.

## Validación

La habilitación temporal verificó **726 pruebas del backend**: 401 unitarias, nueve HTTP y 316 con MySQL 8.0.46 temporal, once de integración nuevas. Se comprobaron activación y edición, límites de duración, confirmación, no-op, conflictos entre administradores y checkout concurrente. Ambas acciones de vencimiento se verificaron con pagos pendientes u observados, cambio posterior de configuración, recuperación, corrección del comprobante, aprobación y despacho. Angular aprobó **708 pruebas en 129 archivos**, ocho nuevas de controles habilitados, validación, confirmación, guardado, conflictos y respuesta perdida. Las pruebas usaron MySQL aislado, nunca `soho_db`; esquema y ocho migraciones permanecieron intactos. No se necesitaron nuevas piezas NestJS: se adaptaron las existentes.

Siete recorridos de Chrome con la API compilada comprobaron el temporizador real, sin invocar manualmente al trabajador, ambas políticas históricas, pagos aprobados y observados, recuperación y respuesta perdida al guardar. Capturas a 1440, 768 y 390 px sin desbordamientos ni excepciones; servidores y perfiles temporales retirados.

Pasaron **631 pruebas del backend**: 373 unitarias, nueve HTTP y 249 con MySQL 8.0.46 temporal, incluidas 66 unitarias y 32 de HTTP con MySQL nuevas. Se comprobaron contratos, permisos, CSRF, metadatos privados, versiones, ausencia de cambios, límite de versión, bloqueo temporal, configuración preexistente, fila ausente, reservas históricas, checkout concurrente, dos administradores, rollback, respuesta perdida después de COMMIT y revocación de sesión mientras esperaba un bloqueo.

Pasaron compilación, TypeScript completo, lint sin avisos y formato. La API compilada también se comprobó por HTTP en un proceso real contra MySQL aislado. Las fuentes de Angular, el esquema y las ocho migraciones permanecieron intactos; no se escribió en `soho_db` ni se enviaron notificaciones externas. Evidencia en `.checkout-review/reservas-config-api/` desde la raíz SOHO. Los procesos y directorios temporales se retiraron al terminar.

La [integración Angular de Configuración → Inventario](../../soho-frontend/docs/integracion-configuracion-reservas.md), el [procesamiento de vencimientos](vencimientos-reservas.md) y la [recuperación de reservas](api-recuperacion-reservas.md) están implementados. El modo temporal ya está habilitado para que el administrador configure su duración y acción. Habilitar la funcionalidad no cambia automáticamente la política que ya tenía guardada la tienda. Evidencia de esta entrega: `.checkout-review/reservas-temporales/`.
