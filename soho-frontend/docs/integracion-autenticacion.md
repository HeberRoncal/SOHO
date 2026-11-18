# Autenticación de Angular con NestJS

Registro, login, restauración de sesión y logout utilizan los endpoints reales de NestJS. El proveedor predeterminado de `Cuenta` es `CuentaApi`; no hay una cuenta de demostración como alternativa cuando falla la API. `CuentaDemostracion` se conserva únicamente como doble explícito de pruebas de flujos antiguos.

## Arranque

Con las cuatro migraciones aplicadas, incluida la agenda de direcciones, iniciar el backend y luego Angular:

```powershell
# Desde soho-backend
npm.cmd run start:dev

# Desde soho-frontend, en otra terminal
npm.cmd start
```

El proxy existente envía `/api/**` a `http://127.0.0.1:3000`. La configuración local del backend permite `http://localhost:4200` y `http://127.0.0.1:4200`. Para otro puerto, añadir su origen exacto a `AUTH_ORIGENES` del backend. En producción, publicar frontend y `/api` bajo el mismo origen y resolver la API antes de la regla SPA; el backend exige sus opciones HTTPS y secreto CSRF de producción.

Los administradores se crean desde una terminal interactiva en el backend con `npm.cmd run admin:crear`. No hay un alta administrativa desde el navegador ni credenciales públicas incluidas en el login. Esta entrega no creó cuentas en `soho_db`.

## Registro, login y sesión

- `/crear-cuenta` envía solo nombres, apellidos, correo y contraseña a `POST /api/auth/registro`. La confirmación no se envía. El servidor fija `CLIENTE` e inicia sesión. El flujo abre la cuenta y programa el correo de verificación si SMTP está configurado; el acceso básico sigue disponible mientras está pendiente.
- `/iniciar-sesion` utiliza `POST /api/auth/login`. El correo se recorta y convierte a minúsculas. La contraseña se conserva exactamente, incluidos espacios. Las claves nuevas requieren entre 15 y 128 caracteres; no se añaden requisitos de mayúsculas o números. El login admite las contraseñas existentes con un máximo de 128 caracteres.
- `GET /api/auth/me` restaura el perfil al arrancar. La consulta de sesión no bloquea la navegación pública. Los guards de rutas privadas esperan su resultado y vuelven a comprobar el rol al navegar.
- Los destinos de retorno se restringen a rutas internas conocidas, incluyendo administración. Un administrador sin un destino solicitado entra al dashboard; un cliente no recibe acceso a una ruta administrativa por indicarla como destino.
- Los envíos se bloquean mientras están pendientes. Los errores mantienen los campos y permiten reintentar; no se repiten automáticamente escrituras que pudieron haberse procesado.
- El estado del perfil y CSRF permanece en memoria. No se guardan credenciales, perfiles, roles o tokens de autenticación en `localStorage` o `sessionStorage`. La sesión se conserva mediante la cookie `HttpOnly` del backend y se vuelve a consultar después de recargar.

`CuentaApi` comparte las comprobaciones concurrentes y cancela una restauración pendiente cuando empieza un login o logout. Una respuesta antigua no puede restablecer un perfil después de cambiar de sesión. Se vuelve a comprobar al recuperar el foco o visibilidad de la pestaña, con un intervalo mínimo de 10 segundos entre comprobaciones; no se añade un temporizador que mantenga activas sesiones inactivas.

Al revalidar `/me`, `EstadoAutenticacion` conserva la referencia del perfil si todos sus campos siguen iguales. Los accesos explícitos mantienen su invalidación de contexto, incluso si se autentica de nuevo la misma cuenta. Las pantallas con formularios o vistas privadas que antes reaccionaban a cualquier actualización del perfil ahora observan el identificador y el rol de la cuenta, además del registro abierto. Los cambios de nombre, correo o verificación actualizan el perfil compartido sin reiniciar esas pantallas.

Volver de otra pestaña conserva campos, modal abierto, desplazamiento y tarea del borrador; también mantiene filtros y paginación. La comprobación de sesión continúa activa. Un cambio de cuenta, una revocación de ADMIN, un 401 o un fallo que impida confirmar la sesión conserva la limpieza y salida privada correspondientes. No se añaden perfiles ni credenciales al almacenamiento web.

