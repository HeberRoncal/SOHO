# Edición comercial y fotografías de publicados

La edición comercial original se implementó sobre las once migraciones vigentes. La selección manual de «Los más buscados» amplía después su contrato con `esDestacado` y la migración `20261119020000_productos_destacados`. Esta ruta aplica la segunda fase del [análisis de publicados y archivo](analisis-edicion-publicados-archivo.md); la API de borradores conserva su alcance. La [integración Angular](../../soho-frontend/docs/integracion-publicados-archivo.md) de estas acciones ya está implementada.

## Edición comercial

`PATCH /api/admin/productos/:id/publicado` requiere UUID de producto, sesión ADMIN, JSON, origen permitido y CSRF. No admite filtros y responde 200 con `Cache-Control: no-store`. La sesión y el rol se comprueban de nuevo dentro de la transacción después de los bloqueos.

Ejemplo:

```json
{
  "claveSolicitud": "113e4567-e89b-42d3-a456-426614174000",
  "version": 3,
  "nombre": "Nike Air Force 1 '07 Blanco",
  "precio": "349.90",
  "precioAnterior": null,
  "esNovedad": false,
  "esDestacado": true
}
```

La clave es un UUID normalizado a minúsculas y la versión comercial es un entero entre 1 y 4294967294, con margen para incrementarse. Se exige al menos un campo comercial. Omitir un campo conserva su valor. `esDestacado` permite administrar manualmente la aparición en «Los más buscados»; el cambio se versiona y audita igual que los demás campos comerciales.

| Campo                         | Regla                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `nombre`                      | Texto no vacío de hasta 180 caracteres. No requiere unicidad; el slug permanece estable. |
| `descripcion`                 | Hasta 600 caracteres; admite cadena vacía.                                               |
| `categoriaId`                 | UUID de categoría existente y activa para conservar la publicación.                      |
| `genero`                      | `HOMBRE`, `MUJER` o `UNISEX`.                                                            |
| `precio`                      | Cadena decimal positiva, hasta `999999.99` y dos decimales; se normaliza a dos.          |
| `precioAnterior`              | Cadena decimal mayor que el precio resultante, o `null` para retirarla.                  |
| `esNovedad`                   | Booleano.                                                                                |
| `esDestacado`                 | Booleano; controla «Los más buscados».                                                  |
| `ordenCatalogo`, `ordenColor` | Enteros entre 0 y 4294967295. Cero es válido.                                            |

Se reutilizan los validadores de textos, UUID, género, importes y orden de borradores después de limitar estrictamente los campos de la ruta. Los textos conservan normalización NFC y rechazo de controles. `null` en precio o categoría no permite guardar un publicado incompleto: el resultado se rechaza con 422 y se conserva íntegra la ficha anterior.

No se admiten cambios de UUID, código interno, slug, grupo, marca, modelo, color, SKU, tallas, variantes, habilitación, stock, reservas, responsable o fechas. Tampoco URLs o fotografías en este cuerpo: se utiliza la galería existente. Las nuevas tallas y los cambios de identidad de publicados conservan su alcance separado.

## Validación del resultado publicado

El producto debe estar `PUBLICADO`, con la versión observada. La ruta no cambia su estado ni lo convierte temporalmente en borrador. Primero se construye y valida el resultado completo; solo se escribe si cumple `RequisitosPublicacion`:

- Identidad de marca/modelo/color, puente compatible y SKU/tallas coherentes, sin regenerar identidades antiguas.
- Marca y categoría activas, nombre e importes válidos.
- Al menos una variante habilitada; se admite stock cero.
- Galería de entre una y ocho imágenes disponibles, con portada y orden coherentes.

Un problema previo de identidad, marca, variantes o imágenes devuelve incidencias concretas y no se repara silenciosamente. La categoría puede corregirse eligiendo otra activa en la misma solicitud. La [API de archivo/restauración](api-archivo-productos.md) sigue permitiendo retirar una ficha que no cumple requisitos de publicación.

La escritura modifica únicamente los campos comerciales permitidos, aumenta `Producto.version` una vez y actualiza el responsable y la fecha. `Variante.versionExistencias`, el físico y el reservado permanecen independientes.

## Fotografías de borradores y publicados

Se amplían las rutas de [fotografías](api-fotografias-productos.md) existentes:

| Ruta                                         | Comportamiento                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/productos/:id/fotografias`  | Inicia cargas en `BORRADOR` o `PUBLICADO` con versión vigente. Conserva multipart, CSRF, validación binaria y límite de 5 MB. |
| `PATCH /api/admin/productos/:id/galeria`     | Guarda selección, portada, orden y textos alternativos en borradores o publicados.                                            |
| `GET /api/admin/productos/:id/cargas/:clave` | Recupera una carga propia aunque el producto haya cambiado de estado.                                                         |
| `GET /api/admin/productos/:id/fotografias`   | Consulta galería y archivos del producto con ADMIN.                                                                           |

`ARCHIVADO` no admite cargas nuevas ni cambios nuevos de galería. Consultar y recuperar solicitudes anteriores sigue permitido. Publicar sigue exigiendo exclusivamente borrador; no se amplió su comprobación de estado.

Subir crea un recurso nuevo con su identidad y clave de carga; no sustituye ni sobrescribe fotos. No cambia la galería pública ni aumenta la versión comercial. Si es necesario, reserva la carpeta estable ya acordada. Después se guarda la selección de archivos mediante PATCH de galería, con versión y clave de solicitud independientes de la carga.

Una galería publicada debe terminar con **1 a 8** fotografías disponibles del mismo producto, sin repetidas y con orden consecutivo; la posición cero es la portada. El texto alternativo mantiene su máximo de 160 caracteres. Una lista vacía en un publicado se rechaza con 422 y revierte asociaciones y marcas de limpieza; una lista con más de ocho o repetidas se rechaza en el contrato. El borrador conserva la posibilidad de guardar cero imágenes.

La galería de un publicado revalida también el resto de requisitos de publicación dentro de la transacción. No acepta dejar la ficha publicada con marca/categoría inactivas, identidad incoherente o sin variantes habilitadas. Los rechazos conservan la galería y versión anteriores.

Se conserva `SOHO/productos/<modelo>/<codigo-interno-color>`, la carpeta reservada y el identificador único del archivo. Cambiar nombre, precio, portada u orden no renombra ni mueve recursos. Las tallas del mismo producto continúan compartiendo su galería por modelo/color.

Una carga iniciada puede terminar y confirmarse después de archivar el producto. Esa confirmación no asocia la imagen ni restaura/publica la ficha. El reintento con la misma clave y contenido recupera el archivo original; para una nueva asociación se necesita un estado permitido y la versión vigente. La llamada al proveedor ocurre fuera de la transacción SQL.

## Pedidos y protección histórica

La edición y la galería no actualizan artículos, importes, comprobantes, pagos, reservas o estados de pedidos. `PedidoArticulo` conserva el nombre, SKU, color, talla, precio e imagen comprados y su referencia de archivo. Los cambios se aplican a consultas y compras posteriores.

Retirar una foto de la galería conserva los archivos utilizados por pedidos. Se reutiliza la limpieza diferida, que bloquea producto y archivo y comprueba referencias antes de borrar. No se eliminan imágenes de proveedor `LEGADO`. La portada actual puede cambiar sin sustituir la imagen histórica del pedido.

Checkout vuelve a comparar el precio esperado. Una compra concurrente recibe las condiciones anteriores si confirmó primero; si ya cambió el precio, responde `PRECIO_CAMBIADO` y requiere actualizar. En una carrera con portada, el artículo recibe una URL y una referencia de archivo coherentes. No se copian cantidades del formulario comercial sobre las variantes.

## Bloqueos, auditoría y recuperación

Controlador, servicio, clase de contrato y clase de bloqueo compartido se generaron con el Nest CLI local y se adaptaron a ESM `.js`. `DatosPublicado` reutiliza la validación existente. `BloqueoProductoPublicable` reorganiza los bloqueos que ya utilizaba publicación para compartirlos con edición y galería: producto bloqueado por el llamador, grupo/marca, categorías implicadas, puente, variantes/tallas, asociaciones y archivos ordenados.

Las relaciones se releen después de bloquearlas. Al cambiar categoría se bloquean tanto la anterior como la nueva, cuando existen. En galería se bloquea la unión de archivos actuales y propuestos, pertenecientes a esa ficha. Se conservan la autorización transaccional, el aislamiento y los reintentos acotados del componente existente. No se introducen llamadas externas dentro de estas transacciones.

Cada guardado comercial registra una `OperacionProducto` de tipo `ACTUALIZAR`, con responsable, fecha, clave, hash, versiones, copias antes/después y respuesta. El hash incluye el contexto **publicado**: una operación `ACTUALIZAR` de borrador no se reutiliza mediante esta ruta. La galería conserva `ACTUALIZAR_GALERIA` y su recuperación existente. El cambio y su auditoría se confirman juntos; si falla el registro, se revierte la operación.

La respuesta comercial es `{ producto, operacion }`, con la ficha administrativa completa y `operacion: { claveSolicitud, tipo, versionAnterior, versionPosterior }`. La galería conserva además sus datos ordenados. Los mismos ADMIN, clave, producto, contexto y cuerpo normalizado recuperan la respuesta original sin otro incremento, incluso si después se archivó o restauró la ficha.

Se utiliza el `GET /api/admin/productos/operaciones/:clave` existente, exclusivo del administrador responsable. Una clave de otro cuerpo, contexto, producto o cuenta devuelve conflicto al escribir, y una recuperación ajena devuelve 404. La unicidad global protege también carreras entre productos distintos.

Tras COMMIT sin respuesta, conservar y consultar la solicitud original; no reenviar con otra clave. Un 404 de una solicitud posiblemente en curso no acredita que haya fallado. La respuesta recuperada es histórica: consultar luego el detalle vigente. Si solo falla la actualización de consultas posterior al éxito, reintentar lecturas.

## Errores y validación

Pasaron **1314 pruebas del backend**: 723 unitarias —50 nuevas—, nueve HTTP generales, 350 de regresión MySQL, trece de conversión, 21 de borradores, 30 de fotografías, 26 de publicación, 46 de movimientos, 42 de archivo/restauración y 54 nuevas de publicados con HTTP/MySQL. También pasaron compilación NestJS, TypeScript completo, lint sin avisos y formato. Prisma, sus once migraciones, el cliente generado y las fuentes Angular permanecen intactos. El entorno MySQL temporal se detuvo y retiró; el cierre está en `.checkout-review/productos-publicados-api/validacion.json`.

| Estado                             | Motivo                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 400                                | Contrato, UUID, versión, consulta o campos no admitidos; galería repetida o excesiva.           |
| 401 / 403                          | Sesión, rol, origen o CSRF sin autorización.                                                    |
| 404                                | Producto o archivo inexistente/ajeno; recuperación de otra cuenta.                              |
| 409 `PRODUCTO_CAMBIADO`            | Versión comercial obsoleta en la edición.                                                       |
| 409 `ESTADO_PRODUCTO_INCOMPATIBLE` | La ruta comercial no recibe un publicado.                                                       |
| 409 `CLAVE_PRODUCTO_EN_USO`        | Clave incompatible o colisión global de la edición comercial.                                   |
| 409                                | Estados, versiones, archivos o claves incompatibles del flujo existente de fotografías.         |
| 422 `PRODUCTO_NO_PUBLICABLE`       | Resultado comercial o galería publicada que incumple requisitos; incluye incidencias por campo. |
| 413 / 415                          | Tamaño o contenido no admitidos en las rutas correspondientes.                                  |
| 429 / 503                          | Límite o indisponibilidad; conservar las claves ante resultados inciertos.                      |

Las pruebas utilizan MySQL temporal con once migraciones y Cloudinary simulado. Cubren contratos, campos protegidos, resultado inválido, auditoría/rollback, recuperación tras COMMIT, revocación, carreras entre administradores/productos, precio/portada frente a checkout, finalización de carga tras archivo, galería frente a limpieza y conservación de 23 conjuntos de datos con pagos pendientes y aprobados.

`npm.cmd run test:publicados` requiere `TEST_PUBLICADOS_DATABASE_URL` local, explícita, migrada, vacía y terminada en `_test`; nunca toma la conexión de trabajo como alternativa. El entorno reproducible se conserva en `.checkout-review/productos-publicados-api/`, desde la raíz SOHO. No se escribieron datos en `soho_db` ni se realizaron subidas o borrados en Cloudinary real.

Angular conecta esta edición, fotografías y las API de archivo/restauración, manteniendo capacidades y recuperación específicas. Consultar su [guía de integración](../../soho-frontend/docs/integracion-publicados-archivo.md). El cliente Prisma se regenera desde `schema.prisma`; aplicar primero la migración indicada en la guía de integración de destacados.
