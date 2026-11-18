# Creación y edición administrativa de borradores

Fecha: 15 de noviembre de 2026.

Esta entrega permite guardar productos reales como borradores mediante API REST. Utiliza las diez migraciones existentes y no requiere otra migración ni un seed. La conversión del catálogo local se comprobó mediante consultas de solo lectura: diez migraciones con checksum correcto, 11 grupos, 14 productos, 168 variantes, identidades y galerías coherentes y contador en 14. No se crearon productos de prueba en `soho_db`.

## Alcance y permisos

Las rutas requieren sesión ADMIN, CSRF en escrituras y `Cache-Control: no-store`. La sesión, su vigencia, actividad, usuario activo y rol se comprueban de nuevo dentro de la transacción, después de esperar los bloqueos. El responsable procede de la sesión del servidor.

| Método y ruta                                 | Operación                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /api/admin/productos`                   | Crea un producto en `BORRADOR`; responde 201.                                                  |
| `PATCH /api/admin/productos/:id/borrador`     | Edita exclusivamente un borrador mediante su UUID y versión; responde 200.                     |
| `GET /api/admin/productos/operaciones/:clave` | Recupera la respuesta confirmada de una solicitud del mismo administrador; responde 200 o 404. |
| `GET /api/admin/productos/:id`                | Consulta existente; incorpora versión, grupo y orden de color.                                 |
| `GET /api/admin/productos/opciones`           | Consulta existente; incorpora códigos de marca, grupos con versión y tallas EU.                |

El límite JSON general de 16 KiB también se aplica a estas escrituras. Se rechazan campos desconocidos, parámetros de consulta adicionales e identificadores inválidos. Los errores de persistencia no exponen SQL ni credenciales.

La creación, edición y consulta utilizan los componentes generados con Nest CLI en `productos/borradores/`. `EscrituraAutorizadaService`, también generado con CLI, centraliza la autorización transaccional y los reintentos por conflicto de transacción. `EscrituraPedidoService` reutiliza esa implementación conservando su contrato anterior para pedidos, pagos, reservas y envíos.

## Alta mínima y alta con identidad

El primer guardado necesita únicamente nombre y clave de solicitud UUID:

```json
{
  "claveSolicitud": "113e4567-e89b-42d3-a456-426614174000",
  "nombre": "Zapatilla pendiente de completar"
}
```

El servidor asigna UUID, código interno, slug, estado `BORRADOR` y versión 1. Precio, categoría, grupo y color pendientes se conservan como `null`; no se inventan precios o variantes. Un borrador con grupo y sin color devuelve `colores: []`. Las rutas públicas no lo ofrecen para comprar.

Ejemplo completo para un modelo nuevo; sustituir los UUID por los de las opciones de la base:

```json
{
  "claveSolicitud": "223e4567-e89b-42d3-a456-426614174000",
  "nombre": "Nike Modelo Nuevo Blanco",
  "descripcion": "Descripción comercial",
  "grupoModelo": {
    "marcaId": "333e4567-e89b-42d3-a456-426614174000",
    "codigoModelo": "MODELO1",
    "modelo": "Modelo Nuevo"
  },
  "color": {
    "codigo": "BL",
    "nombre": "Blanco",
    "hexadecimal": "#FFFFFF"
  },
  "categoriaId": "443e4567-e89b-42d3-a456-426614174000",
  "genero": "UNISEX",
  "precio": "100.00",
  "precioAnterior": null,
  "esNovedad": false,
  "ordenCatalogo": 0,
  "ordenColor": 0,
  "tallas": ["40", "40.5", "41"]
}
```

Para incorporar otro color de un modelo ya guardado, enviar la referencia del grupo en lugar de volver a declararlo:

```json
{
  "id": "553e4567-e89b-42d3-a456-426614174000",
  "version": 1
}
```

Ese objeto corresponde al campo `grupoModelo`. No se admite mezclar la referencia con una definición nueva. Crear una definición cuyo `(marcaId, codigoModelo)` ya existe responde 409; se debe consultar y seleccionar el grupo existente. La versión del grupo también debe seguir vigente.

El nombre del grupo no se modifica desde la ficha de uno de sus colores. Para un grupo nuevo, `slugCarpeta` es opcional: se calcula desde marca y modelo o se puede enviar un slug válido de hasta 160 caracteres para resolver una colisión. Se reserva su identidad en MySQL sin crear carpetas ni activos externos. `carpetaImagenes` se fija al iniciar la primera carga mediante la [API de fotografías](api-fotografias-productos.md).

## Campos y edición

| Campo                         | Regla                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `claveSolicitud`              | UUID nuevo para cada operación lógica; conservarlo al reintentar.                               |
| `version`                     | Obligatoria al editar. Versión entera consultada; no se admite en el alta.                      |
| `nombre`                      | Obligatorio en alta; de 1 a 180 caracteres.                                                     |
| `descripcion`                 | Hasta 600 caracteres; vacía por defecto.                                                        |
| `grupoModelo`                 | Referencia con versión, definición nueva o `null`.                                              |
| `color`                       | Código de dos letras, nombre hasta 50 caracteres y hexadecimal `#RRGGBB`, o `null`.             |
| `categoriaId`                 | UUID de categoría existente o `null`.                                                           |
| `genero`                      | `HOMBRE`, `MUJER` o `UNISEX`; `UNISEX` por defecto.                                             |
| `precio`, `precioAnterior`    | Cadenas decimales o `null`. Precio positivo hasta `999999.99`; anterior debe superar el actual. |
| `esNovedad`                   | Booleano; falso por defecto.                                                                    |
| `ordenCatalogo`, `ordenColor` | Enteros no negativos dentro del rango UNSIGNED INT.                                             |
| `tallas`                      | Hasta 27 medidas EU de 35 a 48, en pasos de media talla, sin duplicados.                        |

