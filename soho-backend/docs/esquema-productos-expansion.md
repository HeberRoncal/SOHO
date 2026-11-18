# Productos por color: primera ampliación del esquema

Fecha: 15 de noviembre de 2026. Novena migración: `20261115000000_expansion_productos_color`.

La primera fase de la [propuesta de productos por modelo y color](propuesta-productos-por-color.md) está implementada en `prisma/schema.prisma`. La migración añade la estructura necesaria sin dividir productos ni convertir sus datos. El usuario confirmó que ya la aplicó el 15 de noviembre de 2026. Durante su desarrollo se probó exclusivamente en MySQL aislado, sin aplicar cambios a `soho_db` desde las pruebas.

## Cambios de esta fase

Hay **31 tablas de negocio**: las 26 existentes y cinco nuevas. El esquema final propuesto tiene 29 porque retirará posteriormente dos tablas de colores; esa retirada no pertenece a esta migración.

| Tabla nueva                 | Finalidad                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `grupos_modelo`             | Agrupación de los productos de distintos colores, con código de modelo único por marca.  |
| `archivos_imagen`           | Identidad del archivo, proveedor, metadatos y estados de carga, conciliación y limpieza. |
| `operaciones_producto`      | Auditoría e idempotencia de las futuras escrituras administrativas.                      |
| `secuencia_codigo_producto` | Fila única del contador global de códigos internos.                                      |
| `alias_producto`            | Correspondencia de los enlaces anteriores con las fichas destino por color.              |

Las tablas nuevas quedan vacías. En particular, no se inicializa el contador en cero ni se asignan códigos mientras no se revisen los existentes. La futura conversión deberá inicializarlo bajo mantenimiento desde el máximo válido y reservar también los códigos de los colores adicionales. No existe todavía una API que utilice ese contador.

Se amplían cuatro tablas:

- `productos`: grupo, atributos de un color, orden dentro del grupo, carpeta de imágenes, versión y responsables opcionales. Los nuevos atributos y relaciones son nulos en los registros anteriores; `version` comienza en 1 y `ordenColor` en 0.
- `variantes`: `productoId` opcional para la futura relación directa, manteniendo `productoColorId` obligatorio.
- `imagenes_producto`: `archivoId` opcional, conservando ruta, texto alternativo y orden actuales. La FK compuesta impide asociar un archivo cuyo producto de origen sea otro.
- `pedido_articulos`: `archivoImagenId` opcional. La imagen y los demás snapshots históricos no cambian.

Se conservan `producto_colores`, `imagenes_producto_color`, los atributos de marca/modelo del producto y sus restricciones anteriores. También se conservan la unicidad actual de nombre/código de modelo y las longitudes actuales de los nombres. Su sustitución y ampliación a 180 caracteres corresponden a la conversión posterior coordinada con la aplicación.

Las relaciones inversas añadidas a `Marca` y `Usuario` no cambian sus columnas. Las otras 22 tablas anteriores mantienen su estructura SQL. No se regeneran SKU, no se cambian existencias, no se liberan reservas y no se crean movimientos por esta ampliación.

## Integridad nueva

La migración incorpora 22 `CHECK` nuevos. Validan códigos, nombres y carpetas, versiones, hashes, datos condicionales de archivos según proveedor/estado, tokens y fechas de carga/limpieza, historial de versiones de operaciones y la fila única del contador. Los índices únicos y las FK completan las restricciones de identidad y propiedad.

Un archivo `LEGADO` disponible conserva su ruta sin identificadores Cloudinary inventados. Un archivo Cloudinary confirmado exige identidad, URL HTTPS, formato, dimensiones y tamaño coherentes. `CONCILIANDO` permite representar un resultado externo incierto. Esta estructura no instala Cloudinary, configura credenciales, sube archivos ni ejecuta un trabajador de limpieza.

`versionCloudinary` es `BigInt`; la futura API deberá convertirlo a una cadena decimal en sus DTO JSON, en lugar de devolver directamente el objeto de Prisma.

La ausencia de referencias al limpiar, la autorización ADMIN, las transiciones válidas, la generación concurrente de códigos y los requisitos de publicación se comprobarán en sus servicios transaccionales. Las FK por sí solas no implementan esas operaciones. El límite existente de galería y los controles actuales de stock/reservas siguen vigentes. No se añade una condición que obligue a que las reservas sean menores que el stock físico.

## Plan de correspondencia sin escrituras

Se añadieron `PlanCorrespondenciaProductos` y sus interfaces mediante Nest CLI:

```powershell
npx.cmd --no-install nest generate class productos/migracion/plan-correspondencia-productos
npx.cmd --no-install nest generate interface productos/migracion/modelos-correspondencia
```

El planificador es una clase independiente: no se registra en el módulo, no expone un endpoint ni inicia procesos. El script `scripts/planificar-productos.ts` acepta una instantánea JSON o una lectura explícita del catálogo. No aplica el plan ni utiliza `INSERT`, `UPDATE`, `DELETE`, migraciones o seed.

El resultado incluye:

