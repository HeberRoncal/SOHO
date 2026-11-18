# Fotografías de borradores y publicados con Cloudinary

Fecha: 15 de noviembre de 2026.

La API de fotografías permite cargar imágenes en borradores y publicados, recuperar su estado y guardar una galería ordenada con portada y texto alternativo. Utiliza `ArchivoImagen`, `ImagenProducto` y `OperacionProducto`; su ampliación a publicados funciona sobre las once migraciones vigentes sin otra migración ni seeds. Consultar [Edición de publicados](api-edicion-publicados.md) para las reglas adicionales de galería y bloqueo compartido.

La conexión de la cuenta configurada se comprobó mediante dos solicitudes autenticadas de solo lectura: conexión disponible y carpetas en modo `dynamic`. Las pruebas de carga, conciliación y borrado utilizaron MySQL temporal y Cloudinary simulado mediante HTTP. No se subieron ni eliminaron activos de la cuenta real, ni se escribieron datos de prueba en `soho_db`. Esta distinción también figura en la evidencia local.

## Configuración y organización

Completar exclusivamente en el `.env` del backend:

```dotenv
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

El backend carga estas variables al iniciar. Reiniciarlo después de modificarlas. Las claves y firmas no se devuelven en la API ni se guardan en los JSON de auditoría. No se requiere un upload preset público. La integración utiliza REST de Cloudinary con `fetch`, formularios binarios y firma SHA-256 de servidor; no añade un SDK ni dependencias nuevas.

Si falta una variable, el catálogo y los demás módulos pueden iniciar; las cargas responden con configuración pendiente y el procesador permanece desactivado. El modo de carpetas se consulta mediante Admin API y se conserva en caché durante cinco minutos; no se deduce del nombre de la cuenta ni se configura manualmente en Angular.

La primera carga reserva `Producto.carpetaImagenes`, por ejemplo:

```text
SOHO/productos/nike-air-force-1-07/SHO-0012-blanco
```

Se utiliza el slug de carpeta del grupo y el código interno del producto junto con la etiqueta del color normalizada. La carpeta reservada permanece estable aunque después se corrija el nombre visible del color. En modo dinámico se envía como `asset_folder`; el identificador de entrega es `soho-<UUID del archivo>`, independiente de esa carpeta. El modo fijo también está contemplado y probado con `folder`, conservando la ruta completa del identificador previsto. Las tallas comparten la galería de su producto por color. `SOHO/marcas` mantiene el espacio acordado para una entrega posterior de logotipos.

Cada carga usa un identificador nuevo y `overwrite=false`. El backend conserva la identidad y URL recibidas y las coteja con el archivo preparado. No sobrescribe fotos para simular una sustitución. Las imágenes heredadas conservan sus URL y proveedor `LEGADO`; no se suben ni se mueven automáticamente a Cloudinary.

## Rutas y protección

Todas las rutas requieren una sesión ADMIN y responden con `Cache-Control: no-store`.

| Método y ruta                                        | Uso                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/admin/productos/fotografias/configuracion` | Configuración disponible, modo de carpetas y límites; no devuelve credenciales.                     |
| `POST /api/admin/productos/:id/fotografias`          | Carga multipart de un archivo, identificando el producto por UUID.                                  |
| `GET /api/admin/productos/:id/cargas/:clave`         | Estado de una carga por su clave; solo el administrador que la inició puede recuperarla así.        |
| `GET /api/admin/productos/:id/fotografias`           | Galería actual, versión y hasta 50 archivos recientes del producto que todavía no estén eliminados. |
| `PATCH /api/admin/productos/:id/galeria`             | Guarda la lista completa y ordenada de asociaciones mediante JSON.                                  |
| `GET /api/admin/productos/operaciones/:clave`        | Ruta existente para recuperar el guardado confirmado de galería, accesible al mismo responsable.    |