Al editar, omitir un campo conserva su valor; `null` limpia únicamente un campo que admite pendientes. Ejemplo:

```json
{
  "claveSolicitud": "663e4567-e89b-42d3-a456-426614174000",
  "version": 1,
  "nombre": "Nombre corregido",
  "precio": "120.00",
  "tallas": ["41.5"]
}
```

`tallas` añade medidas que todavía no existen. Omitir una talla anterior no la elimina ni deshabilita; repetir una existente conserva UUID, SKU, stock, reservas y habilitación. Si falta en el catálogo EU, se crea su medida válida con la unicidad correspondiente. Las variantes nuevas empiezan habilitadas y con existencias y reservas en cero, sin generar movimientos ficticios.

Los campos `codigoInterno`, `sku`, `slug`, `estado`, stock, reservas, responsables y fotografías no se pueden enviar. Este endpoint no publica, archiva, restaura, mueve inventario ni modifica galerías. Los productos publicados o archivados responden 409 al intentar editarlos mediante esta ruta.

## Identidad, concurrencia e historial

El alta bloquea `SecuenciaCodigoProducto.id = 1` y confirma el incremento junto con el producto, sus variantes y la auditoría. No calcula `MAX + 1`. Después de `SHO-9999` continúa `SHO-10000`; los códigos confirmados y los slugs permanecen estables al corregir nombres.

Los SKU nuevos se generan como `[MARCA]-[MODELO]-[COLOR]-[TALLA]`: `40` y `40.0` producen `40`; `40.5` produce `40P5`. Los códigos se normalizan a mayúsculas, sin guiones internos. Las variantes existentes no se regeneran. Se requieren grupo completo y color antes de añadir tallas.

Cuando ya existen variantes o archivos, el grupo y el código de color quedan protegidos frente a cambios de identidad. Se pueden corregir las etiquetas visibles y el hexadecimal conservando el código; el puente temporal `ProductoColor` se actualiza de forma coherente. Antes de editar se comprueba que los vínculos directos y anteriores de variantes coincidan. No se trasladan variantes entre productos.

Cada edición exige la versión actual e incrementa una vez la versión del producto. Dos administradores que guardan la misma versión producen un guardado y un conflicto. La selección de grupo, marca y categoría se realiza bajo bloqueo; la autorización se comprueba antes de confirmar las escrituras del producto.

`OperacionProducto` guarda responsable, hash de solicitud, tipo, versiones, copias anterior/posterior y respuesta. Si falla el paso final, toda la transacción se revierte, incluido el código y cualquier grupo o talla creados. Los pedidos, movimientos, reservas, pagos, distritos y políticas existentes no se reescriben.

## Reintentos y respuesta perdida

La respuesta contiene `producto` y `operacion`, con `claveSolicitud`, tipo y versiones. Repetir la misma solicitud normalizada y clave recupera la respuesta del primer COMMIT. No consume otro código ni vuelve a aplicar cambios aunque el producto ya tenga una edición posterior. El resultado recuperado refleja ese guardado histórico: consultar después el detalle para obtener el estado actual.

La misma clave con otro contenido, otra ruta de producto o un administrador distinto responde 409. La consulta por clave solo devuelve resultados del administrador que guardó la operación; para otros devuelve 404. Si se pierde la conexión después del COMMIT, consultar la operación o repetir la solicitud original. Un 404 durante una solicitud todavía en curso no demuestra que finalmente vaya a fallar.

409 también señala versión obsoleta, identidad protegida, grupo/color/carpeta duplicados o conversión pendiente. Un grupo, marca o categoría inexistente, o tallas sin identidad completa, responde 422. Una sesión revocada durante la espera impide confirmar el guardado.

## Validación y continuidad

El cierre aprobó 871 pruebas del backend: 496 unitarias, nueve HTTP, 332 de regresión MySQL, trece de conversión y 21 de borradores. Las pruebas usan MySQL temporal y datos sintéticos, sin escribir en `soho_db`. Incluyen alta mínima, completar identidad, `40P5`, otro color del grupo, códigos concurrentes, paso de `9999` a `10000`, conflicto de versiones, reintentos tras ediciones posteriores, COMMIT sin respuesta, recuperación privada por clave, rollback de auditoría, sesión revocada durante un bloqueo, permisos y conservación de variantes con déficit o deshabilitadas. La regresión comprende también pedidos, pagos, reservas, envíos y conversión.

Evidencia local: `.checkout-review/productos-borradores/`. El esquema, las diez migraciones y las fuentes de Angular permanecen intactos. La interfaz mantiene `capacidades.escrituraDisponible: false` porque sus formularios y el resto de acciones todavía necesitan integración. La API de borradores aquí documentada ya está implementada.

La [gestión de fotografías con Cloudinary](api-fotografias-productos.md), sus cargas, conciliación y galería ya están implementadas. La [publicación](api-publicacion-productos.md) también está implementada mediante una acción separada. La siguiente entrega es conectar los formularios Angular. Los ajustes manuales de stock y la edición de productos publicados requieren su propio alcance.