Esta corrección aprobó **1131 pruebas en 152 archivos**, tipos y compilación de producción. Chrome verificó ocho recorridos con dos pestañas de la misma ventana: período del Dashboard, modal y desplazamiento, metadatos del usuario, cambio de cuenta, precio/tallas/galería/tarea del borrador, revocación, respuestas 401/503 y filtros/página de Pedidos. Todas las API fueron simuladas y no hubo escrituras. Evidencia: `.checkout-review/conservar-pestana.mjs` y `.checkout-review/conservar-pestana-validacion.json`, desde la raíz SOHO.

## Datos personales

**Mi cuenta → Mis datos** precarga nombres y apellidos del perfil autenticado y los guarda con `PATCH /api/auth/me`. El correo permanece en lectura y no se ofrece un campo de celular sin persistencia. Los nombres se validan con los mismos límites de 2 a 80 caracteres Unicode del servidor; el primer campo inválido recibe el foco antes de enviar.

Durante el guardado se bloquean el formulario y los envíos repetidos. La respuesta confirmada por MySQL actualiza el perfil compartido, incluidos el nombre de la cuenta y el resumen. No se aplica un cambio optimista ni se guarda el perfil en almacenamiento web. Se cancelan comprobaciones antiguas de `/me` y una respuesta tardía no puede restaurar una sesión cerrada o reemplazada.

Los errores conservan el borrador para un reintento manual y enfocan el aviso anunciado; un 401 utiliza el manejo de sesión vencida. Los cambios se mantienen después de recargar o volver a iniciar sesión. **Cancelar** vuelve al resumen sin enviar el borrador. Se conserva el acceso a la vinculación Google existente.

El recorrido en `.checkout-review/perfil/` comprueba validación y foco, duplicados, error 503 recuperable, CSRF renovado, guardado real, cancelación, persistencia tras recarga y nuevo login y rechazo después de revocar la sesión. Se revisó a 1440 y 390 px con Angular de producción, NestJS y MySQL temporales, sin errores JavaScript ni desbordamientos de página. Utiliza cuentas sintéticas y no modifica `soho_db`.

## Acceso y vinculación con Google

El botón oficial aparece únicamente en el login cuando NestJS tiene `GOOGLE_CLIENT_ID` configurado. Desde allí inicia sesión en una cuenta Google vinculada o crea un CLIENTE nuevo; `/crear-cuenta` conserva el registro por correo y contraseña y no carga el botón ni solicita desafíos de Google. Se utiliza Google Identity Services con ventana emergente y callback JavaScript. El ID es público; el secreto de cliente no se utiliza. Para la configuración local actual, abrir **http://localhost:4200**, cuyo origen está registrado en Google Auth Platform.

Antes de mostrar el botón se solicita un nonce de cinco minutos a NestJS. Al elegir una cuenta, Angular envía la credencial a `POST /api/auth/google` con CSRF. NestJS verifica el token y devuelve el mismo contrato de usuario y sesión que el login con contraseña. Credencial y contraseña de vinculación permanecen solo en memoria mientras se completa la operación; no se incluyen en URLs o almacenamiento web. Se carga el script exclusivamente desde `https://accounts.google.com/gsi/client` y se dibuja el botón mediante su SDK.

La cuenta nueva siempre es `CLIENTE`. Si Google no aporta nombres o apellidos válidos, el formulario solicita completarlos y mantiene el mismo desafío hasta su vencimiento. Un correo ya registrado exige entrar por contraseña y vincular Google desde **Mi cuenta → Mis datos**, confirmando la contraseña actual. No se unen cuentas automáticamente. Una identidad ya vinculada conserva sus datos y rol locales, incluido `ADMIN`.

Cancelar la ventana no bloquea el formulario de correo. Los fallos de carga, credencial, contraseña, duplicidad, caducidad o límite de intentos permiten reintentar manualmente; cada reintento del botón obtiene un desafío nuevo. No hay One Tap ni selección automática. Los callbacks de vistas destruidas se ignoran. Cuando Google no está configurado se mantiene el acceso por contraseña.

