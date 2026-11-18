# API de archivo y restauración de productos

Implementada sobre el esquema vigente de once migraciones, según el [análisis funcional](analisis-edicion-publicados-archivo.md). No añade migraciones ni cambia Prisma. Los [controles Angular de archivo/restauración](../../soho-frontend/docs/integracion-publicados-archivo.md) ya están conectados con confirmación y recuperación.

## Rutas y contrato

Todas las rutas requieren una sesión `ADMIN`, usan el límite administrativo existente y responden con `Cache-Control: no-store`. Las escrituras exigen JSON, origen permitido y CSRF. La sesión, el rol y la actividad del usuario se vuelven a comprobar dentro de la transacción después de esperar el bloqueo del producto.

| Método y ruta                                 | Operación                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `POST /api/admin/productos/:id/archivo`       | `BORRADOR` o `PUBLICADO` → `ARCHIVADO`.                                  |
| `POST /api/admin/productos/:id/restauracion`  | `ARCHIVADO` → `BORRADOR`.                                                |
| `GET /api/admin/productos/operaciones/:clave` | Consulta existente para recuperar la respuesta de una operación propia.  |
| `GET /api/admin/productos/:id`                | Consulta existente de la ficha vigente después de confirmar o recuperar. |

`:id` es el UUID del producto, independiente de `codigoInterno`, slug y SKU. No se admiten filtros en estas acciones. Ambas escrituras responden **200** y aceptan únicamente:

```json
{
  "claveSolicitud": "113e4567-e89b-42d3-a456-426614174000",
  "version": 3
}
```

`claveSolicitud` es un UUID normalizado a minúsculas. `version` es la versión comercial leída en el detalle, entera entre 1 y 4294967294. No se acepta la versión física de inventario en su lugar. Una versión en su máximo sin margen para incrementarse no permite otra transición.

Campos adicionales se rechazan, incluidos `estado`, `confirmado`, motivo, responsable, fechas, precio, stock y reservas. La confirmación del diálogo Angular se incorporará en su entrega posterior; el contrato HTTP no acepta un selector libre de estado ni necesita un booleano adicional.

La respuesta mantiene el contrato administrativo de publicación y borradores: `{ producto, operacion }`. `producto` es la ficha administrativa completa, con estado en minúsculas y versión posterior. `operacion` contiene `claveSolicitud`, `tipo` (`ARCHIVAR` o `RESTAURAR`), `versionAnterior` y `versionPosterior`.

## Transiciones y conservación

Archivar conserva los datos y retira la ficha del catálogo público, detalle, enlaces de otros colores y alias. El checkout vuelve a exigir que el producto esté publicado: un carrito desactualizado no permite crear una compra nueva después del archivo. Una compra que confirmó primero conserva su pedido y sus condiciones.

Restaurar siempre deja el producto como **borrador**, incluso si antes estuvo publicado. No lo devuelve automáticamente a la tienda. Para venderlo de nuevo se utiliza la [publicación existente](api-publicacion-productos.md), con su versión y requisitos completos.

Se puede archivar o restaurar una ficha incompleta, con precio pendiente, sin galería, con categoría inactiva, con stock o con pedidos en curso. Estas acciones no validan que el producto pueda publicarse ni exigen otra conversión del catálogo. La API de borradores continúa rechazando productos publicados y archivados.

Solo se escriben `Producto.estado`, `version`, `actualizadoPorId` y la fecha de actualización administrada por Prisma. Se conservan UUID, código interno, slug, grupo/modelo, color, SKU, tallas, habilitación, fotografías, recursos Cloudinary, stock físico, versión física, contadores de reservas y datos históricos de pedidos. No se crean movimientos de inventario por estas transiciones.

Pagos, comprobantes, reservas activas, sus políticas y vencimientos y los envíos mantienen sus reglas. Archivar no cancela, reembolsa, libera ni consume reservas. Un pedido existente puede aprobarse, prepararse, despacharse y entregarse con el producto archivado. El despacho sigue siendo el que descuenta físico y registra sus movimientos.

No se consulta Cloudinary ni se modifica un recurso externo. No se necesitan credenciales de ese proveedor para archivar o restaurar. La galería conserva sus referencias y la protección de archivos utilizados por pedidos.

## Versiones, auditoría y recuperación

Cada acción bloquea la fila del producto y relee su situación. Una acción nueva solo puede confirmar con el estado admitido y la misma versión observada. Aumenta la versión comercial **una vez** y registra, en la misma transacción, una `OperacionProducto` con responsable, fecha, tipo, clave, hash, versiones, copias antes/después y respuesta histórica. Un error de auditoría revierte también el cambio del producto.

