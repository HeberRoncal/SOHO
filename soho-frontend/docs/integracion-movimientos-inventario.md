# Movimientos manuales de inventario

El diálogo de **Productos e inventario → Registrar movimiento** utiliza la [API real de inventario](../../soho-backend/docs/api-movimientos-inventario.md). También puede abrirse desde el historial o desde **Registrar** en una variante del detalle del producto. Conserva el diseño existente y mantiene la demostración separada de las escrituras reales.

## Recorrido

1. Buscar un SKU o producto en el catálogo remoto, con paginación. La búsqueda no depende de los productos de la página visible. Al elegir una variante, se consultan nuevamente su stock físico, reservado, disponible, habilitación y versión.
2. Elegir entrada, salida o ajuste, indicar unidades, motivo y referencia opcional. La cantidad del formulario es positiva; el tipo y el sentido determinan el delta con signo enviado al backend. Un ajuste resta o suma unidades: no reemplaza el saldo por la cantidad escrita.
3. Elegir **Revisar movimiento** y comprobar SKU, saldo anterior, cambio, saldo resultante y reservas. Solo **Confirmar movimiento** realiza la escritura.
4. Tras la confirmación, se recargan listado, detalle, historial y resumen conservando sus filtros. La respuesta histórica acredita la operación; una consulta posterior proporciona los saldos actuales.

Las reducciones que dejan menos stock físico que unidades reservadas se bloquean antes del envío y el backend vuelve a validarlas. Se permite reponer parcialmente un déficit existente. Los productos archivados y variantes deshabilitadas conservan su estado; el diálogo avisa de esa condición. El despacho mantiene su flujo automático propio.

## Conflictos y recuperación

Un conflicto conserva los campos y exige **Actualizar saldos** antes de revisar nuevamente. La solicitud incluye la versión física, el reservado y la habilitación observados; Angular no inventa responsables, saldos confirmados, SKU ni fechas.

Antes del POST se guarda en `sessionStorage` la clave de operación, la variante y el cuerpo exacto, bajo una clave propia del administrador. Si no se puede conservar esa información, no se envía la escritura. No se guardan cookies ni secretos. Las respuestas de otra identidad o revisión de sesión se descartan.

Si se pierde la respuesta, se bloquean nuevas operaciones y aparecen **Consultar resultado** y **Reintentar misma solicitud**. El reintento conserva la clave y el cuerpo originales. Un 404 al consultar no prueba que el POST haya fallado y mantiene la operación pendiente. Tras validar el resultado histórico y consultar la variante actual se puede continuar. El cierre y la reapertura del diálogo conservan la recuperación en la misma pestaña y cuenta.

Si el movimiento quedó confirmado pero falla la actualización de las consultas, se informa **Movimiento confirmado** y se ofrece **Actualizar consultas**. Esa acción solo realiza lecturas. No repite el movimiento.

El cierre, Escape y la navegación protegen los cambios sin enviar y las operaciones pendientes; la salida requiere una decisión explícita. Durante el envío se bloquean dobles confirmaciones. Los errores se muestran dentro del diálogo y el foco acompaña la revisión y los avisos.

## Alcance y requisitos

`movimientosDisponibles` habilita este recorrido sin convertir el indicador heredado `capacidades.escrituraDisponible: false` en autorización general. La edición de publicados y archivo/restauración siguen pendientes. Cada operación real requiere ADMIN, cookies y CSRF mediante el interceptor existente.

La API necesita la **undécima migración**, `20261115020000_preparacion_movimientos_inventario`, y el cliente Prisma correspondiente. El usuario ya confirmó aplicada esta migración en `soho_db`. Esta integración no añade migraciones ni modifica fuentes del backend; el agente no volvió a ejecutar la migración en la base real. Consultar la [guía del esquema](../../soho-backend/docs/esquema-movimientos-inventario.md).

## Validación

Pasaron **839 pruebas Angular en 136 archivos** y la compilación de producción. Las pruebas nuevas cubren contratos, deltas, sesión, almacenamiento, versiones, reservas, doble envío, cierre, recuperación y recarga de consultas.

Chrome verificó seis recorridos con Angular compilado, NestJS real y las once migraciones en MySQL temporal: búsqueda fuera de la página visible y cierre protegido; entrada confirmada; conflicto concurrente con campos conservados; recuperación tras COMMIT sin respuesta; fallo de resumen posterior sin repetir escritura; y salida que compromete reservas bloqueada. Se obtuvieron **18 capturas a 1440, 768 y 390 px**, sin desbordamientos, imágenes fallidas ni errores de consola. El entorno utiliza datos sintéticos y desactiva exclusivamente el límite administrativo para ejecutar repetidamente esos recorridos locales; no sustituye autenticación, CSRF ni transacciones.

Evidencia reproducible en `.checkout-review/movimientos-frontend/`, desde la raíz SOHO. Los hashes de las fuentes y el esquema del backend se conservaron. No se escribieron datos en `soho_db` ni en proveedores externos; los servidores y datos temporales se retiraron. El detector estático señaló dos imágenes sin `src` literal en las pantallas existentes: usan `[src]` de Angular y se comprobaron cargadas en Chrome.
