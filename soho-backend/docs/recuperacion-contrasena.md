# Recuperación de contraseña

El frontend ofrece solicitar un enlace temporal y elegir una nueva contraseña. La entrega utiliza la tabla existente `tokens_usuario`: no requiere otra migración. El acceso con Google conserva su funcionamiento; las cuentas que solo tienen Google no reciben una contraseña local por este flujo.

## Configurar el remitente

El remitente es la dirección desde la que SOHO envía el mensaje **Recupera tu contraseña de SOHO** al cliente. Debe pertenecer a una cuenta o dominio permitido por el proveedor SMTP elegido. El ID público de Google utilizado para iniciar sesión no configura este envío.

Completar en `soho-backend/.env` los valores del proveedor, usando el bloque comentado de `.env.example` como referencia:

```dotenv
RECUPERACION_ORIGEN="http://localhost:4200"
SMTP_HOST="smtp.proveedor.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USUARIO="usuario-del-proveedor"
SMTP_CLAVE="credencial-privada-del-proveedor"
SMTP_REMITENTE="cuentas@tu-dominio.com"
```

Los valores son ejemplos; no habilitan un envío real. Conservar las credenciales únicamente en `.env` o en el gestor de secretos del despliegue. No incluirlas en Git, capturas, URLs o conversaciones. El código nunca publica el error detallado del servidor SMTP ni registra mensajes o enlaces de recuperación.

`RECUPERACION_ORIGEN` es un origen exacto de la tienda, sin rutas ni barra final, y debe estar permitido por `AUTH_ORIGENES`. En desarrollo se utiliza `http://localhost:4200` por omisión; con SMTP habilitado en producción es obligatorio configurar un origen HTTPS explícito. El enlace se construye con ese valor fijo, sin utilizar `Host`, `Origin` ni direcciones enviadas por el navegador.

El puerto 587 utiliza STARTTLS obligatorio. Para un proveedor que usa TLS desde el inicio, configurar `SMTP_PORT=465` y `SMTP_SECURE=true`. La validación del certificado permanece habilitada. Fuera de loopback se exigen usuario y clave conjuntamente. El remitente acepta una sola dirección simple; el servicio incorpora el nombre visible **SOHO**.

Sin variables SMTP el envío permanece deshabilitado y las solicitudes de recuperación responden 503 para cualquier correo. No se muestra un mensaje de correo enviado ni se genera un enlace visible como sustituto. Una configuración SMTP parcial o inválida detiene el arranque para evitar aceptar solicitudes con un remitente incorrecto. Configurar únicamente `RECUPERACION_ORIGEN` no activa SMTP.

## Usar una cuenta Gmail