El acceso reserva desde el primer render 44 px para el botón o su mensaje de carga, junto con el espacio del separador. El SDK se mantiene transparente e inerte hasta que su iframe tiene dimensiones y el botón provisional deja de ocupar espacio durante dos fotogramas consecutivos. Se conserva la tipografía oficial. El redimensionamiento utiliza la misma espera y no cambia la altura del bloque. Si el montaje no termina en diez segundos, se liberan observadores y temporizadores y se ofrece reintento. El aviso de comprobación de sesión se presenta con posición fija, sin desplazar el contenido de la ruta anterior.

## Recuperación de contraseña

El enlace **¿Olvidaste tu contraseña?** del login abre `/recuperar-contrasena`. La pantalla solicita el correo con `POST /api/auth/recuperacion`, muestra una confirmación uniforme para evitar revelar cuentas y permite enviar otra solicitud. Un fallo de conexión, límite o servicio de correo presenta el error y conserva el campo; no afirma que se haya enviado el mensaje ni repite automáticamente la operación.

El correo lleva a `/restablecer-contrasena#token=...`. El fragmento no se envía al servidor web; el componente lo retira inmediatamente con `Location.replaceState` y conserva el token solo en su instancia. No aparece en el DOM, enlaces, parámetros de retorno, `localStorage` o `sessionStorage`. La ruta usa temporalmente `Referrer-Policy: no-referrer` mediante una etiqueta meta y restaura la política anterior al salir. Recargar después de retirar el fragmento requiere abrir de nuevo el enlace del correo.

La comprobación utiliza `POST /api/auth/recuperacion/comprobar` con `{ token }` y CSRF, sin consumir el enlace. Una respuesta `{ vigente: false }` pide solicitar otro; un error de red permite reintentar la comprobación. Con un enlace vigente se solicitan una contraseña nueva de 15 a 128 caracteres y su confirmación. La confirmación no se envía; el cambio usa `POST /api/auth/recuperacion/restablecer` con `{ token, clave }` y conserva los espacios de la contraseña.

Al completar el cambio se cancela cualquier restauración pendiente de `/me`, se retira el perfil local, se limpia CSRF y se pide iniciar sesión con la contraseña nueva. No hay login automático. Si el enlace fue consumido o venció entre comprobación y envío, se borra la clave y se retira el formulario. Las pantallas de recuperación no cargan el SDK de Google. El envío real requiere la configuración SMTP del backend; las cuentas con acceso únicamente por Google deben continuar mediante Google.

## Verificación de correo

**Mi cuenta** muestra el estado real de verificación devuelto por `/me`. Mientras está pendiente ofrece **Enviar enlace de verificación**, mediante `POST /api/auth/verificacion/reenviar` con `{}` y CSRF. El servidor elige exclusivamente al usuario autenticado; el navegador no envía una dirección ni un ID. El botón bloquea duplicados, comunica la solicitud aceptada y muestra errores de servicio o límites sin afirmar entrega. Una cuenta ya verificada, incluidas las verificadas por Google, no ofrece el reenvío.

El correo abre `/verificar-correo#token=...`. El componente retira inmediatamente el fragmento con `Location.replaceState`, sincroniza la URL del router y conserva el token únicamente en memoria. Usa temporalmente `no-referrer` y restaura la política anterior al salir. No carga Google ni incluye el token en enlaces, almacenamiento web o parámetros de retorno. Reabrir un enlace vuelve a comprobarlo, aunque la instancia anterior mostrara confirmación.

La comprobación por `POST /api/auth/verificacion/comprobar` no consume el enlace. El usuario pulsa **Verificar mi correo** para confirmar con `POST /api/auth/verificacion/confirmar`. Hay estados de comprobación, error recuperable, enlace inválido y éxito. Un enlace vencido, utilizado o sustituido dirige a la cuenta para solicitar otro. Ambos endpoints son públicos con CSRF; confirmar sin sesión permite después iniciar sesión y no crea un perfil automáticamente.

