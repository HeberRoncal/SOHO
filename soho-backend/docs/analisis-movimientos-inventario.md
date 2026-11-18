# Revisión de movimientos manuales de inventario

Fecha: 15 de noviembre de 2026. Esta entrega analiza el funcionamiento existente y propone el siguiente alcance. No implementa rutas, modifica Prisma ni prepara o aplica una migración.

Continuidad: el esquema y la [API de movimientos manuales](api-movimientos-inventario.md) ya están implementados sobre la [undécima migración](esquema-movimientos-inventario.md). El resto de este documento conserva el análisis previo; el diálogo Angular sigue pendiente de conexión.

## Resultado

Se puede reutilizar el historial y gran parte del formulario. La escritura de demostración requiere adaptación antes de habilitarla: permite generar faltantes bajo reservas, obtiene los SKU solo de los productos cargados y carece de recuperación persistida de operaciones. El esquema conserva los saldos históricos y el responsable, pero no tiene una clave única por solicitud manual ni una versión propia de las existencias.

Se recomienda preparar una **undécima migración compatible**, limitada a una versión de stock físico en `Variante` y datos de idempotencia en `MovimientoInventario`. No se necesita reemplazar las tablas de inventario, pedidos o reservas.

## Pantallas y reglas actuales

| Área | Implementación actual | Adaptación propuesta |
| --- | --- | --- |
| Entradas y salidas | La cantidad del formulario es positiva; la salida genera un delta negativo. | Conservar esa presentación y validar de nuevo el signo en el servidor. |
| Ajustes | Se elige sumar o restar una cantidad. No representa un saldo objetivo. | Conservar el significado y mostrar claramente el saldo resultante. |
| Reservas | El movimiento conserva el contador, pero permite dejar el físico por debajo de él mostrando una advertencia. Las pruebas de demostración confirman ese comportamiento. | Bloquear reducciones que produzcan o agraven un déficit. No liberar ni reasignar reservas desde un movimiento. |
| Motivos | Texto obligatorio de hasta 160 caracteres; referencia opcional de hasta 80. Sugiere «Envío de pedido» y «Retorno de cliente». | Separar el despacho automático. Una entrada manual no tramita una devolución ni un reembolso. |
| SKU | El selector recorre `ProductosAdministracion.productos()`. | Buscar variantes en el servidor; la página actual del listado no contiene todo el catálogo. Resolver también el SKU inicial por consulta exacta. |
| Publicación y habilitación | El selector incluye productos archivados y variantes deshabilitadas. | Permitir contabilizar existencias físicas sin publicar, restaurar ni habilitar productos. Mantener visibles esos estados. |
| Guardado | Síncrono, en memoria y sin confirmación del servidor. La implementación remota lo rechaza. | ADMIN, CSRF, transacción, clave persistida, control de concurrencia y recuperación. |
| Cierre | Cancelar o cerrar el diálogo emite la salida directamente. | Conservar campos ante errores y advertir antes de descartar cambios o abandonar un resultado incierto. |
| Historial | Consulta real con filtros, paginación y saldos históricos. | Reutilizarla; añadir registros manuales sin reescribir movimientos anteriores. |

**Ejemplo del ajuste:** con físico 8 y conteo real 6, registrar «Ajuste → Restar → 2» deja 6. Enviar 6 como cantidad a restar dejaría 2 y no corresponde al funcionamiento actual.

Fuentes: [evaluación y contrato de demostración](../../soho-frontend/src/app/administracion/productos/modelos/movimiento-inventario.ts), [formulario](../../soho-frontend/src/app/administracion/productos/componentes/movimiento-inventario/movimiento-inventario.ts), [plantilla](../../soho-frontend/src/app/administracion/productos/componentes/movimiento-inventario/movimiento-inventario.html), [pruebas de sus reglas](../../soho-frontend/src/app/administracion/productos/modelos/movimiento-inventario.spec.ts) y [servicio remoto que mantiene bloqueada la escritura](../../soho-frontend/src/app/administracion/productos/servicios/productos-administracion-api.ts).

## Política recomendada para la primera integración

- Una operación afecta una variante guardada, identificada por UUID; el SKU se muestra como referencia y no se regenera.
- Cantidad absoluta entre 1 y 99999. Físico final entre 0 y 99999. Nunca se acepta delta cero.
- Entrada: delta positivo. Salida: negativo. Ajuste: positivo o negativo según el sentido elegido. El backend calcula el saldo; no acepta un saldo final impuesto por el navegador.
- Una reducción solo se admite si el físico final cubre todas las reservas activas. Ejemplo: físico 10, reservado 7 y salida 4 se rechaza; una salida 3 es admisible.
- Si ya existe déficit, una entrada o un ajuste positivo puede reducirlo parcialmente. Ejemplo: físico 5, reservado 7 y entrada 1 deja físico 6 y mantiene el faltante de 1 visible. La operación no asegura que el pedido ya pueda despacharse.
- Un conteo o daño que afecte unidades comprometidas requiere resolver la incidencia mediante el flujo autorizado de pedidos. Esta primera entrega no incorpora una excepción para reducir stock reservado, cancelación automática, reembolsos o reasignación de unidades.
- Origen `MANUAL`, fecha y responsable se fijan en el servidor. `ENVIO_PEDIDO` pertenece exclusivamente al despacho y conserva su unicidad por envío/variante. La primera reposición de una talla creada en cero es una entrada manual con su motivo; no genera otro movimiento automático `STOCK_INICIAL`.
- Los registros confirmados son históricos: una corrección posterior genera otro movimiento con motivo. No se ofrecen edición ni eliminación del registro.

