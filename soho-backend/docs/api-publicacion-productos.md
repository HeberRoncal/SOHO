# Publicación administrativa de productos

Fecha: 15 de noviembre de 2026.

Esta entrega añade la publicación real de un borrador mediante el backend. Reutiliza las diez migraciones, `Producto.version`, `OperacionProducto` y los servicios de autorización y fotografías existentes. No requiere otra migración, seeds o volver a convertir el catálogo.

## Ruta y solicitud

`POST /api/admin/productos/:id/publicacion`, identificado por UUID de producto, responde 200 y `Cache-Control: no-store`.

```json
{
  "claveSolicitud": "113e4567-e89b-42d3-a456-426614174000",
  "version": 2
}
```

La clave UUID es nueva para cada operación lógica y se conserva al reintentar. La versión es la consultada en el detalle administrativo después de guardar los datos o la galería. Se exige un entero desde 1 hasta 4294967294 para poder incrementar la versión. La ruta solo admite esos dos campos: no recibe precios, SKU, estado, inventario, fotografías ni responsable. Rechaza consultas adicionales y requiere JSON.

El cliente necesita sesión ADMIN, origen autorizado y cabecera `X-CSRF-Token`. Los guards conservan las reglas generales de autenticación, rol y CSRF. La autorización se revalida dentro de la transacción después de esperar el bloqueo del producto y de nuevo después de bloquear sus dependencias. El responsable se obtiene de la sesión del servidor.

## Requisitos

Se comprueban sobre datos actuales y bloqueados:

| Requisito           | Comprobación                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado y versión    | El producto está en `BORRADOR`, su versión coincide y la conversión del catálogo está confirmada.                                                              |
| Identidad           | Nombre, grupo de modelo, marca, código y etiqueta de modelo, código/nombre/hexadecimal del color completos.                                                    |
| Marca y categoría   | Existen y están activas.                                                                                                                                       |
| Datos de transición | Las copias de marca/modelo del producto coinciden con su grupo; existe un solo puente `ProductoColor` coherente.                                               |
| Precios             | Precio positivo hasta `999999.99`; precio anterior nulo o mayor que el actual.                                                                                 |
| Variantes           | Existe al menos una habilitada. Se conserva la relación directa de producto y el puente de color de todas las variantes.                                       |
| SKU y talla         | Cada SKU coincide con los códigos de marca/modelo/color y la talla EU válida: `40.5` corresponde a `40P5`. Se comprueban también las variantes deshabilitadas. |
| Galería             | De una a ocho asociaciones, archivos distintos y posiciones consecutivas desde cero; la posición cero es la portada.                                           |
| Fotografías         | Todas las asociadas pertenecen al producto, están `DISPONIBLE` y conservan la URL del archivo. Admite proveedor `LEGADO` o Cloudinary.                         |

Un archivo subido pero todavía no asociado no completa la galería. Las cargas pendientes o en conciliación no se usan para publicar. Las fotografías disponibles ya fueron confirmadas por su flujo de carga o conservadas como heredadas: publicar utiliza ese estado persistido y no realiza llamadas a Cloudinary ni comprueba en línea la entrega de cada foto.

La publicación admite stock cero y un faltante preexistente. Un producto agotado puede mostrarse en el catálogo; el checkout sigue comprobando disponibilidad y precio antes de reservar. La publicación no agrega inventario ni corrige reservas para hacer pasar una validación. Los códigos internos, slugs, UUID, SKU, tallas, existencias, habilitación y referencias históricas permanecen estables.

Ante un producto incompleto, responde 422 con un objeto como:

```json
{
  "codigo": "PRODUCTO_NO_PUBLICABLE",
  "message": "Completa o corrige los requisitos del producto antes de publicarlo.",
  "incidencias": [
    { "codigo": "GALERIA_INCOMPLETA", "campo": "imagenes" },
    { "codigo": "VARIANTE_HABILITADA_REQUERIDA", "campo": "variantes" }
  ]
}
```

Otros códigos de incidencia son `IDENTIDAD_INCOMPLETA`, `MARCA_NO_ACTIVA`, `CATEGORIA_NO_ACTIVA`, `DATOS_MODELO_INCOHERENTES`, `PRECIO_INVALIDO`, `RELACIONES_COLOR_INCOHERENTES`, `SKU_O_TALLA_INCOHERENTES` y `FOTOGRAFIA_NO_DISPONIBLE`. Estos errores permiten corregir el borrador antes de intentar una nueva publicación; no regeneran identidades automáticamente.

## Transacción, auditoría y respuesta

La publicación utiliza la misma fila de producto que bloquean las escrituras de borradores, galería y mantenimiento. Después bloquea grupo, marca, categoría, puente de color, variantes/tallas, asociaciones y archivos. Las lecturas de validación se realizan después de esos bloqueos, con aislamiento `ReadCommitted` y los reintentos acotados por conflicto de transacción del servicio compartido.