Tras confirmar con sesión, se cancela una consulta anterior del perfil y se solicita `/me` de nuevo. No se adopta un usuario desde la respuesta de confirmación. El backend conserva contraseña, rol y sesiones. La duración de ocho horas, consumo único, cola y configuración SMTP compartida se detallan en [Verificación de correo](../../soho-backend/docs/verificacion-correo.md). No requiere migrar la base otra vez.

## CSRF e interceptor

El interceptor se aplica únicamente a URLs relativas que empiezan por `/api/`. Activa credenciales para esas solicitudes y añade `X-CSRF-Token` a las escrituras. Las URLs externas no reciben estas opciones o firmas.

`ProteccionCsrf` consulta `/api/auth/csrf` mediante `HttpBackend` para evitar recursión, comparte una solicitud inicial entre operaciones concurrentes y conserva el token en memoria. Después de login, registro, acceso Google o vinculación adopta el token nuevo emitido por el servidor. Un error 403 limpia la firma almacenada: el siguiente intento manual obtiene otra; no se reenvía automáticamente la operación. Las solicitudes tienen un tiempo máximo de 15 segundos.

Los errores 401 esperados de login o restauración se gestionan localmente. Un 401 de otra solicitud protegida borra el estado de autenticación y envía al acceso cuando se está en una página privada. Un fallo 503 o de red durante la comprobación conduce a `/sesion-no-disponible`, con reintento; no se confunde con un usuario anónimo ni concede acceso.

## RBAC e interfaz

`/admin` y sus rutas hijas requieren un perfil vigente con rol `ADMIN`. Los clientes llegan a `/sin-permiso`; los anónimos, al login con su destino de retorno. `/mi-cuenta` y sus secciones requieren una sesión válida.

La estructura administrativa muestra la identidad de la API y ofrece cierre de sesión. Su contenido privado desaparece cuando se pierde el rol. Una confirmación de cambios sin guardar no puede impedir salir después de perder acceso. La pantalla de administradores muestra la cuenta actual y los dos roles; se retiraron propietario, invitaciones ficticias y permisos individuales del estado y la interfaz.

Los guards de Angular controlan la navegación. La autorización de datos y operaciones continúa en NestJS; los futuros endpoints administrativos y de recursos personales deben utilizar sus guards y controles de propiedad. No se incorporan escrituras administrativas reales en esta entrega.

## Cierre y errores

Cerrar sesión utiliza `POST /api/auth/logout` con CSRF. La interfaz espera la revocación antes de retirar el perfil y navegar al login. Un 401 confirma que la sesión ya no es válida; un fallo de red o 503 conserva el estado visible y muestra el error, sin afirmar que se cerró correctamente.

Errores de credenciales, correo duplicado, límites 429, CSRF y conexión presentan mensajes específicos, sin mostrar detalles internos del backend. Los formularios incluyen errores anunciados, foco en el mensaje o campo afectado, estados ocupados y un aviso de sesión vencida al volver a una pestaña privada.

## Funciones pendientes

Recuperación y verificación de correo utilizan endpoints reales y requieren SMTP para entregar mensajes. Las cuentas Google no ofrecen todavía desvinculación ni creación de una contraseña local.

El perfil permite guardar nombres y apellidos. La [agenda de direcciones](integracion-direcciones.md) utiliza sus endpoints protegidos y persiste en MySQL. El cambio de correo y celular del perfil siguen pendientes. Pedidos, checkout y operaciones comerciales del panel conservan su alcance de demostración, indicado en esas secciones; no representan compras o modificaciones persistidas en MySQL.

## Validación

Pasaron la compilación de producción y las 409 pruebas de Angular en 107 archivos. Comprueban restauración concurrente, CSRF, rotación, logout fallido, cancelación de respuestas antiguas, rechazo de roles desconocidos, retorno seguro, guards, bloqueo de envíos repetidos e indicador de carga durante navegación pendiente. Las pruebas Google cubren descarga y reintento del SDK, nonce, callbacks antiguos, credenciales sin persistir, datos incompletos, errores de vinculación, adopción del CSRF rotado y espera del botón definitivo con limpieza de montajes fallidos. Recuperación y verificación añaden solicitud, enlaces vigentes o inválidos, confirmación explícita, errores y reintentos, limpieza de fragmentos, reapertura de enlaces, confirmación anónima sin login y actualización del perfil sin respuestas antiguas. El paquete inicial de producción ocupa 352,83 kB.

