# Cobertura pública sin fuente de demostración

18 de noviembre de 2026, America/Lima.

## Cambios

`FUENTE_COBERTURA` proporciona `CoberturaApi` por defecto, además de la vinculación explícita que ya existía en `app.config.ts`. Se retiraron `servicios/cobertura-demostracion.ts` y su suite antigua. El contrato FuenteCobertura exige estado, mensajes y operaciones de carga, confirmación e invalidación; CoberturaEntrega los delega directamente, sin valores de reserva ni cotización local alternativa.

La tarifa solo queda disponible después de confirmar `GET /api/cobertura/:codigo/cotizacion`. La gratuidad utiliza el cero devuelto por el servidor. Se conservan los estados de carga y errores de zonas deshabilitadas, tarifa pendiente, distrito desconocido y fallo de red. Esta entrega no cambia la implementación de CoberturaApi ni sus contratos HTTP.

## Ejemplos y pruebas

Los pedidos administrativos de demostración aún necesitan las tarifas ilustrativas del prototipo. Su conjunto se trasladó, sin cambiar valores, de `finalizar-compra/datos/cobertura-demostracion.ts` a `administracion/pedidos/datos/cobertura-envios-demo.ts`. Pedidos administrativos actualizó únicamente ese import. Estas tarifas permanecen pendientes de retirar con las simulaciones administrativas; no son una alternativa para el checkout.

`finalizar-compra/pruebas/cobertura.fixture.ts` ofrece CoberturaPrueba y proveerCoberturaPrueba() exclusivamente para pruebas de vistas y del servicio antiguo de pedidos. Diez suites eligen explícitamente ese proveedor. El fixture de zonas reutiliza el conjunto administrativo pendiente para no duplicarlo. No se incorpora al arranque de la aplicación.

Las cuatro comprobaciones anteriores de CoberturaEntrega y CoberturaDemostracion se conservan en `cobertura-entrega.spec.ts`, ahora mediante HTTP de pruebas de la API real: fuente predeterminada y estados compartidos, costos y gratuidad confirmados, bloqueo de distritos y recuperación de una carga fallida sin ejemplos. Se conservan las pruebas existentes de errores 422/404/503, importes inválidos, concurrencia e invalidación de cotizaciones.

## Validación

- 1162 pruebas Angular en 150 archivos, sin retirar casos; tipos de aplicación y pruebas y compilación de producción.
- Análisis del grafo de imports, incluidas rutas diferidas: ningún fixture es alcanzable desde `src/main.ts` y la cadena de dependencias de CoberturaEntrega no contiene ejemplos ni proveedores de pruebas.
- Doce comprobaciones Chrome a 1440/390 px: distritos y habilitación coinciden con la API, gratuidad, tarifa comercial actual, bloqueo de una zona realmente deshabilitada, tarifa pendiente y fallo de cotización controlados en red, conservación de los campos y recuperación de la tarifa real al reintentar.
- Sin excepciones JavaScript ni desbordes. El navegador usó un carrito invitado y solo consultas: no emitió instrucciones, registró compras ni modificó datos comerciales.

Evidencia desde la raíz SOHO: `.checkout-review/limpieza-cobertura/dependencias.json`, `navegador.json` y capturas. No se modificaron backend ejecutable, Prisma, migraciones, seeds ni tarifas de MySQL. Productos, Pedidos, Pagos y Configuración conservan las dependencias pendientes de sus siguientes lotes; Cambios y devoluciones permanece oculto.