Se reutilizan los servicios de bloqueo, autorización y transacciones existentes. El validador de publicación se reorganizó como `DatosEstadoProducto`, compartido por las tres transiciones; la publicación conserva su comportamiento. Controlador, servicio y clase compartida se generaron con el Nest CLI local y se adaptaron a ESM `.js`.

El hash incluye tipo, producto y datos normalizados. Repetir la misma clave, cuerpo, producto y administrador devuelve la respuesta guardada, sin otro incremento o auditoría. La recuperación se comprueba antes de exigir el estado de una acción nueva: funciona aunque otro administrador haya restaurado o archivado nuevamente el producto después.

Una clave ajena o correspondiente a otro cuerpo, tipo o producto no se puede reutilizar. La unicidad global protege carreras incluso entre fichas distintas: la transacción perdedora se revierte. El GET por clave solo permite recuperar operaciones del mismo administrador y devuelve 404 para una clave desconocida o de otra cuenta.

Una respuesta histórica acredita lo que se confirmó; consultar luego el detalle vigente antes de continuar. Si se pierde la respuesta después de COMMIT, conservar la clave y solicitud originales. Un 404 al consultar una solicitud posiblemente en curso no demuestra que haya fallado. No reenviar con otra clave para resolver un timeout o 503.

Las transacciones conservan los reintentos acotados para conflictos y deadlocks del componente existente. Si dos administradores confirman con la misma versión, solo una acción nueva puede modificarla; la otra debe consultar otra vez. Reservas y movimientos de físico no cambian por sí solos la versión comercial ni se sobrescriben con estas acciones.

## Errores

| Estado                             | Motivo                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| 400                                | UUID, versión, consulta o campos del cuerpo inválidos.                         |
| 401 / 403                          | Sesión, rol, CSRF u origen sin autorización.                                   |
| 404                                | Producto inexistente; en recuperación, clave inexistente o de otra cuenta.     |
| 409 `PRODUCTO_CAMBIADO`            | Versión comercial obsoleta para una transición nueva.                          |
| 409 `ESTADO_PRODUCTO_INCOMPATIBLE` | Acción nueva sobre un estado que ya no admite la transición.                   |
| 409 `CLAVE_PRODUCTO_EN_USO`        | Clave incompatible o colisión global durante la escritura.                     |
| 415                                | Contenido no admitido; las escrituras requieren JSON.                          |
| 429                                | Límite administrativo existente.                                               |
| 503                                | Operación no completada o respuesta incierta; consultar por la clave original. |

Archivar de nuevo o restaurar de nuevo con **otra clave** no simula éxito ni crea un registro adicional. La repetición con la clave confirmada conserva su respuesta histórica.

## Validación y continuidad

Pasaron **1210 pruebas del backend**: 673 unitarias —31 adicionales—, nueve HTTP generales, 350 de regresión MySQL, trece de conversión, 21 de borradores, 30 de fotografías, 26 de publicación, 46 de movimientos y 42 nuevas de archivo/restauración con HTTP y MySQL. También pasaron compilación NestJS, TypeScript completo, lint sin avisos y formato. La suite nueva tiene su configuración y base exclusivas y se excluye del ejecutor general de regresión.

Las pruebas nuevas con HTTP y MySQL temporal cubren acceso, contratos, ficha incompleta, categoría inactiva, estados, versión máxima, auditoría, conservación exacta de 25 tablas de dominio con pagos pendientes y aprobados, reintentos simultáneos, colisión de claves entre productos, COMMIT sin respuesta, rollback y revocación durante el bloqueo. Incluyen carreras frente a edición de borrador, publicación, galería y checkout, y aprobación/preparación/despacho/entrega de un pedido con la ficha archivada.

`npm.cmd run test:archivo` requiere `TEST_ARCHIVO_DATABASE_URL` explícita, local, vacía, migrada y terminada en `_test`; no usa la conexión de trabajo como alternativa. El entorno reproducible de `.checkout-review/productos-archivo-api/`, desde la raíz SOHO, crea una instancia MySQL temporal, aplica allí las once migraciones, ejecuta las pruebas y retira servidor y datos.

El esquema, las once migraciones, el cliente generado y las fuentes Angular conservaron sus hashes. No se escribió en `soho_db` ni se consultaron o modificaron proveedores externos reales. La evidencia de cierre y el desglose están en `.checkout-review/productos-archivo-api/validacion.json`.

Los botones Angular ya están conectados, al igual que la [edición comercial y fotografías de publicados](api-edicion-publicados.md). La [guía Angular](../../soho-frontend/docs/integracion-publicados-archivo.md) describe confirmaciones, versiones, recuperación y actualización de consultas. No hace falta ejecutar otra migración ni regenerar el cliente Prisma por estas entregas.
