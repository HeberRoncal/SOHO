# Verificación de correo

El registro por contraseña programa un correo de verificación mediante el transporte SMTP configurado para [recuperación de contraseña](recuperacion-contrasena.md). La cuenta y su sesión se crean aunque SMTP esté deshabilitado o falle el envío. Una cuenta pendiente conserva el acceso actual; verificarla acredita su dirección, sin conceder permisos adicionales. Las cuentas verificadas por Google conservan ese estado y no reciben otro enlace.

## Contrato

Todas las operaciones requieren JSON, origen permitido y `X-CSRF-Token`. El registro no incorpora campos nuevos en su respuesta.

| Método y ruta                           | Acceso        | Cuerpo y resultado                                                                                                                                        |
| --------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/verificacion/reenviar`  | Sesión activa | `{}`; 202 con mensaje uniforme. Usa exclusivamente el ID de la sesión.                                                                                    |
| `POST /api/auth/verificacion/comprobar` | Público       | `{ token }`; 200 con `{ vigente }`. No consume el enlace.                                                                                                 |
| `POST /api/auth/verificacion/confirmar` | Público       | `{ token }`; 200 con mensaje de confirmación. Un enlace inválido, vencido, sustituido o utilizado responde 400 con código `VERIFICACION_ENLACE_INVALIDO`. |

El reenvío tiene límites de tres solicitudes por usuario y hora y diez por IP y hora. La comprobación admite 60 por IP y minuto; la confirmación, diez por IP y minuto. Se responde 429 con `Retry-After` al excederlos. Los contadores están acotados y son locales al proceso, como los demás límites de autenticación.

## Enlace y consumo

El correo contiene `/verificar-correo#token=UUID.secreto`. El secreto tiene 32 bytes aleatorios y el enlace vence a las ocho horas. `tokens_usuario` conserva el UUID y un SHA-256 que incluye propósito, UUID, secreto y dirección destinataria; no guarda el secreto ni el enlace completo. El hash se comprueba con comparación de tiempo constante usando el correo actual, de modo que cambiar esa dirección invalida un enlace anterior. Se reutilizan las columnas existentes y no se requiere migración.

Angular retira inmediatamente el fragmento del navegador y conserva el token solo en la instancia de la pantalla. Utiliza una política temporal `no-referrer`, no lo escribe en almacenamiento web ni lo incluye en otras URLs. Abrir el enlace solamente comprueba su vigencia; el usuario pulsa **Verificar mi correo** para consumirlo mediante POST. Recargar después de retirar el fragmento requiere abrir nuevamente el enlace del correo.

La confirmación bloquea la fila del usuario, vuelve a validar propósito, hash, actividad, vencimiento y consumo, consume exactamente un token y actualiza `correoVerificadoEn` en la misma transacción. Revoca los demás enlaces de verificación pendientes. No modifica rol, contraseña, sesiones ni tokens de recuperación. También funciona sin sesión y no inicia sesión automáticamente. Las solicitudes simultáneas solo permiten una confirmación correcta.

## Envío y configuración

Se reutilizan `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USUARIO`, `SMTP_CLAVE` y `SMTP_REMITENTE`, con las mismas restricciones TLS y protección de credenciales de recuperación. `RECUPERACION_ORIGEN` define el origen de los enlaces de ambos propósitos; en producción debe ser HTTPS y estar permitido en `AUTH_ORIGENES`. No se utiliza el encabezado Host recibido para construirlos.

La cola mantiene como máximo 100 solicitudes pendientes por proceso y un trabajador. Solo envía a cuentas activas, con contraseña y correo pendiente. Un reenvío sin SMTP disponible o con la cola llena responde 503. El registro continúa y permite solicitar otro enlace desde **Mi cuenta**. La respuesta 202 acredita la programación; no garantiza entrega a la bandeja.

El enlace nuevo se crea antes del envío; los anteriores se revocan después de que SMTP lo acepte. Si falla el envío, se revoca el nuevo y se conservan los anteriores. Los errores públicos y registros del trabajador omiten correo, token, contraseña y detalles SMTP. El cierre normal drena la cola antes de cerrar el transporte. Un reinicio forzado puede perder solicitudes pendientes: para varias instancias o entrega durable se requiere una cola compartida persistente y contadores compartidos.

## Validación

Las pruebas HTTP con MySQL temporal cubren registro y envío automático, destinatario ligado a la sesión, vigencia, consumo único y simultáneo, propósito, cambio de correo, desactivación, enlaces sustituidos, SMTP fallido o deshabilitado, CSRF y conservación de rol, contraseña, sesiones y recuperación. Las pruebas unitarias del transporte utilizan un servidor SMTP TCP local.

El recorrido con Angular de producción, NestJS, MySQL y SMTP locales está en `.checkout-review/verificacion/` desde la raíz SOHO. Utiliza cuentas sintéticas y no modifica `soho_db` ni envía correos a Internet. La entrega a una bandeja Gmail real requiere una comprobación manual con una cuenta controlada.

## Referencia

[OWASP: validación y verificación de correo](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html). Esta entrega implementa prueba de propiedad del correo; la política actual permite iniciar sesión mientras está pendiente.