Las pruebas de publicación frente a checkout identificaron una forma adicional del error: el adaptador MariaDB 7.10.1 encapsula algunos deadlocks de SQL directo como `P2010`, con causa `TransactionWriteConflict` y código original `1213`. `ConflictoTransaccion`, generado con Nest CLI, reconoce esa combinación exacta además de `P2034`. Lo reutilizan las transacciones administrativas y la creación de pedidos; ambos conservan un máximo de tres intentos de la transacción completa. Un timeout, un `P2010` genérico o una respuesta incierta no se trata como prueba de rollback. El comprobante privado del pedido se prepara y guarda una vez fuera de esos reintentos y conserva su conciliación por clave. Consultar la [referencia de errores de Prisma](https://www.prisma.io/docs/orm/v7/reference/error-reference).

Cuando los requisitos y la autorización siguen vigentes, cambia únicamente estado a `PUBLICADO`, versión, fecha de actualización y último responsable. Registra en la misma transacción una operación `PUBLICAR`, con hash de solicitud, responsable, versiones, copias anterior/posterior y respuesta. Si falla la auditoría final, se revierte la publicación completa. No se escriben movimientos, reservas, pagos o snapshots de pedidos.

La respuesta incluye `producto` con el contrato administrativo existente y:

```json
{
  "operacion": {
    "claveSolicitud": "113e4567-e89b-42d3-a456-426614174000",
    "tipo": "PUBLICAR",
    "versionAnterior": 2,
    "versionPosterior": 3
  }
}
```

El catálogo público y las consultas por SKU pueden mostrar el producto después del COMMIT, con las mismas reglas actuales de marca/categoría y archivos disponibles. Los filtros que exigen disponibilidad siguen excluyendo tallas sin unidades disponibles. El producto no se vuelve comprable por el hecho de publicarlo si carece de stock.

## Reintentos y concurrencia

Repetir el mismo UUID de producto, clave, versión original y administrador recupera la respuesta confirmada. La comprobación de una operación previa ocurre antes de exigir que el producto siga en borrador o conserve la versión anterior. Por eso una respuesta perdida se puede recuperar aunque el producto ya esté publicado o tenga un estado posterior, sin volver a publicar ni incrementar la versión.

También se puede consultar `GET /api/admin/productos/operaciones/:clave`, ruta existente que devuelve únicamente operaciones del mismo responsable. Después de recuperar una respuesta histórica se debe consultar el detalle vigente antes de actualizar una interfaz o decidir otra acción.

La misma clave con otro contenido, producto, administrador o tipo de operación responde 409. Esto incluye claves utilizadas antes para crear el borrador o guardar su galería. Dos publicaciones simultáneas con la misma clave producen un solo guardado y la misma respuesta; dos administradores con claves diferentes y la misma versión producen una publicación y un conflicto. Un nuevo intento sobre un producto ya publicado con otra clave responde 409.

La edición del borrador, retirada de fotos y publicación comparten el bloqueo y versión del producto. Si la edición gana, la publicación debe volver a consultar; si la publicación gana, las rutas actuales de edición/galería de borradores rechazan la escritura posterior. Una fotografía en limpieza no puede cumplir los requisitos de publicación. La limpieza tampoco puede reclamar una foto que permanezca asociada o utilizada por un pedido.

Checkout conserva sus bloqueos y vuelve a consultar estado, precio, disponibilidad e imagen antes de crear el pedido. Una compra concurrente puede ver todavía el borrador y responder artículo no disponible, o ver el producto publicado y confirmar si tiene stock. El cliente puede consultar de nuevo y reintentar con sus mecanismos existentes. La aprobación y el despacho conservan sus reglas e historial.

## Errores y alcance

| Estado    | Situación                                                                                 |
| --------- | ----------------------------------------------------------------------------------------- |
| 400       | UUID/cuerpo/versión inválidos, campos o consultas adicionales.                            |
| 401 / 403 | Sesión ausente o revocada, rol insuficiente, origen o CSRF inválidos.                     |
| 404       | Producto no encontrado o recuperación de una operación ajena/inexistente.                 |
| 409       | Versión obsoleta, estado distinto de borrador, clave ya utilizada o conversión pendiente. |
| 422       | Requisitos incompletos o datos relacionados incoherentes.                                 |
| 429       | Límite administrativo de acceso excedido.                                                 |
| 503       | Persistencia no disponible; consultar la clave antes de asumir que no hubo COMMIT.        |

Esta ruta solo realiza `BORRADOR → PUBLICADO`. Despublicar, archivar, restaurar y editar productos publicados requieren flujos posteriores. No elimina imágenes ni recursos, no migra fotografías heredadas y no modifica distritos o tarifas.

## Validación y continuidad

El cierre aprobó 997 pruebas del backend: 566 unitarias, nueve HTTP, 332 de regresión MySQL, trece de conversión, 21 de borradores, 30 de fotografías y 26 de publicación con MySQL/HTTP. Compilación, tipos completos, lint sin avisos y formato también pasaron.

Las pruebas usan MySQL temporal y datos sintéticos; las cargas Cloudinary necesarias para los escenarios usan el proveedor HTTP simulado ya existente. Incluyen stock cero, conservación de variantes con déficit/deshabilitadas, fotos heredadas y Cloudinary confirmadas, requisitos incompletos, claves reutilizadas, versiones, respuestas perdidas, rollback de auditoría, sesión revocada durante bloqueo y carreras con edición, retirada de galería, marca, limpieza y checkout. También comprueban aprobación/preparación/despacho de una compra de un producto publicado por esta API.

Las piezas nuevas de `productos/publicacion/` se generaron con Nest CLI. El esquema, las diez migraciones y las fuentes de Angular permanecen intactos. Evidencia local en `.checkout-review/productos-publicacion/`.

Para usar el código, reiniciar el backend; no ejecutar seeds ni migraciones adicionales. Los formularios Angular conservan su capacidad de escritura desactivada hasta integrar la creación, edición, fotografías y publicación con la API. Esa integración visual es la siguiente entrega.