Las escrituras exigen origen autorizado y token `X-CSRF-Token` vinculado a la sesión. El decorador `MultipartCsrf`, generado con Nest CLI, habilita multipart exclusivamente en la ruta de carga; las demás escrituras conservan la exigencia de JSON. Los guards comprueban sesión, ADMIN, origen, CSRF y límite de acceso antes de procesar el archivo. La carga admite diez intentos por minuto por IP mediante el límite propio `cargar-fotografia`; el resto conserva sus límites administrativos.

La autorización se revalida dentro de la transacción después de esperar bloqueos. Nuevas cargas y cambios de galería admiten `BORRADOR` y `PUBLICADO`; `ARCHIVADO` permanece en consulta y recuperación de solicitudes anteriores. Subir no publica, asocia una foto ni modifica stock, reservas, variantes, códigos o SKU. Publicar continúa exigiendo exclusivamente borrador. Los comprobantes privados de pagos conservan su funcionamiento anterior.

## Cargar una fotografía

Enviar `multipart/form-data` con exactamente estos campos:

| Campo     | Contenido                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------- |
| `datos`   | Texto JSON con `claveCarga` UUID y `version` entera del producto consultado. Máximo 4096 bytes. |
| `archivo` | Un archivo binario JPEG, PNG, WebP o AVIF estático de hasta 5 MiB.                               |

Ejemplo del contenido de `datos`:

```json
{
  "claveCarga": "113e4567-e89b-42d3-a456-426614174000",
  "version": 1
}
```

El cliente establece las credenciales de sesión, origen y cabecera CSRF; al enviar un `FormData` deja que el navegador establezca `Content-Type` con su boundary. No enviar base64, una URL remota ni un `public_id` desde el cliente. No enviar campos protegidos de Cloudinary.

Antes de cargar deben estar definidos grupo, marca, modelo y color. El archivo se comprueba por contenido y MIME, se decodifica con sharp, se rechazan animaciones y dimensiones mayores de 8192 píxeles por lado o 20 megapíxeles, y se recodifica para quitar metadatos y datos añadidos. Se conserva la orientación visual. El resultado también debe quedar dentro de 5 MiB. Se limitan a dos las cargas activas por proceso.

La preparación guarda hash original y hash del contenido recodificado dentro de la huella de solicitud. El archivo pendiente conserva su UUID, responsable, destino, dimensiones, bytes, formato, token y plazo de carga. La carpeta y el registro pendiente se confirman en una transacción corta; las llamadas externas ocurren después, sin mantener esa transacción abierta.

Cloudinary recibe el archivo binario, identificador determinista, `overwrite=false` y contexto de pertenencia y hash. Una respuesta externa no basta para marcarlo disponible: se consulta el recurso por Admin API, se comprueban contexto, tipo, carpeta, identidad, tamaño, dimensiones, formato y URL HTTPS esperada y se descarga el original verificado para cotejar su SHA-256. Nunca se sigue una redirección ni se descarga una URL arbitraria indicada por Angular. Una transformación automática del archivo por configuración externa impide confirmarlo si altera el contenido esperado.

La respuesta envuelve `archivo`. Incluye UUID, estado, proveedor, nombre, URL disponible, formato, dimensiones, bytes y versión Cloudinary como cadena decimal; no devuelve un `BigInt` sin serializar. Una carga confirmada responde 201. Una carga en proceso o cuyo resultado necesita conciliación responde 202; consultar su clave para obtener el estado posterior.

Subir no asocia automáticamente el archivo a la galería ni incrementa la versión comercial del producto. Por eso varias cargas sobre un mismo borrador pueden usar la misma versión vigente; el guardado de galería utiliza su propia clave y versión.

## Reintentos y conciliación

Repetir la misma clave y solicitud recupera el archivo existente sin otro POST de subida. La clave queda vinculada al responsable, producto, versión inicial, nombre, MIME y contenido. Usarla con otro contenido, producto o administrador responde 409; consultarla desde otro administrador responde 404. El historial no permite resucitar un archivo que ya esté eliminado.

