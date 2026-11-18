# Integración de cobertura y direcciones en checkout

Fecha: 14 de noviembre de 2026 (America/Lima).

Actualización del 18 de noviembre de 2026: la [limpieza de Cobertura](limpieza-cobertura.md) retiró la fuente de demostración de la aplicación. CoberturaApi es también el proveedor predeterminado y CoberturaEntrega delega los estados y operaciones sin tarifas locales alternativas. Los ejemplos de vistas quedan en fixtures explícitos; los datos que todavía necesitan los pedidos administrativos de demostración se conservan en Administración. Pasaron 1162 pruebas Angular, tipos, producción y doce comprobaciones Chrome a 1440/390 px sin escrituras comerciales.

`/finalizar-compra` consulta la cobertura persistida y permite elegir una dirección de la cuenta actual. Continúa disponible como invitado. Reutiliza las APIs existentes; no añade migraciones ni modifica las tarifas de la base local del usuario. La posterior [integración de pedidos](integracion-pedidos.md) ya conecta creación, comprobantes privados y Mis pedidos.

## Cobertura y confirmación

`CoberturaApi`, generado mediante Angular CLI, implementa `FuenteCobertura`. Tanto el proveedor predeterminado como `app.config.ts` lo proporcionan a `CoberturaEntrega`. Las pruebas de vistas eligen su fixture explícitamente; el antiguo servicio de demostración se retiró. El arranque carga `GET /api/cobertura`, por lo que la agenda también reutiliza los nombres reales de los distritos.

Se conservan La Esperanza, Trujillo, El Porvenir, Florencia de Mora, Víctor Larco Herrera, Huanchaco y Moche con sus códigos originales. Una tarifa `null` permanece pendiente; solo un cero confirmado representa envío gratuito. Las zonas deshabilitadas y pendientes aparecen identificadas y no se ofrecen para seleccionar manualmente. Una dirección guardada en esas zonas conserva sus datos, pero no permite continuar.

Al seleccionar distrito se consulta `GET /api/cobertura/:codigo/cotizacion`. Se valida el contrato, distrito, moneda PEN e importe decimal exacto. Durante la consulta o ante un fallo, el envío y el total quedan por confirmar. No se sustituyen por tarifas de ejemplo ni por cero. Las respuestas de selecciones anteriores se descartan.

El checkout vuelve a cotizar antes de pasar al pago y antes de registrar la compra. Si cambia el costo o el plazo, informa y exige revisar antes de confirmar otra vez. Los controles impiden envíos duplicados. Un fallo conserva formulario y comprobante; si cambia el monto aceptado, se retira el comprobante correspondiente al importe anterior. Los errores permiten reintentar sin exponer detalles internos.

## Direcciones y sesión

Solo se consulta `/api/direcciones` cuando existe una sesión. La agenda no aplica automáticamente la predeterminada: la selección es explícita y una respuesta tardía no reemplaza una dirección escrita manualmente.

Elegir una dirección copia destinatario, celular, distrito, dirección y referencia. Conserva correo, nombres de contacto y datos fiscales. El destinatario ocupa un campo completo y opcional, sin intentar dividir sus nombres y apellidos. Si queda vacío, se usan los nombres de contacto. La recapitulación y el seguimiento local muestran el destinatario elegido.

La agenda y los datos privados anteriores se retiran al perder o cambiar la sesión. Las respuestas pendientes se comprueban contra el usuario y la revisión de carga antes de adoptarse. No se guardan domicilios, datos fiscales ni comprobantes en almacenamiento web.

## Evolución posterior

La preparación de cobertura y agenda aquí documentada mantenía inicialmente pedidos en memoria. Después se implementaron los nueve modelos y la API, y se completó la [integración real de pedidos](integracion-pedidos.md). La aplicación ya crea registros `SOHO-…`, guarda comprobantes privados y reservas y consulta Mis pedidos en MySQL. La administración comercial sigue pendiente.

## Validación de la entrega de cobertura y agenda

Pasaron **472 pruebas de Angular**, incluidas **29 nuevas** de cobertura y checkout, compilación de producción y TypeScript de aplicación y pruebas. Cubren gratuidad y pendientes, contrato HTTP, importes inválidos, respuestas tardías, invitado, agenda, cambio de sesión, datos fiscales conservados, errores, doble envío y revalidación antes del pago y registro.

También pasaron nueve pruebas HTTP y 86 con MySQL del backend existente. Doce recorridos de Chrome contra Angular y NestJS compilados y MySQL 8.0.46 temporal comprobaron errores y recuperación, selecciones rápidas, tarifas modificadas, comprobantes, invitado, direcciones y sesión vencida. Se inspeccionaron capturas a 1440, 768 y 390 px, sin desbordamientos ni errores JavaScript.

El detector estático señaló siete imágenes con origen dinámico de Angular (`[src]`) como si no tuvieran `src`. Son falsos positivos revisados en las plantillas y el navegador; no se añadieron imágenes vacías. Evidencia desde la raíz SOHO: `.checkout-review/checkout-api/`. Las pruebas no escribieron en `soho_db` ni enviaron correos externos.
