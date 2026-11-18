# Configuración administrativa de Tienda

Configuración → Tienda consulta y guarda en MySQL los contactos, horario, dos enlaces de ayuda y las tres políticas. Sustituye el guardado de demostración en memoria. No requiere una migración nueva: reutiliza `ConfiguracionTienda` y `VersionConfiguracionTienda` de la migración comercial ya existente.

## API

`GET /api/configuracion/tienda` es una consulta pública para la columna «Contáctanos» del footer. Devuelve exclusivamente `{ correo, whatsapp, horario }` de la versión vigente, sin responsables, claves de solicitud, hashes, enlaces ni políticas. No requiere sesión; limita consultas y responde con `Cache-Control: no-store`. Si todavía no hay versión, devuelve los tres campos a null. Un fallo de configuración responde con error, sin contactos ficticios.

Las siguientes rutas administrativas requieren sesión ADMIN; las escrituras también requieren origen y CSRF válidos. Las respuestas llevan `Cache-Control: no-store`.

- `GET /api/admin/configuracion/tienda`: devuelve `{ configuracion: { version, actualizadoEn, actualizadoPor, tienda } }`. Sin versiones guardadas devuelve versión 0 y campos pendientes, sin contactos ficticios.
- `PATCH /api/admin/configuracion/tienda`: recibe `{ claveSolicitud, versionEsperada, tienda }`. La clave es UUID. El contenido incluye `correo`, `whatsapp`, `horario`, `enlaces: [{ texto, url }, { texto, url }]` y `politicas: { cambios, privacidad, terminos }`. Los campos opcionales vacíos se normalizan a null; el texto vacío de enlaces se conserva como cadena vacía.
- `GET /api/admin/configuracion/tienda/operaciones/:clave`: recupera la respuesta histórica de una escritura del mismo administrador. Otra cuenta obtiene 404.

La escritura bloquea el control de Tienda, vuelve a comprobar la sesión dentro de la transacción, compara la versión, crea una versión auditada y cambia la referencia vigente. Una clave repetida con el mismo contenido y administrador devuelve la respuesta original; otra solicitud con versión antigua obtiene 409. Una clave reutilizada con contenido o administrador diferente también obtiene 409. No modifica pagos, envíos, pedidos ni reservas.

Correo: hasta 160 caracteres; WhatsApp peruano: nueve dígitos comenzando por 9; horario: hasta 160 caracteres; enlaces: texto hasta 100 y URL HTTP(S) hasta 2048, sin credenciales ni espacios; políticas: hasta 10000 caracteres cada una, admitiendo saltos de línea y tabulaciones. Los enlaces con URL requieren texto. La ruta PATCH permite JSON de hasta 256 KiB para guardar las tres políticas completas; las demás rutas conservan su límite anterior.

## Angular

El formulario carga del servidor y muestra Guardar cambios/Descartar. No ofrece un guardado de demostración. Bloquea envíos duplicados y protege la salida con cambios. Solo anuncia éxito después de comprobar la respuesta de escritura y una lectura de la configuración vigente.

La solicitud exacta de una escritura en curso se conserva por administrador y pestaña en sessionStorage para resolver resultados inciertos; no sustituye la persistencia de MySQL. Ante errores de conexión ofrece consultar el resultado o reenviar la misma clave. Un conflicto conserva los campos y exige cargar la versión guardada antes de volver a editar. Las respuestas de sesiones anteriores se descartan. Esta entrega conecta la pantalla administrativa; el consumo público de contactos y políticas conserva su alcance independiente.

## Validación

Pasaron 10 pruebas del DTO y 1157 pruebas Angular, además de compilaciones de producción frontend/backend. La comprobación en `.checkout-review/tienda-persistencia/verificar.mjs` usa MySQL nuevo y aislado, aplica las migraciones existentes y crea únicamente cuentas sintéticas. Comprueba autorización, CSRF, políticas superiores a 16 KiB, persistencia, conflictos, recuperación privada e idempotencia. Chrome usa Angular y esa API real: editar, guardar y recargar conserva los campos, sin desbordes a 1440/768/390 px. No escribe datos de prueba en la base local del usuario.