Un timeout, una respuesta perdida, un resultado incompatible o una caída tras guardar el registro pendiente conservan `PENDIENTE` o `CONCILIANDO`. El procesador recupera esas cargas después del vencimiento del bloqueo consultando únicamente su identidad externa prevista. Si encuentra el contenido correcto, confirma `DISPONIBLE`. Un 404 no demuestra que una petición anterior no vaya a terminar: se conserva la incertidumbre y se vuelve a consultar, sin repetir la subida ni declarar el archivo eliminado.

La ausencia persistente o una discrepancia externa puede requerir revisión operativa. Esta entrega no conserva los bytes del archivo en almacenamiento duradero ni implementa reenvío automático de una carga que nunca llegó a Cloudinary. Para cargar otra fotografía se usa una clave nueva; el registro incierto anterior se mantiene para poder recuperar una respuesta tardía. Los reintentos de consulta se espacian progresivamente hasta seis horas.

Las reclamaciones usan tokens y plazos de dos minutos. Una confirmación tardía solo puede modificar el registro si todavía corresponde al mismo token. Dos administradores o procesos que reciben la misma clave no pueden iniciar dos subidas simultáneas. Un estado `ELIMINANDO` o `ELIMINADO` recuperado por clave exige atender ese estado; no debe interpretarse como una nueva carga aceptada.

## Guardar galería, portada y orden

El PATCH recibe la lista completa; su primera posición es la portada:

```json
{
  "claveSolicitud": "223e4567-e89b-42d3-a456-426614174000",
  "version": 1,
  "imagenes": [
    {
      "archivoId": "333e4567-e89b-42d3-a456-426614174000",
      "textoAlternativo": "Vista frontal de la zapatilla blanca"
    },
    {
      "archivoId": "443e4567-e89b-42d3-a456-426614174000",
      "textoAlternativo": "Vista lateral"
    }
  ]
}
```

Se admiten de cero a ocho imágenes en borradores y de una a ocho en publicados, sin archivos repetidos. El texto alternativo admite hasta 160 caracteres. Cada archivo debe pertenecer al producto y estar `DISPONIBLE`; puede ser Cloudinary o heredado. Las posiciones se asignan consecutivamente de cero a siete. Una lista vacía deja el borrador sin galería; en un publicado devuelve 422 y revierte el cambio. La galería publicada valida todos los requisitos del resultado, incluidas marca/categoría, identidad y variantes habilitadas.

El guardado bloquea producto y archivos ordenados por UUID, revalida sesión, exige versión vigente, guarda asociaciones, incrementa la versión una vez y registra responsable, copias anterior/posterior y respuesta en `OperacionProducto`. Si falla la auditoría final, todo ese cambio se revierte. La clave repetida con el mismo contenido recupera la respuesta confirmada aunque después exista una edición posterior; consultar el detalle vigente después de recuperarla. Una clave con contenido o responsable distintos responde 409.

Quitar una asociación conserva el archivo. Reemplazar una fotografía consiste en cargar otro archivo y guardar la galería seleccionando el nuevo. Las URL copiadas en artículos de pedidos y sus referencias de archivo permanecen intactas.

## Limpieza de archivos sin referencias

Las cargas confirmadas sin asociar y las fotografías retiradas reciben un plazo de 24 horas para poder incorporarlas o recuperarlas. Asociarlas cancela la marca de limpieza. Al reclamar una limpieza se bloquean producto y archivo y se comprueba de nuevo que no existan referencias de galería ni de artículos de pedidos. Solo se atienden archivos Cloudinary confirmados de la cuenta configurada; se excluyen los heredados y las cargas pendientes o inciertas.

La reclamación marca `ELIMINANDO` con token y plazo antes de llamar a Cloudinary. La asociación y el checkout exigen `DISPONIBLE` bajo bloqueo, por lo que no pueden añadir referencias a un archivo en limpieza. El borrado externo consulta primero la identidad inmutable `asset_id` y verifica que la versión y datos coincidan; después elimina por ese identificador y confirma la ausencia. Un recurso modificado o movido fuera del contrato se conserva para revisión.

