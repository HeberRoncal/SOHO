# Integración de preparación y entrega de pedidos

Fecha: 14 de noviembre de 2026 (America/Lima).

Administración → Pedidos utiliza la [API de preparación y envíos](../../soho-backend/docs/api-envios.md) sobre la séptima migración, ya aplicada por el usuario. No se añade otra migración ni se modifica la API en esta entrega. Se conservan el diseño de las pantallas, los siete distritos y los datos históricos de cada compra.

## Acciones administrativas

Los pedidos reales con pago aprobado ofrecen una acción según su etapa:

| Estado         | Acción                | Efecto confirmado por el servidor                                                        |
| -------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| Confirmado     | Iniciar preparación   | Crea el envío y conserva reservas y existencias                                          |
| En preparación | Registrar envío       | Guarda transportista y referencia, consume reservas y descuenta existencias una sola vez |
| Enviado        | Marcar como entregado | Registra recepción, fecha y responsable, sin otro descuento                              |

Pago pendiente, observado, rechazado o anulado y entrega pendiente, con incidencia, cancelada o completada bloquean las acciones incompatibles. La [cancelación y liberación de reservas](integracion-cancelaciones.md) ya están integradas. Posventa continúa pendiente para pedidos reales.

Se reutilizan `GestionEntrega` y `FormularioEntrega`. `EnviosAdministracionApi` traduce sus campos a los tres endpoints, valida la versión abierta y comparte el caché administrativo confirmado con pagos. El interceptor existente incorpora cookies y CSRF. No se envían estados elegidos por el cliente, empleados, fechas ni datos de demostración.

La ventana de despacho pide transportista o responsable local, referencia textual de seguimiento y nota opcional. Admite reparto local sin contratar un courier. La referencia conserva ceros iniciales y no se convierte en enlace. Entregar requiere confirmar explícitamente que el cliente recibió el pedido. La nota se identifica como **interna**, de hasta 300 caracteres y visible solo para el equipo SOHO.

Guardar muestra espera y bloquea campos, doble envío, cierre y navegación durante la operación. No se cambia la etapa hasta recibir una respuesta confirmada. El detalle adopta versión, fechas y responsables de cada acción y distingue las notas internas en el historial. Un listado atrasado conserva la versión más reciente del pedido ya guardado.

## Errores y borradores

La validación muestra un resumen, asocia los campos inválidos y enfoca el error. Errores de datos conservan los valores. Un borrador modificado pide confirmación antes de cerrar o navegar; una recarga activa el aviso nativo del navegador. El borrador permanece únicamente en memoria.

Una versión nueva no sustituye silenciosamente la versión que abrió el formulario. Ante `409`, el servicio consulta el estado actual y solicita revisarlo antes de guardar otra acción. El formulario conserva los campos y ofrece **Actualizar pedido**. Si otro administrador ya avanzó la etapa, esa acción anterior queda bloqueada.

Ante red, timeout o error cuyo resultado pueda ser incierto, se realiza una lectura y nunca se repite automáticamente el POST. Si la lectura confirma la siguiente versión, etapa, responsable y datos del despacho, se adopta el resultado guardado. Si no se logra consultar, se bloquean nuevas escrituras hasta una lectura explícita confirmada. La verificación no asegura que una nota se haya guardado si otra ventana de la misma cuenta registró una acción equivalente; se debe consultar el historial ante cualquier duda sobre esa nota.

Una sesión o rol insuficientes retiran los datos privados. Las respuestas tardías se descartan después de cambiar cuenta o revisión de sesión, aunque se trate de la misma cuenta. La pérdida de acceso permite retirar el formulario privado sin quedar bloqueada por un borrador.

## Seguimiento del cliente

El adaptador público acepta únicamente transportista, referencia y las tres fechas válidas y coherentes. Descarta empleados y notas internas incluso si una respuesta los incluyera por error. Mis pedidos, el detalle y el seguimiento del invitado autorizado muestran los datos persistidos, conservando sus reglas de propiedad existentes.

El título y mensaje indican la etapa real; el apartado de pago conserva su estado independiente. **Actualizar pedido** permite consultar los avances sin repetir una compra. La vista de etapas añade las fechas reales de preparación, despacho y entrega. Se muestran en hora de Perú y no se inventan fechas pendientes.

## Validación

Pasaron **562 pruebas de Angular**, incluidas 34 nuevas de contratos públicos, autorización, CSRF, versiones, caché, errores, borradores y recuperación tras respuesta perdida. Se aprobaron compilación de producción sin avisos y TypeScript de aplicación y pruebas.

Siete recorridos en Chrome con Angular y NestJS compilados y MySQL 8.0.46 temporal comprobaron preparación, validación y foco, conservación de borradores, error 503, respuesta perdida después de COMMIT, descuento único, entrega sin nuevo descuento, seguimiento de cuenta e invitado y conflictos entre dos sesiones. Las capturas a 1440, 768 y 390 px conservaron el diseño sin desbordamientos ni errores JavaScript. Los cuatro avisos del detector de imágenes corresponden a atributos Angular `[src]`, comprobados en plantilla y navegador.

Evidencia en `.checkout-review/envios-frontend/` desde la raíz SOHO. Las pruebas usaron datos sintéticos y una instancia MySQL exclusiva; no escribieron en `soho_db`, no enviaron notificaciones externas ni modificaron las siete migraciones o fuentes del backend. Los servidores temporales se retiran al finalizar.

La configuración de tarifas y cobertura continúa documentada aparte en [Administración → Envíos](integracion-envios.md). Resolución formal de incidencias, vencimiento de reservas, envíos parciales, edición de seguimiento despachado, devoluciones y reembolsos requieren entregas posteriores.