Esta política de déficit es una recomendación explícita para la integración real; modifica el permiso de la demostración y todavía no está implementada. Un flujo excepcional de pérdidas que comprometan pedidos, especialmente con pago aprobado, queda separado.

El disponible administrativo conserva su fórmula: variante habilitada → `max(0, físico − reservado)`; deshabilitada → cero. Registrar stock en un borrador o producto archivado no lo vuelve visible en la tienda.

## Esquema existente y ampliación recomendada

`MovimientoInventario` ya contiene variante, usuario responsable, tipo, delta, saldo anterior/posterior, reservado y habilitación históricos, motivo, referencia, origen y fecha. SQL comprueba límites, signo por tipo, igualdad del saldo y coherencia del origen de envío. Las filas históricas pueden conservar responsable nulo.

`Variante` contiene físico, reservado y `actualizadoEn`, pero no una revisión monotónica del físico. La versión de `Producto` se utiliza para edición comercial y publicación. Tampoco existe una clave única de solicitud manual en `MovimientoInventario`; la unicidad por envío/variante solo protege los despachos.

Campos propuestos, aún sin modificar el [esquema activo](../prisma/schema.prisma):

| Modelo | Campo propuesto | Propósito |
| --- | --- | --- |
| `Variante` | `versionExistencias`: entero sin signo, predeterminado 1 | Detectar cambios del físico, incluso si movimientos intermedios dejan el mismo saldo. |
| `MovimientoInventario` | `claveSolicitud`: UUID opcional, único | Identificar la operación manual y evitar otra aplicación del delta. |
| `MovimientoInventario` | `solicitudHash`: SHA-256 opcional | Rechazar una clave reutilizada con otros datos o expectativas. |
| `MovimientoInventario` | `respuesta`: JSON opcional | Recuperar el resultado original después de COMMIT sin reconstruirlo con el estado actual. |

Los tres campos de recuperación serían nulos en movimientos anteriores y en despachos automáticos. Los movimientos nuevos de la API manual exigirían los tres, responsable y origen `MANUAL`. La migración debe incorporar restricciones para que el conjunto sea completo o completamente nulo, UUID/hash válidos y respuesta de tipo objeto. No debe modificar los saldos, fechas, motivos ni responsables existentes.

`versionExistencias` cambiaría al modificar el físico desde movimientos manuales **y desde el despacho existente**. Agregar solo la columna y actualizarla en el nuevo formulario no basta. Las reservas no cambian el físico; se compararía además el reservado observado por el administrador al confirmar. La habilitación observada también se comprobaría. La versión comercial del producto permanecería independiente.

No usar `actualizadoEn` como versión estricta: el campo tiene precisión de milisegundos y no equivale a un contador monotónico. No ampliar `OperacionProducto` para registrar inventario: su tipo y sus versiones corresponden al ciclo comercial del producto.

## Contrato propuesto

Las siguientes rutas son propuestas, no endpoints habilitados:

- `GET /api/admin/inventario/variantes`: búsqueda paginada por SKU/producto, con filtro opcional por producto y resolución exacta de SKU. Entrega UUID, identidad, estado, habilitación, físico, reservado, disponible, faltante y versión de existencias. Incluye variantes guardadas fuera de la página actual y permite identificar las archivadas/deshabilitadas.
- `POST /api/admin/inventario/variantes/:id/movimientos`: recibe clave UUID, versión de existencias, reservado y habilitación esperados, tipo, delta con signo, motivo y referencia opcional. La interfaz convierte su cantidad positiva/sentido a ese delta. El backend rechaza signos incompatibles y campos protegidos.
- `GET /api/admin/inventario/movimientos/operaciones/:claveSolicitud`: devuelve la respuesta confirmada solo al ADMIN que inició la operación. Una clave ajena o inexistente responde 404.

Se mantienen los `GET` existentes de movimientos y resumen. El POST y su recuperación devuelven identidad del movimiento, historial resultante, clave y versión física anterior/posterior, además de la variante al confirmar. El cliente debe consultar luego la variante vigente: la respuesta recuperada es histórica.

