# Autenticación con contraseña o Google, sesiones y RBAC

El backend incorpora registro de clientes, inicio y cierre de sesión y consulta de la cuenta autenticada. Reutiliza las tres migraciones existentes; esta implementación no añade tablas ni aplica cambios a `soho_db`.

La autenticación utiliza cookies con identificadores aleatorios y sesiones en MySQL. El rol vigente se consulta en `usuarios`, con los únicos valores `ADMIN` y `CLIENTE`. Angular conecta registro, contraseña, Google, vinculación, recuperación de contraseña, verificación de correo, restauración, logout y guards de navegación; su funcionamiento se documenta en [Integración de autenticación](../../soho-frontend/docs/integracion-autenticacion.md).

## Desarrollo

La distribución de archivos y las responsabilidades de cada carpeta están en [Organización de autenticación](estructura-autenticacion.md).

Con las migraciones aplicadas y `DATABASE_URL` configurada en `.env`:

```powershell
npm.cmd run build
npm.cmd run start:dev
```

La configuración local permite los orígenes `http://localhost:4200` y `http://127.0.0.1:4200`. Angular deberá acceder mediante su proxy `/api`; no se habilita CORS entre dominios. `AUTH_ORIGENES` permite indicar otros orígenes exactos separados por comas, sin barras finales ni rutas. La configuración nueva aparece en `.env.example`; no se reemplaza el `.env` existente.

## Contrato HTTP

Todas las respuestas de autenticación y de rutas privadas utilizan `Cache-Control: no-store`. Las respuestas contienen únicamente datos públicos de la cuenta: `id`, `nombres`, `apellidos`, `correo`, `rol` y `correoVerificado`. Nunca se devuelve un hash de contraseña ni el identificador de sesión en JSON.

| Método y ruta             | Acceso                | Datos y resultado                                                                                                            |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/auth/csrf`      | Público               | Establece una cookie de desafío y devuelve `{ csrfToken }`                                                                   |
| `POST /api/auth/registro` | Público, con CSRF     | `{ nombres, apellidos, correo, clave }`; crea un `CLIENTE` e inicia sesión; devuelve `{ usuario, csrfToken }` con estado 201 |
| `POST /api/auth/login`    | Público, con CSRF     | `{ correo, clave }`; inicia sesión y devuelve `{ usuario, csrfToken }` con estado 200                                        |
| `GET /api/auth/me`        | Autenticado           | Devuelve `{ usuario }` de la sesión, sin aceptar otro ID de usuario                                                          |
| `POST /api/auth/logout`   | Autenticado, con CSRF | Recibe `{}`, revoca la sesión y elimina las cookies; responde 204                                                            |

El correo se recorta y convierte a minúsculas, conservando acentos. Los nombres y apellidos deben tener entre 2 y 80 caracteres. La contraseña de alta requiere entre 15 y 128 caracteres Unicode, hasta 512 bytes; se conserva exactamente, incluidos espacios. Se rechazan campos desconocidos como `rol`, `activo` o `claveHash`.

Las claves se procesan con Argon2id, 19 MiB, dos iteraciones, paralelismo uno y un salt aleatorio por hash. Las cuentas inexistentes y las cuentas Google sin clave también ejecutan una verificación ficticia. Clave incorrecta, cuenta inexistente, desactivada o sin contraseña local comparten el mismo error 401. Un correo duplicado en el registro responde 409 sin modificar la cuenta existente. El registro programa la verificación de correo cuando SMTP está configurado; conserva el acceso básico mientras está pendiente.

## Edición de datos personales

`PATCH /api/auth/me` requiere una sesión activa de `CLIENTE` o `ADMIN`, JSON, origen permitido y CSRF. Recibe exactamente `{ nombres, apellidos }` y devuelve `{ usuario }` con la misma selección pública que `GET /api/auth/me`. Ambos campos son obligatorios, se recortan y admiten de 2 a 80 caracteres Unicode, sin controles ni caracteres de formato invisibles.

El usuario se obtiene exclusivamente de la sesión; no se admiten ID, correo, celular, rol, contraseña, actividad ni verificación en el cuerpo. La actualización comprueba que la cuenta siga activa y guarda únicamente nombres y apellidos dentro de una transacción, antes de leer su respuesta. Conserva la contraseña, correo, rol, verificación, identidades externas y sesiones. No rota cookies ni CSRF. El esquema existente ya contiene los campos y no requiere migración.

Las pruebas con MySQL cubren persistencia después de otro login, aislamiento entre cuentas, rechazo de campos ajenos, validación, CSRF, sesión vencida o cuenta desactivada y edición de una cuenta con identidad Google. El recorrido de Angular de producción con NestJS y MySQL temporales está en `.checkout-review/perfil/`, desde la raíz SOHO; no modifica `soho_db`.

## Uso de CSRF y cookies

1. Solicitar `GET /api/auth/csrf` y conservar las cookies y el `csrfToken` de la respuesta.
2. Enviar las solicitudes de escritura como JSON, con `Origin` permitido y cabecera `X-CSRF-Token` que contenga ese token. Esto incluye registro, login y logout.
3. Tras registro o login, sustituir el token en memoria por el `csrfToken` nuevo de la respuesta. Las cookies se actualizan mediante `Set-Cookie`.
4. Para recuperar el token tras recargar la página, volver a consultar `/api/auth/csrf`. El desafío existente se conserva mientras sea válido. Ante un 401, el backend retira las cookies inválidas y el cliente deberá volver al acceso y obtener un nuevo CSRF.

El token es un HMAC-SHA-256 vinculado a la sesión y a un desafío aleatorio de cookie. La sesión no se incluye en el token expuesto. Se valida la firma con comparación de tiempo constante, el origen y `Sec-Fetch-Site`. Las cookies de sesión y desafío son `HttpOnly`, `SameSite=Lax`, de host y con ruta `/`. No se guardan tokens de autenticación en `localStorage`. La integración Angular deberá enviar la cabecera desde el token devuelto en JSON; su interceptor predeterminado de lectura de cookies XSRF no sustituye este contrato.

Cada sesión utiliza 32 bytes aleatorios; MySQL guarda únicamente su SHA-256. El vencimiento absoluto es de 12 horas y el límite de inactividad es de 30 minutos desde la última solicitud autenticada. La actividad no prolonga las 12 horas. Volver a entrar desde una sesión existente revoca ese identificador y crea otro. Otras sesiones del usuario continúan vigentes. El cierre revoca en MySQL antes de eliminar las cookies. Cuenta desactivada, sesión revocada, desconocida o vencida producen 401; las sesiones desactivadas o vencidas detectadas se marcan revocadas.

## Google Identity Services

Configurar `GOOGLE_CLIENT_ID` en `.env` con el ID público de un cliente OAuth de tipo **Aplicación web**. Si se omite, Google permanece deshabilitado y el acceso por contraseña funciona. No se necesita un secreto de cliente ni descargar el JSON para este flujo. El frontend obtiene la configuración pública desde NestJS y carga el script oficial `https://accounts.google.com/gsi/client`.