En la cuenta que enviará los mensajes, activar la [verificación en dos pasos](https://support.google.com/accounts/answer/185839?hl=es) y abrir [Contraseñas de aplicaciones](https://myaccount.google.com/apppasswords). Crear una contraseña de aplicación con el nombre **SOHO** y guardarla únicamente en `SMTP_CLAVE` del `.env`, sin los espacios de presentación. Si Google no ofrece esta opción, consultar sus [requisitos para contraseñas de aplicaciones](https://support.google.com/accounts/answer/185833?hl=es).

Para Gmail utilizar `SMTP_HOST="smtp.gmail.com"`, `SMTP_PORT="465"` y `SMTP_SECURE="true"`. `SMTP_USUARIO` y `SMTP_REMITENTE` deben contener la dirección completa de la cuenta de Gmail; `SMTP_CLAVE` utiliza la contraseña de aplicación. Mantener `SMTP_PERMITIR_INSEGURO_LOCAL` sin configurar. Al activar el bloque, todas estas variables deben estar completas; un bloque preparado con comentarios no activa el envío.

Reiniciar NestJS después de completar la configuración y solicitar recuperación para una cuenta local con contraseña cuyo correo puedas consultar. La aceptación HTTP 202 no acredita que Gmail haya entregado el mensaje: revisar la bandeja, spam y el remitente. No se debe pegar la contraseña de aplicación en el chat ni en archivos versionados.

## Desarrollo con un capturador SMTP local

Un servidor SMTP local de pruebas puede recibir los mensajes sin entregar correo a Internet. Es una configuración explícita de desarrollo:

```dotenv
RECUPERACION_ORIGEN="http://localhost:4200"
SMTP_HOST="127.0.0.1"
SMTP_PORT="1025"
SMTP_REMITENTE="cuentas@soho.test"
SMTP_PERMITIR_INSEGURO_LOCAL="true"
```

La excepción sin TLS se admite únicamente con `localhost`, `127.0.0.1` o `::1`, en desarrollo o pruebas. Se rechaza en producción y para cualquier servidor externo. No se escribe esta configuración automáticamente en el `.env` del usuario.

## Contrato y comportamiento

| Método y ruta                             | Datos              | Resultado                                                                                |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `POST /api/auth/recuperacion`             | `{ correo }`       | 202 y un mensaje uniforme para cuentas existentes, desconocidas, inactivas o solo Google |
| `POST /api/auth/recuperacion/comprobar`   | `{ token }`        | `{ vigente }`, sin consumir el enlace                                                    |
| `POST /api/auth/recuperacion/restablecer` | `{ token, clave }` | Actualiza la contraseña, consume el enlace y revoca las sesiones de la cuenta            |

Todas las operaciones requieren CSRF y están sujetas a límites de acceso. La contraseña nueva conserva los requisitos del registro: entre 15 y 128 caracteres Unicode, hasta 512 bytes, sin modificar espacios. Una respuesta de restablecimiento correcta no inicia sesión; la persona debe entrar con su contraseña nueva.

El enlace contiene el identificador aleatorio en el fragmento `#token=...`, que no se envía al servidor al abrir la página. Angular lo retira de la URL y lo conserva únicamente en memoria mientras se completa el formulario. MySQL almacena solo el SHA-256. El token vence en 30 minutos, está limitado al propósito `RECUPERACION_CLAVE` y se consume de forma atómica.

La solicitud responde antes de consultar la cuenta o contactar SMTP, para que la duración del envío no permita distinguir correos registrados. El trabajo se procesa en una cola acotada del proceso. El mensaje 202 confirma la recepción de la solicitud, no que el proveedor la haya entregado. Un reinicio puede perder trabajos aún pendientes; el usuario puede volver a solicitarlos. Antes de operar con varios procesos o exigir entrega durable, sustituir esa cola por un servicio compartido con almacenamiento y reintentos controlados, protegiendo los tokens de los trabajos.

Solo después de que SMTP acepte el nuevo correo se revocan los enlaces anteriores. Si el envío falla se revoca el enlace nuevo y se conservan los anteriores. Los errores operativos deben registrarse sin correo, token ni respuesta SMTP original. El proveedor puede aceptar un mensaje y luego rechazar su entrega; se debe comprobar en su panel la dirección remitente y las políticas del dominio.

## Validación

Las pruebas automatizadas utilizan identidades sintéticas, MySQL temporal y un servidor SMTP local; no acceden a la bandeja de un cliente ni envían correo real. La entrega a una bandeja real requiere configurar el proveedor y efectuar una prueba manual con una dirección controlada.

Pasaron 114 pruebas unitarias, nueve HTTP y 48 de integración con MySQL: 171 del backend. El recorrido de navegador en `.checkout-review/recuperacion/` utilizó el transporte Nodemailer real y un SMTP TCP local que solo acepta destinatarios sintéticos. Comprobó el enlace recibido, cambio de contraseña, rechazo del enlace usado, vencimiento, invalidación de sesiones y login con la clave nueva. Las capturas de Angular se revisaron a 1440 y 390 px. Al terminar se detuvieron los servidores de revisión y se eliminaron los datos MySQL temporales.

## Referencias

- [Nodemailer: transporte SMTP, TLS y tiempos de espera](https://nodemailer.com/smtp).
- [Nodemailer: configuración de mensajes y restricciones de archivos y URLs](https://nodemailer.com/message).
- [OWASP: recuperación de contraseña](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
