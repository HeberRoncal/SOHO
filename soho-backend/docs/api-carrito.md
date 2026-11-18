# Carrito privado de la cuenta

Implementado el 18 de noviembre de 2026. Migración aditiva `20261118010000_carrito_persistente`, aplicada en la base local `soho_db` después de verificarla con MySQL temporal.

## Contrato

`GET /api/carrito` devuelve `{ version, articulos: [{ sku, cantidad }] }` de la cuenta autenticada. Una cuenta sin carrito devuelve versión cero y lista vacía. No admite consultar otra identidad. ADMIN y CLIENTE comparten el acceso a su propio carrito.

`PUT /api/carrito` exige sesión, origen permitido y CSRF. Cuerpo estricto:

```json
{
  "clave": "11111111-1111-4111-8111-111111111111",
  "version": 0,
  "tipo": "GUARDAR",
  "articulos": [{ "sku": "NK-AF107-BL-40", "cantidad": 1 }]
}
```

`GUARDAR` sustituye las líneas de la versión indicada; lista vacía vacía el carrito. `COMBINAR` incorpora el carrito de invitado y conserva la mayor cantidad cuando coincide un SKU. La combinación se realiza contra la versión actual bloqueada del servidor. Máximo 100 SKU distintos y 99 unidades por SKU. Se conservan SKU retirados para que el cliente pueda revisar y eliminar las líneas indisponibles.

Las escrituras bloquean la cuenta dentro de una transacción ReadCommitted. Una versión antigua en GUARDAR produce 409. La clave de operación es única por cuenta, con hash de contenido: repetir la misma petición recupera el carrito actual sin repetir la escritura; reutilizar la clave con otro cuerpo produce 409. Las operaciones históricas de idempotencia no tienen caducidad automática en esta entrega.

El carrito no reserva inventario ni fija precios. Solo persiste SKU y cantidad; los precios, imágenes y disponibilidad se resuelven con el catálogo público. El flujo existente de compra sigue validando precios, stock y reservas en el servidor.

## Angular

La aplicación registra `CarritoPersistente` mediante `GESTOR_CARRITO` y lo inicia junto a la sesión. Recupera MySQL al iniciar sesión o recargar la aplicación y al volver a enfocar la ventana. No utiliza sondeo ni actualización en tiempo real entre dispositivos.

El invitado se conserva en `soho:carrito:invitado`; se lee y migra la clave antigua `soho:carrito:demostracion`. Al confirmar la combinación se limpia el invitado. El carrito de una cuenta no se convierte en carrito invitado al cerrar sesión ni se copia a otra cuenta.

Las operaciones inciertas se guardan localmente por identidad para recuperarlas al regresar. Se bloquean nuevas ediciones y checkout durante la sincronización o ante un error. Reintentar conserva la misma clave y contenido. Ante 409 se consulta de nuevo y se pide repetir la edición contra el estado nuevo. No se repiten escrituras automáticamente. `CarritoLocal` permite aislar las pruebas de vistas; el alias antiguo `CarritoDemostracion` ya se retiró y las pruebas importan directamente CarritoLocal.

## Verificación

- 1178 pruebas Angular, incluyendo ocho nuevas de sincronización, y compilación de producción.
- 899 pruebas unitarias backend, incluyendo quince del contrato, tipos y compilación.
- Seis pruebas HTTP con MySQL temporal: autorización/CSRF, recuperación con dos sesiones, aislamiento de cuentas, idempotencia, concurrencia, combinación y vaciado.
- Despliegue de las catorce migraciones y segundo despliegue sin pendientes en MySQL temporal. Evidencia en `.checkout-review/carrito-persistente/` desde la raíz del workspace.
- Chrome a 1440/390 px: añadir desde ficha, recuperar el carrito invitado al navegar, disponibilidad para continuar y ausencia de desbordes. Sin escrituras comerciales en MySQL.

Para repetir la suite MySQL se necesita una base local exclusiva, migrada, cuyo nombre termine en `_test`, indicada mediante `TEST_CARRITO_DATABASE_URL`. Ejecutar `npm.cmd run test:carrito`. Nunca usa DATABASE_URL como alternativa.