El recorrido de navegador usó Chrome sin ventana a 1440 y 390 px, NestJS y MySQL 8.0.46 temporales con sus tres migraciones. Verificó registro real, conservación tras recarga, cookies `HttpOnly`, ausencia de autenticación en almacenamiento web, errores 401/429, rechazo de CLIENTE en administración, identidad ADMIN, cambios de rol en rutas hijas, vencimiento por inactividad, cierre confirmado contra MySQL y fallos 503 recuperables. Los errores y retrasos controlados se aplicaron desde CDP. No hubo errores de JavaScript ni desbordamientos de página.

El resultado y las capturas están en `.checkout-review/auth/` desde la raíz SOHO; se trata de evidencia local fuera del repositorio frontend. No acredita un dispositivo físico ni lector de pantalla. Las cuentas fueron sintéticas y no se utilizaron las credenciales de `soho_db`. Al terminar se detuvieron Angular, NestJS y MySQL de revisión y se eliminó el directorio de datos temporal.

La revisión Google está en `.checkout-review/google/`. Se cargó el SDK oficial con el ID de cliente configurado en `http://localhost:4200` y se revisó su botón a 1440 y 390 px. Otro recorrido, con SDK y verificador externo sintéticos exclusivamente en los archivos de revisión, comprobó alta CLIENTE, segundo acceso por `sub`, correo existente, contraseña incorrecta, vinculación y perfil incompleto con NestJS y MySQL reales aislados. No hubo errores JavaScript ni desbordamientos de página. El consentimiento y el intercambio de un ID token emitido para una cuenta Google real siguen pendientes de comprobación manual; no se accedió a una cuenta personal durante las pruebas.

La corrección del parpadeo se documenta en `.checkout-review/google-parpadeo/`. La medición de navegación desde el icono de cuenta pasó de seis desplazamientos a cero; el contenedor permaneció en 44 px durante toda la carga y el separador y formulario conservaron sus posiciones. Se revisaron carga real del SDK a 1440 y 390 px, cambio de escritorio a móvil, iframe bloqueado, timeout y reintento correcto. El acceso por correo permaneció disponible y no hubo errores JavaScript. Se utilizaron perfiles temporales de Chrome, sin iniciar sesión ni modificar datos de cuentas.

La revisión de recuperación está en `.checkout-review/recuperacion/`: Angular de producción, NestJS, MySQL temporal con sus tres migraciones y un capturador SMTP local real. Se revisaron solicitud desde login, fallo 503 sin afirmar envío, bloqueo de duplicados, mensaje uniforme para correo desconocido, eliminación del token antes del POST, reintento de comprobación, confirmación de contraseña, revocación de la sesión anterior, rechazo de enlaces usados o vencidos y acceso con la contraseña nueva. Reabrir el mismo enlace en la misma pestaña vuelve a comprobarlo, sin heredar el éxito anterior. Las páginas con fragmento conservan su estructura propia, sin duplicar cabecera o footer de tienda. Las capturas se revisaron a 1440 y 390 px, sin desbordamientos ni errores JavaScript. No se enviaron mensajes a Internet ni se modificó `soho_db`.

La revisión de verificación está en `.checkout-review/verificacion/`: Angular de producción, NestJS, MySQL temporal y un servidor SMTP TCP local. Comprueba correo automático al registrarse, reenvío autenticado, fallos 503 recuperables, eliminación del fragmento, confirmación explícita sin duplicados, consumo y sustitución de enlaces, estado de cuenta actualizado y confirmación sin sesión. Se revisaron capturas a 1440 y 390 px sin desbordamiento ni errores JavaScript. No se modificó `soho_db` ni se enviaron mensajes a Internet. La llegada a una bandeja real queda para comprobación manual.

## Referencias

- [Contrato del backend](../../soho-backend/docs/autenticacion.md).
- [Angular: interceptores HTTP](https://angular.dev/guide/http/interceptors).
- [Angular: guards de navegación](https://angular.dev/guide/routing/route-guards).
- [Google: botón oficial](https://developers.google.com/identity/gsi/web/guides/display-button).
