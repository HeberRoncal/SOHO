# Integración de Administración → Envíos

Fecha: 13 de noviembre de 2026 (America/Lima).

Actualización del 17 de noviembre: las tarifas y plazos de zonas habilitadas quedan bloqueados. El interruptor guarda la deshabilitación antes de permitir editar y guarda los datos de esa zona al habilitarla de nuevo, conservando las ediciones locales de las demás. Se quitó el botón general **Actualizar**. Solo los errores de lectura o guardados inciertos muestran una acción de recuperación para consultar el estado guardado, con confirmación si reemplazará campos modificados. La Esperanza conserva su tarifa gratuita de solo lectura. La API también rechaza modificar tarifa/plazo de una zona vigente habilitada, incluso al deshabilitarla en el mismo PATCH. Se mantienen rutas, versiones, distritos y Prisma.

`/admin/configuracion/envios` utiliza la [API de cobertura](../../soho-backend/docs/api-cobertura.md) y guarda tarifas, plazos y habilitación en MySQL. Requiere sesión `ADMIN` y las cinco migraciones, cuya aplicación local confirmó el usuario.

## Pantalla y confirmación

La tabla conserva los siete distritos, sus nombres y códigos. La Esperanza muestra tarifa cero de solo lectura; Moche comienza deshabilitado. Las tarifas pendientes se muestran vacías, con ayuda que distingue vacío de cero. No se cargan los precios de demostración como precios reales. Habilitar una zona con tarifa pendiente conserva ese estado sin hacerla cotizable.

`EnviosEstado` pertenece a la instancia del componente. Mantiene en memoria el último estado confirmado y el borrador actual, valida los campos y envía únicamente códigos, tarifas, plazos, habilitación y la versión recibida del servidor. Usa el interceptor existente para cookie `HttpOnly` y CSRF. El borrador no se guarda en almacenamiento web.

Guardar bloquea controles y acciones duplicadas. El éxito se presenta después de adoptar la respuesta confirmada. Un error conserva los campos; una escritura no se repite automáticamente. Ante un conflicto `409`, una respuesta perdida o un fallo de persistencia se bloquea la edición y se ofrece **Revisar estado guardado** antes de otra escritura. La consulta pide confirmación cuando sustituirá campos modificados. Descartar recupera el último estado confirmado en esa pantalla cuando no hay una operación por revisar.

Una carga fallida muestra el error y permite reintentar, sin sustituir datos por valores ficticios. Los errores del formulario se asocian a sus campos y el foco pasa al primero inválido después de renderizar. La ruta protege los cambios sin guardar al navegar; la pérdida de sesión o del rol de administrador permite retirar el formulario privado. Las respuestas tardías de una sesión anterior no se adoptan.

El apartado Envíos tiene su propio guardado y no participa en el botón de guardado de los apartados de demostración. Los borradores de Pagos, Inventario y Tienda conservan su comportamiento anterior. Las acciones de Envíos no guardan esos otros apartados.

## Alcance comercial

Las rutas públicas `/api/cobertura` y `/api/cobertura/:codigo/cotizacion` resuelven el estado guardado y distinguen tarifa pendiente de zona deshabilitada. Desde el 14 de noviembre el [checkout utiliza esa cobertura y permite elegir direcciones guardadas](integracion-checkout.md), conservando la compra como invitado. La agenda reutiliza el listado público de distritos; guardar una dirección continúa sin confirmar cobertura.

Guardar tarifas en esta pantalla no modifica pedidos anteriores ni crea pedidos, reservas, pagos o envíos operativos. La gestión de Envíos de Configuración es distinta de la [preparación, despacho y entrega de pedidos](integracion-preparacion-envios.md), ya integrada con la API real.

## Validación

La actualización del 17 de noviembre aprobó 24 pruebas específicas del frontend y 34 del backend, tipos de ambos proyectos y producción Angular. Chrome comprobó bloqueo/deshabilitación previa, edición y guardado, habilitación, conservación de cambios de otra zona, respuesta perdida, conflicto, lectura fallida y gratuidad de La Esperanza a 1440/768/390 px, con todas las API y escrituras simuladas. Evidencia: `.checkout-review/envios-edicion-deshabilitada-validacion.json`. La preparación de la suite MySQL se adaptó al nuevo flujo; no se ejecutó en esta actualización. Las cifras siguientes corresponden a la integración inicial.

Pasaron **443 pruebas de Angular**, incluidas veinte nuevas de Envíos, compilación de producción y TypeScript de pruebas. `envios-estado.spec.ts` cubre pendientes nulos, contrato HTTP, CSRF, versión, confirmación, errores, conservación del borrador, conflictos, doble envío, descarte y respuestas tardías. `envios.spec.ts` comprueba el error y el foco del campo inválido. Las 274 pruebas del backend incluyen permisos y concurrencia contra MySQL real aislado.

Doce recorridos de Chrome utilizaron Angular y NestJS compilados con MySQL 8.0.46 temporal. Comprobaron carga, validación, guardado, recarga, cotización, borradores y errores, navegación y sesión vencida. Se revisó la pantalla a 1440, 768 y 390 px sin desbordamientos horizontales ni errores JavaScript. El detector estático no encontró incidencias. La evidencia está en `.checkout-review/cobertura-api/` desde la raíz SOHO.
