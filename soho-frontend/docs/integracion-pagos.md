# Pagos administrativos y corrección de comprobantes

La aplicación conecta `/admin/pagos`, `/admin/pagos/:codigo`, `/admin/pedidos`, `/admin/pedidos/:codigo` y los resúmenes de pagos del Dashboard con la [API de pagos](../../soho-backend/docs/api-pagos.md). Utiliza las seis migraciones existentes y no cambia el esquema.

## Fuentes y permisos

`PagosAdministracion` es un token con contrato independiente y proporciona `PagosAdministracionApi` por defecto; `app.config.ts` conserva su vinculación explícita. El servicio anterior quedó exclusivamente en fixtures de pruebas. Pedidos administrativos delega directamente en las API de envío y cancelación. Consultar [Limpieza de Pedidos y Pagos](limpieza-pedidos-pagos.md). Los adaptadores reutilizan el contrato de pedidos de la tienda, conservan datos históricos y ordenan los comprobantes por versión descendente para Administración. Las consultas del cliente conservan el orden ascendente del contrato público.

Las rutas requieren ADMIN y el backend vuelve a autorizar cada operación. La caché descarta datos y respuestas tardías al cambiar de cuenta o de revisión de sesión. Las consultas administrativas incluyen revisores e historial interno; la respuesta pública sigue excluyendo esos datos. Los listados tienen filtros y paginación de servidor, con carga, error, vacío y reintento reales. La navegación conserva filtros en la URL.

## Revisión

La imagen se obtiene como Blob desde el endpoint privado, valida MIME y tamaño y se presenta con una URL temporal del navegador. Cambiar de comprobante o destruir el visor libera esa URL y descarta respuestas tardías. Se conservan zoom, rotación y vista ampliada. El monto no informado se muestra como tal; no se deduce de la imagen ni se presenta como una transferencia verificada.

La ventana fija el identificador del comprobante y las versiones del pedido y pago que se abrieron. Una actualización posterior no hace que una decisión recaiga sobre una versión que el administrador no revisó. La confirmación bloquea doble envío y cierre mientras guarda. Los errores conservan motivo y mensaje. Ante conflicto o respuesta incierta se consulta el estado sin repetir la escritura.

Observar solicita una captura legible o corregida. Aprobar confirma el pedido conservando reserva y stock físico. Rechazar libera las reservas activas sin cancelar automáticamente el pedido ni reembolsar. Las versiones anteriores permanecen consultables y no admiten nuevas decisiones. Revisor, fecha, motivo, solicitud y mensaje se muestran en el historial.

Pedidos comparte la fuente real y consulta cada detalle al abrirlo, incluso al entrar por un enlace directo. Preparación, despacho, entrega y [cancelaciones](integracion-cancelaciones.md) ya están integrados con sus APIs y sus pantallas no ofrecen alternativas simuladas. Posventa sigue pendiente y oculta. Los resúmenes del Dashboard usan totales de servidor y las fechas de aprobación en Lima; no calculan totales a partir de una página o de la caché. Productos e inventario también utiliza exclusivamente sus componentes y fuentes reales.

## Corrección del cliente

El seguimiento muestra la observación. Para un pago observado de un pedido no cancelado ofrece `CorreccionComprobante`, con selección de imagen, vista previa, operación opcional y carga con confirmación del backend. Reutiliza `PedidosApi`, el contexto de sesión/CSRF y la credencial de invitado de esa pestaña. El número de operación conserva sus ceros iniciales.

La nueva captura se añade al mismo pedido y vuelve a revisión sin vaciar el carrito ni crear otra compra. No se guardan imágenes ni datos personales en almacenamiento persistente. Un conflicto conserva el archivo y solicita actualizar el pedido. Un resultado tardío de otra sesión no muestra información privada. Un pago rechazado o aprobado no ofrece esta corrección.

Los textos del seguimiento distinguen pendiente, observado, aprobado, rechazado y cancelado. Las pantallas conectadas ya no ofrecen controles para forzar sus estados de demostración. La estructura administrativa identifica sus datos reales, manteniendo la señal de demostración en los módulos pendientes.

## Validación

Las pruebas cubren contratos, filtros, sesiones, decisiones, versiones fijadas, doble envío, conflictos, imágenes y respuestas tardías. La evidencia de MySQL temporal, recorridos de Chrome y capturas de 1440, 768 y 390 px está en `.checkout-review/pagos-api/`. No se escribió en `soho_db`, no se añadieron migraciones ni se enviaron notificaciones externas.

Pasaron 528 pruebas de Angular y 384 del backend (244 unitarias, nueve HTTP y 131 MySQL), compilaciones, TypeScript y lint. Siete recorridos de navegador verificaron el ciclo de revisión y corrección, aprobación, rechazo, sincronización de Pedidos y Dashboard y recuperación de errores de red. El detector estático emitió siete avisos por `[src]`; se comprobaron las imágenes reales en las plantillas y el navegador.
