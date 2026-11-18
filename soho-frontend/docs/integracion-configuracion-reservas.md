# Integración de Configuración → Inventario

Fecha: 14 de noviembre de 2026 (America/Lima).

El apartado consulta y guarda la política real mediante la [API de configuración de reservas](../../soho-backend/docs/api-configuracion-reservas.md). Utiliza las ocho migraciones ya aplicadas, sin modificar el backend ni añadir una migración. Conserva el diseño administrativo y los siete distritos existentes.

## Consulta y guardado independientes

`InventarioEstado`, generado con Angular CLI, mantiene únicamente la configuración de reservas y su borrador. `contrato-reservas.ts` valida versiones, fechas, políticas coherentes, responsable y capacidades antes de presentar la respuesta. Se reutilizan sesión, cookies y CSRF existentes.

El apartado muestra carga y error con reintento. No rellena una consulta fallida con opciones de demostración. Presenta la política persistida, versión, última actualización en hora de Perú y último responsable; su ausencia se indica sin inventar un nombre.

Inventario tiene una sola barra de guardado y se identifica como **Datos reales**. Su guardado, mensajes, descarte y protección de salida son propios. Los demás apartados también utilizan sus servicios reales y el antiguo `ConfiguracionEstado` ya fue retirado. Guardar reservas no guarda ni descarta borradores de Pagos o Tienda. Consultar [Limpieza de Configuración e Inicio](limpieza-configuracion-inicio.md).

El administrador puede elegir liberar automáticamente o preguntar al cancelar las nuevas reservas. La confirmación explica que el cambio afecta únicamente a reservas nuevas. Las existentes conservan su versión y política histórica. Guardar la configuración no libera unidades, no modifica existencias físicas ni cambia pagos, cobertura o pedidos anteriores.

La escritura envía exclusivamente `version`, `confirmado`, `modo`, `horas`, `accionVencimiento` y `accionCancelacion`. No envía responsable, fechas, capacidades ni cantidades. Si no hay cambios, no realiza un PATCH. La confirmación se desmarca al editar, actualizar o producirse un error.

## Disponibilidad del modo temporal

La API informa `capacidades.reservaTemporalDisponible: true`: **Por un tiempo definido** permite elegir duración y acción al vencer. Se admiten de 1 a 999999 horas enteras y las acciones liberar/alertar o conservar/alertar. Los controles y la validación utilizan esa capacidad consultada; no fuerzan un valor local ni una duración o acción predeterminada.

Una política temporal guardada muestra su duración y acción y permite editarlas, con nueva confirmación. Se puede seleccionar **Hasta que un administrador decida** para nuevas reservas; ese borrador limpia duración y acción temporal y las envía como `null`. Los plazos anteriores permanecen intactos. Descartar vuelve a mostrar la política guardada sin escribirla.

El formulario explica que el plazo comienza al crear cada reserva, que se atienden pagos pendientes u observados y que los aprobados conservan sus reservas. Las alertas son administrativas. Los controles usan selección nativa independiente y mantienen el bloqueo defensivo si una API consultada informa capacidad `false`, sin afirmar que se detuvo el procesamiento histórico.

## Borradores, conflictos y sesión

La edición conserva la versión consultada hasta una lectura explícita o un guardado confirmado. Guardar bloquea campos, doble envío y navegación mientras se comprueba el resultado. Los errores muestran un resumen con foco y campos asociados. Navegar desde un borrador pide confirmación; la recarga activa el aviso nativo del navegador. El borrador permanece únicamente en memoria y se retira al perder la cuenta o sesión propietaria.

Actualizar conserva el borrador modificado y adopta explícitamente la versión guardada, solicitando una nueva confirmación. Si el borrador ya coincide con la configuración consultada, no se ofrece otro guardado. Descartar solicita confirmación y afecta exclusivamente a reservas.

Ante conflicto, red, timeout o respuesta incoherente se consulta el resultado sin repetir automáticamente el PATCH. La recuperación exige la siguiente versión, política enviada, mismo registro de creación, cronología válida y responsable de la cuenta actual. Una lectura automática que no confirma el guardado conserva la versión abierta y obliga a pulsar **Actualizar** antes de otro intento. Descartar no elimina esa obligación pendiente.

Una política equivalente guardada desde otra ventana de la misma cuenta puede ser indistinguible de la escritura cuya respuesta se perdió. La lectura confirma el resultado persistido; para revisar la operación se muestran versión, responsable y fecha.

Las respuestas tardías se descartan después de cambiar cuenta, rol o revisión de sesión, incluso al volver a la misma cuenta. Perder autorización retira los datos privados y permite salir sin quedar bloqueado por el borrador.

## Validación

La habilitación temporal aprobó **708 pruebas de Angular en 129 archivos**, ocho nuevas, además de TypeScript, compilación de producción y detector sin avisos. Las nuevas pruebas cubren ambos comportamientos al vencer, controles habilitados, campos obligatorios, confirmación, CSRF, edición temporal, vuelta a reserva hasta decisión, borradores independientes, conflicto y respuesta perdida. Evidencia actual en `.checkout-review/reservas-temporales/`.

Pasaron **654 pruebas de Angular en 126 archivos**, incluidas 48 nuevas de contratos, estado y componente: autenticación, CSRF, datos permitidos, confirmación, independencia de otros borradores, versiones, temporal preexistente, descarte, errores, respuesta perdida y retiro de datos al cambiar la sesión. Se aprobaron TypeScript de aplicación y pruebas, formato y compilación de producción sin avisos.

Ocho recorridos en Chrome con Angular y NestJS compilados y MySQL 8.0.46 temporal comprobaron carga y reintento, barra independiente, confirmación y foco, navegación, error 503, COMMIT sin respuesta, aplicación a nuevas reservas, conflicto entre dos administradores, política temporal preexistente y sesión revocada. Se conservaron pedidos anteriores, reservas, comprobantes y existencias. Las capturas a 1440, 768 y 390 px no presentaron desbordamientos ni errores JavaScript. El detector no encontró avisos.

Evidencia en `.checkout-review/reservas-config-frontend/` desde la raíz SOHO. Se utilizaron datos sintéticos y una instancia MySQL exclusiva; no se escribió en `soho_db`, no se enviaron notificaciones externas y permanecieron intactas las fuentes del backend, el esquema y las ocho migraciones. Los servidores, perfiles de Chrome y directorios de datos temporales se retiraron al terminar.

El [procesamiento automático de vencimientos y sus alertas administrativas](../../soho-backend/docs/vencimientos-reservas.md), la [recuperación de reservas](../../soho-backend/docs/api-recuperacion-reservas.md) y la habilitación del modo temporal están implementados. La configuración persistida solo cambia cuando un administrador confirma su guardado.