En Google Auth Platform registrar los orígenes JavaScript exactos. Para el desarrollo actual se utiliza `http://localhost:4200`; `http://localhost` también está registrado. Abrir Angular con ese nombre: `127.0.0.1` requiere su propio origen autorizado en Google. El botón abre una ventana y entrega el ID token a una función JavaScript; no utiliza una URI de redireccionamiento. En producción registrar el origen HTTPS de la tienda y ajustar `AUTH_ORIGENES`.

| Método y ruta                               | Acceso            | Resultado                                                    |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `GET /api/auth/google/configuracion`        | Público           | `{ habilitado, clientId }`                                   |
| `POST /api/auth/google/desafio`             | Público, CSRF     | Recibe `{}`; devuelve `{ clientId, nonce, expiraEn }`        |
| `POST /api/auth/google`                     | Público, CSRF     | `{ credential, perfil? }`; devuelve `{ usuario, csrfToken }` |
| `GET /api/auth/google/vinculacion`          | Autenticado       | `{ vinculado }`                                              |
| `POST /api/auth/google/vinculacion/desafio` | Autenticado, CSRF | Recibe `{}`; devuelve un nonce de vinculación                |
| `POST /api/auth/google/vinculacion`         | Autenticado, CSRF | `{ credential, clave }`; vincula y rota sesión y CSRF        |

El desafío vence en cinco minutos y se utiliza una sola vez. Se liga al propósito, a la sesión del navegador y a una cookie aleatoria `HttpOnly` separada del nonce público (`soho_google` en desarrollo, `__Host-soho_google` en producción). Se impiden envíos concurrentes y la reutilización. El almacén está acotado a 1024 desafíos en memoria: reiniciar invalida los pendientes. Para varias instancias, sustituirlo por un almacén compartido con reserva y consumo atómicos. Cerrar sesión invalida también el desafío de ese navegador.