- Huella SHA-256 de la fuente y versión del formato para detectar cambios antes de una futura conversión.
- Grupo y producto destino por cada color, con UUID deterministas. El color principal se elige por orden y UUID; conserva UUID, código interno y slug anteriores.
- Códigos nuevos desde el máximo global, ordenando los productos por código interno y UUID. Los códigos de productos archivados también se reservan. No se cambian los ejemplos del usuario en asignaciones obligatorias.
- Variantes con sus UUID, SKU y cantidades guardadas; admite reservas superiores al stock y conserva SKU heredados aunque su formato sea distinto del nuevo.
- Galería por color según el comportamiento actual, con correspondencia al identificador anterior y nuevas identidades de asociación/archivo. Una foto general compartida no reutiliza el mismo UUID de asociación entre dos productos.
- Alias para el slug sin selección y para cada color anterior.
- Incidencias por colisiones, códigos que requieren revisión, contador agotado, publicación incompleta, galerías desbordadas, nombres/slugs inválidos o conversión ya iniciada. No trunca fotos ni fusiona modelos automáticamente.

`aptoParaRevision` significa que no se encontraron esas incidencias. No significa que el plan pueda aplicarse sin revisar: aún faltan el ejecutor de conversión, la adaptación de la aplicación y la comprobación de vigencia bajo mantenimiento. El plan registra advertencias cuando comparte fotos generales según la regla actual.

### Uso posterior

Después de aplicar esta ampliación, un operador podrá obtener un plan local del catálogo. La lectura necesita `DATABASE_URL` explícita; el script no carga `.env` automáticamente ni arranca NestJS y sus trabajadores. El archivo de salida se crea con `wx`, por lo que nunca reemplaza una revisión existente.

Desde `soho-backend`, para una instantánea con el formato `EntradaCorrespondencia`:

```powershell
npx.cmd --no-install tsx scripts/planificar-productos.ts --entrada instantanea-productos.json --salida plan-productos.json
```

Para leer la base configurada deliberadamente mediante el archivo local de entorno:

```powershell
node --env-file=.env --import tsx scripts/planificar-productos.ts --desde-bd --salida plan-productos.json
```

La lectura usa una transacción `RepeatableRead` y obtiene únicamente datos del catálogo, sin clientes, contactos, sesiones o comprobantes. Se recomienda una credencial de solo lectura para esa operación. El código de salida es 0 con plan revisable, 2 con incidencias y 1 si falla la lectura, el formato o la creación del archivo. No imprimir ni compartir credenciales.

## Aplicación y continuidad

La [décima migración y el ejecutor de conversión](conversion-productos-color.md) ya están preparados y probados. Esa guía contiene los comandos vigentes del siguiente despliegue; esta página documenta la ampliación novena ya aplicada.

La novena ya fue confirmada como aplicada por el usuario y se verificó posteriormente su registro y checksum mediante solo lectura. También quedó cerrada la [revisión del plan del catálogo real](revision-correspondencia-productos.md), con 11 grupos y 14 fichas propuestas, conservando las 168 variantes. Los comandos siguientes se conservan como referencia de despliegue, no como una instrucción para repetir la migración ya aplicada.

Las ocho migraciones anteriores permanecen intactas. La novena puede desplegarse antes de la conversión porque conserva las columnas y relaciones usadas por el backend actual. El cliente regenerado conoce las columnas nuevas: la base debe recibir la migración antes de utilizar ese cliente en el servidor que la consulta.

Desde `soho-backend`, después de detener la ejecución durante la actualización y disponer del respaldo habitual:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

No ejecutar `db:seed` como parte de la aplicación. La generación del cliente y la aplicación de migraciones son operaciones distintas; el cliente ya se regeneró en este espacio de trabajo. El comando se incluye para reproducir la instalación en otros entornos.

La entrega siguiente debe preparar el ejecutor de conversión con manifiesto revisado y la adaptación coordinada de catálogo, consulta administrativa, checkout y Angular. Solo entonces se pasarán las variantes al producto por color y se retirarán las dependencias antiguas mediante otra migración. Después se habilitarán las escrituras administrativas y Cloudinary. Crear, editar, archivar y ajustar inventario siguen bloqueados para datos reales.

## Verificación

La evidencia está en `.checkout-review/productos-esquema/`, desde la raíz SOHO. MySQL 8.0.46 temporal comprueba actualización poblada desde las ocho migraciones, conservación exacta de las columnas anteriores en sus 26 tablas, 22 estructuras anteriores intactas y cuatro ampliadas, cinco tablas nuevas vacías, despliegue desde cero y segundo despliegue sin reescritura.

Pasaron 455 comprobaciones SQL, 56 de la ampliación. El CLI de planificación leyó el seed exclusivamente en otra base temporal y produjo 11 grupos, 14 fichas y 168 variantes, conservando registros, repitiendo el mismo plan y rechazando reemplazar el archivo existente. Las herramientas se probaron compiladas a JavaScript porque el lanzador `tsx` encontró una limitación de consulta del usuario de Windows (`uv_os_get_passwd`) en el entorno de ejecución; se conservan el script TypeScript y la comprobación de tipos.

Los resultados de regresión, generación, compilación, tipos, lint, diff y cierre de procesos se registran en `resultado.json` y `validacion.json`. No se usó `soho_db` como base de pruebas ni se realizaron conexiones o cargas Cloudinary.