Misma clave, administrador, variante y cuerpo normalizado: devolver la operación anterior, incluso si después cambió el stock. Otros datos o identidad con esa clave: conflicto. Consultar o reenviar con la misma clave, versión y cuerpo ante resultado incierto. Un 404 de recuperación mientras el POST puede seguir en curso no autoriza a crear otra clave. Un rechazo definitivo permite corregir datos; un 409 de concurrencia requiere consultar y volver a revisar antes de una operación nueva.

La confirmación mostrará SKU, operación, delta, físico anterior/final, reservado y disponible resultante. El responsable, fecha, origen, SKU nuevo, datos de envío y saldos históricos no se aceptarán como campos elegidos por el cliente.

## Transacción y convivencia con pedidos

Reutilizar [autorización transaccional y reintentos acotados](../src/autenticacion/seguridad/escritura-autorizada.service.ts) y la [comprobación de reservas](../src/inventario/reservas/inventario-reservado.service.ts), reorganizada en el módulo compartido de inventario. Esta última bloquea variantes en orden de UUID y verifica que el contador coincida con la suma de reservas `ACTIVA`. No duplicar esa lógica en el nuevo servicio.

Secuencia prevista dentro de una única transacción:

1. Autorizar de nuevo la sesión ADMIN y comprobar si la clave ya tiene una respuesta confirmada.
2. Bloquear la variante y conciliar su contador de reservas; comprobar la clave nuevamente tras esperar el bloqueo.
3. Comparar la versión física y los valores reservados/habilitados que el administrador revisó. Validar identidad, límites y política de reducción.
4. Actualizar el físico e incrementar su versión, sin cambiar reservas. Insertar el movimiento, hash y respuesta original completos en la misma transacción.
5. Si falla el historial, la autorización o cualquier validación, revertir todo. La clave única de SQL resuelve carreras entre solicitudes repetidas; no basta un `Set` en memoria.

No adquirir después bloqueos de pedidos para decidir qué reservas liberar: la operación manual no cambia pedidos. El orden debe comprobarse con el checkout, que bloquea variantes y datos relacionados, y con sesión/pedido/pago/variantes del resto de acciones. Conservar los reintentos precisos del adaptador existentes, sin repetir efectos externos.

El [despacho](../src/pedidos/envios/envios-pedidos.service.ts) ya consume reservas y descuenta físico con un movimiento por variante. La aprobación de pago no descuenta físico. Cancelaciones, rechazos y vencimientos liberan reservas según su flujo; no son salidas físicas. Una entrada que reduzca un faltante tampoco recupera automáticamente reservas vencidas ni aprueba pagos.

## Integración Angular posterior

Reutilizar el diálogo, el historial y los accesos existentes, conservando la demostración aislada. Añadir una capacidad específica para movimientos manuales; no desactivar globalmente `soloLectura`, porque también restringe archivo, restauración y otras acciones pendientes.

El selector tendrá búsqueda remota y saldos vigentes. Durante una escritura se impedirá un segundo envío. Los campos permanecerán ante rechazos; una operación incierta conservará su solicitud por cuenta/pestaña y ofrecerá consulta o reintento exacto, también al volver a abrir el diálogo. El cierre no supondrá que se revirtió un POST.

Tras confirmar, actualizar la variante, el detalle/listado, el historial y el resumen que correspondan, conservando filtros. Un fallo de esa lectura posterior no repetirá el movimiento. Una clave pendiente se conservará hasta poder consultar el estado necesario. La disponibilidad del checkout seguirá verificándose en el servidor.

## Orden de las entregas y verificación

1. Preparar y validar la undécima migración y regenerar Prisma, sin aplicarla a `soho_db` como parte de pruebas. Conservar las diez migraciones anteriores y todos los datos históricos.
2. Implementar los endpoints y la versión física en despacho. Generar las piezas nuevas con Nest CLI; reutilizar autorización, bloqueos y componentes existentes.
3. Conectar el diálogo Angular con búsqueda remota, confirmación, recuperación y actualización del historial. No habilitar entradas reales hasta que el backend esté verificado.

Casos necesarios para esas entregas: dos administradores sobre la misma versión; claves simultáneas iguales y distintas; respuesta perdida tras COMMIT; rollback del historial; sesión revocada mientras espera; últimas unidades frente a checkout; salida frente a despacho/cancelación/vencimiento; reposición parcial de un déficit; SKU deshabilitado/archivado; ajuste que excede límites; invariancia de pedidos, reservas, códigos, precios y fotografías; selección de un SKU fuera de la página visible.

Esta revisión fue estática: se leyeron fuentes, contratos, esquema, restricciones SQL y pruebas existentes. No se ejecutaron migraciones, seeds, peticiones de escritura o pruebas con datos reales; no se modificó código de aplicación. Las pruebas de implementación se realizarán con MySQL temporal y datos sintéticos.