NestJS usa `google-auth-library` para verificar firma RS256 con las claves de Google, emisor, audiencia y vencimiento; comprueba además nonce, fecha de emisión, `sub` y `email_verified`. El ID token no es una sesión de SOHO y no se guarda. La identidad es el par `GOOGLE + sub`, independiente de cambios del correo de Google. Un acceso posterior conserva nombres, correo y rol locales.

Una identidad nueva crea `CLIENTE`, con `claveHash = null`, reutilizando las sesiones de SOHO. El correo debe ser Gmail o pertenecer a una organización Google Workspace indicada por `hd`, además de estar verificado. Para otro correo se pide crear una cuenta con contraseña y vincularla después. Si faltan nombres o apellidos válidos, se responde 422 `GOOGLE_COMPLETAR_PERFIL`: Angular los solicita y reenvía `perfil: { nombres, apellidos }` con el mismo desafío todavía vigente; la cuenta no se crea parcialmente.

Si el correo coincide con una cuenta local existente, se responde 409 `GOOGLE_VINCULACION_REQUERIDA`, sin vincular ni iniciar sesión. La persona debe entrar por contraseña, abrir **Mi cuenta → Mis datos**, confirmar su contraseña actual y elegir Google. La vinculación conserva datos y rol, admite una identidad Google por cuenta y rechaza identidades de otro usuario. Solo verifica el correo local cuando coincide exactamente con el correo fiable de Google. La sesión anterior del navegador se revoca al completar la vinculación.

No se ofrecen desvinculación ni creación/cambio de contraseña para cuentas Google. Tampoco se solicitan permisos para Gmail, Drive u otras APIs.

## Recuperación de contraseña

El flujo reutiliza `tokens_usuario` sin otra migración. Los endpoints públicos `POST /api/auth/recuperacion`, `POST /api/auth/recuperacion/comprobar` y `POST /api/auth/recuperacion/restablecer` requieren CSRF. Se utiliza un identificador aleatorio de 32 bytes, de un solo uso y con vencimiento de 30 minutos; MySQL guarda únicamente SHA-256. La solicitud devuelve 202 con un mensaje uniforme, sin consultar la cuenta ni esperar SMTP antes de responder. Sin SMTP configurado responde 503 para cualquier dirección. El contrato, configuración y límites de la cola se detallan en [Recuperación de contraseña](recuperacion-contrasena.md).

El cambio se realiza en una transacción que bloquea la cuenta, vuelve a validar el token, lo consume y revoca las sesiones y los demás enlaces de recuperación. El login por contraseña toma el mismo bloqueo antes de releer el hash para impedir que una contraseña anterior cree otra sesión durante el cambio. No se cambian rol ni estado de verificación del correo, ni se inicia sesión automáticamente. Las cuentas inactivas o sin contraseña local no reciben enlaces.

## Verificación de correo

El registro por contraseña programa un enlace de ocho horas y un solo uso. **Mi cuenta** muestra el estado y permite reenviarlo mediante `POST /api/auth/verificacion/reenviar`, autenticado y con CSRF. `POST /api/auth/verificacion/comprobar` y `POST /api/auth/verificacion/confirmar` son públicos con CSRF; abrir el enlace no lo consume, se requiere confirmación explícita. La confirmación actualiza únicamente la verificación, conserva rol, contraseña y sesiones y no inicia sesión automáticamente. Reutiliza SMTP y el esquema existente. Contrato, límites y garantías en [Verificación de correo](verificacion-correo.md).

## Crear administradores

Desde una terminal interactiva, en `soho-backend`:

```powershell
npm.cmd run admin:crear
```

El comando solicita nombres, apellidos, correo, contraseña oculta y confirmación. No acepta credenciales por argumentos ni variables de entorno y no muestra el hash o contraseña. Crea exclusivamente una cuenta `ADMIN` nueva. Si el correo ya existe, no cambia rol, contraseña ni actividad. No se crea un administrador automáticamente al arrancar ni durante el seed. Las pruebas de esta entrega solo crearon cuentas sintéticas en una instancia temporal, nunca en `soho_db`.

El comando utiliza `tsx` de desarrollo; ejecutar con las dependencias del proyecto instaladas. Para ver su ayuda sin crear cuentas: `npm.cmd run admin:crear -- --help`.

## RBAC y rutas públicas

Los guards se registran globalmente en este orden: autenticación, roles, CSRF y límites de acceso. Una ruta nueva requiere sesión salvo que declare `@Publico()`. El catálogo existente y la raíz se marcan públicos de forma explícita. El módulo no crea endpoints de edición de productos, inventario o pedidos.

Para un controlador administrativo futuro:

```typescript
import { Roles } from '../autenticacion/seguridad/auth.decoradores.js';
import { RolUsuario } from '../generated/prisma/client.js';

@Roles(RolUsuario.ADMIN)
@Get('resumen')
resumen() {
  // Consultar los datos administrativos.
}
```

Una sesión válida con rol insuficiente recibe 403. Los permisos se leen de la base en cada solicitud, por lo que un cambio de rol se aplica sin emitir otro token. `@Roles()` con una lista vacía deniega el acceso. `@UsuarioActual()` permite obtener exclusivamente el usuario verificado por el guard. El endpoint `/me` ya utiliza ese contexto; los futuros servicios de pedidos y perfil deberán comprobar también la propiedad del recurso usando ese ID. Ocultar opciones en Angular complementará la autorización del backend.

## Límites y producción

- Login: 20 solicitudes por minuto e IP, y 10 por correo en 15 minutos, incluidas las solicitudes correctas.
- Registro: 10 solicitudes por hora e IP.
- Google: 20 solicitudes por minuto e IP, compartidas entre emisión de desafíos y finalización de acceso o vinculación.
- Recuperación: 10 solicitudes por hora e IP y tres por correo en una hora. Comprobación del enlace: 60 por minuto e IP. Restablecimiento: 10 por minuto e IP.
- Verificación: reenvío, diez por hora e IP y tres por hora y usuario; comprobación, 60 por minuto e IP; confirmación, diez por minuto e IP.
- CSRF: 60 solicitudes por minuto e IP.
- Al superar un límite se responde 429 con `Retry-After`. El contador usa una tabla en memoria acotada a 10.000 entradas y elimina ventanas vencidas. Para varias instancias se deberá usar un contador compartido y aplicar límites en el proxy.
- El servidor principal admite cuerpos JSON de hasta 16 KiB. Las escrituras requieren `application/json`; no se aceptan formularios simples como alternativa.
- La IP utilizada es la que observa Express. No se confía en `X-Forwarded-For`. Al desplegar detrás de un proxy debe configurarse confianza restringida al proxy real y revisar los límites por IP.
- En producción, `AUTH_ORIGENES` debe contener orígenes HTTPS y `AUTH_SECRETO_CSRF` debe ser un secreto aleatorio de al menos 32 bytes, estable y compartido por los procesos. El arranque falla si faltan, son inválidos o se conserva un marcador de ejemplo.
- En producción las cookies utilizan `Secure` y prefijos `__Host-`. En desarrollo HTTP se utilizan `soho_sesion` y `soho_csrf`. Si se omite el secreto en desarrollo, se genera por proceso y el cliente debe recuperar CSRF después de reiniciar.
- Los errores de persistencia se convierten en 503 sin publicar SQL, credenciales ni detalles del adaptador, incluidos los errores del guard de sesión.

## Validación realizada

Pasaron 119 pruebas unitarias, nueve HTTP e2e y 65 de integración con MySQL aislado: 193 en total. Google incorpora firmas RSA reales con certificados sintéticos y la biblioteca oficial, reclamaciones inválidas, nonce, caducidad, consumo único, registro CLIENTE, datos incompletos, vinculación explícita y conservación de roles. La recuperación añade SMTP local real, respuesta uniforme, enlaces vencidos y utilizados, rechazo de cuentas Google sin contraseña, envío fallido, cambio simultáneo, revocación de sesiones y carrera con un login que ya verificó la contraseña anterior. La verificación cubre alta y reenvío, prueba ligada al correo actual, consumo simultáneo, sustitución después de aceptación SMTP y conservación de rol, contraseña y sesiones. Las pruebas HTTP con MySQL sustituyen el verificador externo de Google y el servicio de correo según el escenario; el transporte real se comprueba por separado con SMTP local y en el recorrido de navegador. No se añade ningún bypass al código de producción. El consentimiento Google y la entrega SMTP a una bandeja real requieren comprobación manual con cuentas controladas.

También se verificó el arranque de `dist/main.js`, la emisión CSRF y el rechazo HTTP 413 para cuerpos excesivos. La base temporal se preparó con las tres migraciones, y se detuvieron sus procesos y eliminaron sus datos. La compilación, TypeScript y lint completan la validación.

## Referencias

- [OWASP: almacenamiento de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- [OWASP: protección CSRF con HMAC vinculado a sesión](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [NestJS: guards](https://docs.nestjs.com/guards).
- [Google: verificar ID tokens y autoridad sobre el correo](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
- [Google: botón oficial y configuración del cliente](https://developers.google.com/identity/gsi/web/guides/display-button).