Un fallo conserva `ELIMINANDO` para reintento. Una respuesta perdida después de borrar se resuelve comprobando la ausencia por `asset_id`, sin exigir que el archivo siga existiendo. La confirmación final usa el token reclamado y conserva la fila como `ELIMINADO` para auditoría. No se borran activos de una cuenta distinta ni imágenes utilizadas por un pedido histórico.

## Procesador y errores

El procesador se inicia automáticamente cuando la configuración está completa y el entorno no es `test`. Ejecuta lotes de hasta diez registros, con un minuto entre ejecuciones y recuperación progresiva por registro. Se excluyen referencias existentes del descubrimiento para que no bloqueen los demás huérfanos. Las operaciones externas se realizan fuera de transacciones y los errores se registran sin credenciales o respuestas completas del proveedor. Al cerrar la aplicación se detiene el temporizador y se espera el trabajo actual antes de cerrar Prisma.

`CLOUDINARY_PROCESADOR_ACTIVO=false` permite detener este mantenimiento sin desactivar las cargas. Si se usa esa opción, las cargas inciertas y los huérfanos requieren reactivar el procesador para ser atendidos. La consulta por clave no ejecuta mantenimiento ni repite cargas.

| Estado HTTP | Situación                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| 400         | JSON/campos inválidos, archivo corrupto, MIME incompatible, duplicados o galería inválida.                      |
| 401 / 403   | Sesión ausente/revocada, rol insuficiente, origen o CSRF inválidos.                                             |
| 404         | Producto, carga privada o archivo del producto no encontrado.                                                   |
| 409         | Versión obsoleta, estado no editable, clave reutilizada o archivo no disponible.                                |
| 413         | Archivo o formulario que supera los límites de carga.                                                           |
| 415         | Formato HTTP incorrecto; multipart está limitado a la ruta de carga.                                            |
| 422         | Identidad del producto incompleta para iniciar la carga o guardar galería.                                      |
| 429         | Límite de intentos excedido.                                                                                    |
| 503         | Configuración pendiente, capacidad de procesamiento agotada o servicio no disponible antes de iniciar la carga. |

Una vez enviada la carga, un resultado externo incierto se representa con el registro y estado 202. Los errores de persistencia pueden responder 503; consultar la clave antes de decidir que el guardado no ocurrió. MySQL y Cloudinary no comparten una transacción y no se promete confirmación externa exactamente una vez.

## Validación y continuidad

El cierre de regresión aprobó 932 pruebas del backend: 527 unitarias, nueve HTTP, 332 de regresión MySQL, trece de conversión, 21 de borradores y 30 de fotografías con MySQL/HTTP. Se probaron cargas binarias, firma, ambos modos de carpetas, contenido externo distinto, respuestas tardías/perdidas, dos conciliadores, versiones, permisos, sesión revocada durante un bloqueo, portada y ocho posiciones, rollback de auditoría, asociación frente a limpieza y conservación histórica con checkout real en base aislada. Se comprobaron además compilación, tipos completos, lint y formato.

Las nuevas piezas se generaron con Nest CLI, incluido el decorador multipart. No se modificaron el esquema Prisma, las diez migraciones ni las fuentes de Angular. Evidencia: `.checkout-review/productos-fotografias/`, con resultados de regresión, prueba de conexión real de solo lectura y revisión de continuidad tras la interrupción.

Para utilizar la API de fotografías se requieren las variables completas del proveedor; esta ampliación no exige otras migraciones o seeds. Los formularios Angular de borradores, fotografías y publicación ya están integrados, al igual que los movimientos de stock. Las API de edición de publicados y archivo/restauración también están implementadas; su [conexión Angular](../../soho-frontend/docs/integracion-publicados-archivo.md) ya está terminada. La validación de la ampliación está en [Edición de publicados](api-edicion-publicados.md).

La implementación sigue las referencias oficiales de [firmas de autenticación](https://cloudinary.com/documentation/authentication_signatures), [Upload API](https://cloudinary.com/documentation/image_upload_api_reference), [modos de carpetas](https://cloudinary.com/documentation/folder_modes) y [Admin API](https://cloudinary.com/documentation/admin_api).
