# Propuesta: productos por modelo y color, SKU y fotografías

Fecha: 14 de noviembre de 2026. Documento de diseño histórico.

Actualización de implementación: la conversión ya fue aplicada y comprobada; el backend implementa [borradores](api-borradores-productos.md) y [fotografías Cloudinary](api-fotografias-productos.md), conservando la estructura transitoria del esquema activo. La [publicación de borradores](api-publicacion-productos.md) ya está implementada. Formularios Angular y retirada de la estructura anterior siguen pendientes. Las referencias posteriores al estado inicial corresponden a aquella propuesta.

Actualización posterior: la [conversión por color](conversion-productos-color.md) y la adaptación de la aplicación están implementadas y verificadas de forma aislada, con despliegue real pendiente. Se conserva temporalmente la estructura anterior y se añade `ConversionCatalogo` como punto de control duradero, no incluido en el esquema objetivo inicial adjunto. El esquema activo y las migraciones reflejan esta evolución; el archivo adjunto sigue siendo la propuesta histórica.

Actualización del 15 de noviembre: se implementó la [primera ampliación compatible](esquema-productos-expansion.md), con la novena migración preparada y validada en MySQL aislado. El archivo de esquema adjunto sigue representando el destino final; la conversión y retirada de las estructuras anteriores continúan pendientes. Las referencias siguientes a la verificación inicial describen la entrega documental del 14 de noviembre.

El [esquema Prisma completo propuesto](propuestas/productos-por-color.prisma) es un archivo independiente del esquema activo. Incluye las relaciones inversas y los modelos existentes para poder validarlo con Prisma. Su generador apunta a un directorio de revisión; no se ha generado un cliente desde esta propuesta. Este documento no crea la novena migración ni habilita escrituras administrativas.

La estructura vigente permite varios colores bajo un mismo código interno. Para cumplir la decisión del usuario, la estructura objetivo será `Marca → GrupoModelo → Producto de un color → Variante de una talla`. El cambio exige una migración de datos y la adaptación coordinada de API y Angular.

## Responsabilidades y decisiones

| Entidad                   | Responsabilidad                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GrupoModelo`             | Marca, código y nombre del modelo compartidos; agrupa sus productos de distintos colores.                                  |
| `Producto`                | Código interno, slug, un color, nombre comercial, descripción, género, categoría, precios, publicación, versión y galería. |
| `Variante`                | Una talla del producto; conserva UUID, SKU, habilitación, existencias, reservas y referencias históricas.                  |
| `Talla`                   | Catálogo EU existente; no se sustituye por texto dentro del SKU.                                                           |
| `ArchivoImagen`           | Identidad y ciclo de vida del archivo, con datos verificables de Cloudinary o procedencia heredada.                        |
| `ImagenProducto`          | Asociación de archivo y producto, texto alternativo y posición en la galería. La posición cero es la portada.              |
| `SecuenciaCodigoProducto` | Contador global para asignar códigos internos dentro de una transacción.                                                   |
| `OperacionProducto`       | Auditoría de cambios confirmados y respuesta de un reintento con la misma clave.                                           |
| `AliasProducto`           | Correspondencia entre enlaces anteriores y las nuevas fichas por color.                                                    |

Ejemplo ilustrativo del usuario, sin asignar esos números a los datos existentes:

| Grupo      | Producto                                | Variantes                                              |
| ---------- | --------------------------------------- | ------------------------------------------------------ |
| `NK-AF107` | `SHO-0012`, Nike Air Force 1 '07 Blanco | `NK-AF107-BL-40`, `NK-AF107-BL-40P5`, `NK-AF107-BL-41` |
| `NK-AF107` | `SHO-0013`, Nike Air Force 1 '07 Negro  | `NK-AF107-NG-40`, `NK-AF107-NG-40P5`, `NK-AF107-NG-41` |

El grupo es una relación real mediante `grupoModeloId`. El texto `NK-AF107` se obtiene de los códigos de marca y modelo; no es necesario duplicarlo en un `model_group` libre. La unicidad de modelo pasa de global a `(marcaId, codigoModelo)`. La unicidad de color será `(grupoModeloId, codigoColor)` y la de talla `(productoId, tallaId)`.

`Producto.ordenColor` conserva el orden del color dentro del modelo para los enlaces de otros colores, independientemente de `ordenCatalogo`, que controla su posición comercial en el listado.

Se propone que precio, precio anterior y condiciones comerciales pertenezcan al producto de un color, compartidos por sus tallas. Al migrar se copian los valores actuales a cada color: no se cambia ningún importe. Posteriormente cada ficha podrá editarse de forma independiente. Esta elección amplía la flexibilidad del modelo actual, cuyo precio es común a todos los colores.

El nombre comercial pasa de 120 a 180 caracteres y deja de ser único: la identidad está en UUID, código interno y slug. Esto permite conservar nombres existentes y añadir el color sin truncarlos. `PedidoArticulo.nombreProducto` también se amplía a 180; los nombres históricos guardados no se reescriben. El nombre y los atributos comerciales no se deducen analizando el SKU.

`grupoModeloId`, los datos del color, categoría y precios admiten `NULL` en borradores. El grupo también admite datos parciales para preservar borradores heredados. Un alta nueva no crea automáticamente un grupo vacío: primero se guarda el borrador y luego se elige o completa el grupo. Los responsables de filas heredadas pueden ser nulos; las nuevas escrituras exigen un ADMIN real obtenido de la sesión.

## Código interno y SKU

El backend asignará `SHO-0001`, `SHO-0002`, etc., en el primer guardado, incluso si queda en borrador. Se usan al menos cuatro dígitos: después de `SHO-9999` sigue `SHO-10000`. El código confirmado es inmutable y no se reutiliza al archivar. No existe edición de código ni cálculo de la secuencia desde Angular.

La fila única `SecuenciaCodigoProducto.id = 1` se inicializa a partir de los códigos existentes, durante la migración controlada. Cada alta bloquea e incrementa ese contador y guarda producto y operación en la misma transacción. La restricción única de código sigue siendo la última defensa. No usar `MAX + 1` en cada petición. Un rollback no entrega un código confirmado; un reintento después de un COMMIT recupera la operación, sin crear otro producto. El contador no se decrementa para reciclar códigos.

El SKU nuevo se genera exclusivamente en el backend: `[MARCA]-[MODELO]-[COLOR]-[TALLA]`. Se validan y normalizan los códigos a mayúsculas sin espacios ni guiones internos: marca y modelo alfanuméricos dentro de sus longitudes existentes y color de dos letras, conservando el catálogo actual. El SKU completo no excede 96 caracteres. Marca, código de modelo, código de color y talla deben estar definidos antes de crear variantes.

La talla se formatea como decimal exacto: `40` o `40.0` → `40`; `40.5` → `40P5`. Se conserva el rango EU de 35 a 48, en pasos de media talla. No se calcula con redondeos de coma flotante. Cada SKU es único y se persiste: los SKU existentes no se regeneran al migrar ni al editar nombres.

Al existir variantes se bloquean los cambios de identidad de marca, código de marca/modelo/color, grupo y talla. Crear otra combinación requiere otra ficha o variante; no trasladar una variante vendida ni cambiarle su SKU. Las etiquetas visibles pueden corregirse sin renombrar identidades históricas. La edición compartida de un grupo o marca deberá respetar todos sus productos y no queda implícita en el formulario de un solo color.

Las nuevas variantes empiezan con existencias y reservas en cero. La carga o ajuste de stock corresponde al flujo de movimientos con responsable e historial, que se entregará por separado. Archivar, despublicar o deshabilitar impide nuevas compras, pero no libera reservas ni impide procesar un pedido ya confirmado según sus reglas actuales. No se borran variantes o productos usados por pedidos.

## Fotografías y Cloudinary

La galería tiene hasta ocho asociaciones ordenadas, sin repetir archivo dentro del producto. Todas sus tallas comparten las fotos. `ArchivoImagen` guarda `cloudName`, `assetId`, `publicId`, versión, tipo de recurso y entrega, URL HTTPS, carpeta, formato, dimensiones, tamaño y hashes. Los datos externos pendientes admiten `NULL`; la confirmación exige metadatos verificados por el backend. El API Secret nunca se guarda en estas tablas ni se envía a Angular.

La identidad del archivo está separada de su posición y texto alternativo. La clave foránea compuesta de `ImagenProducto` garantiza que el archivo pertenece al producto al que se asocia. `PedidoArticulo` conserva su URL histórica y añade una referencia opcional al archivo. Los pedidos nuevos referencian el archivo elegido y copian su URL en la misma transacción; los anteriores conservan exactamente su imagen guardada. Reemplazar una foto crea otro recurso, sin sobrescribir el anterior.

Organización propuesta, respetando la captura del usuario:

```text
SOHO/
  marcas/
  productos/
    adidas-superstar/
    asics-gel-1130/
    nike-air-force-1-07/
      SHO-0012-blanco/
      SHO-0013-negro/
    puma-suede-xl/
```

`GrupoModelo.slugCarpeta` y `Producto.carpetaImagenes` reservan rutas únicas. La ruta del producto se fija al preparar su primera carga, cuando modelo y color están completos; no se renombra por cambiar un nombre visible. Una colisión de carpeta requiere resolver el slug, sin fusionar modelos distintos. En modo dinámico se usará `asset_folder`; en modo fijo se usará `folder`. Debe verificarse el modo real de la cuenta. La carpeta visible no determina por sí sola el `public_id` ni la URL, conforme a los [modos de carpetas oficiales](https://cloudinary.com/documentation/folder_modes).

El identificador de una carga se deriva de un UUID de archivo persistido, con `overwrite: false`; los nombres visibles pueden indicar frontal, lateral o posterior. Se conservan los identificadores devueltos y se comprueba una respuesta de recurso existente antes de aceptarla como reintento. La semántica de `overwrite` y los identificadores se documentan en la [referencia de Upload API](https://cloudinary.com/documentation/image_upload_api_reference). Mover archivos manualmente en Cloudinary no sustituye una operación de galería en MySQL.

Flujo propuesto para la futura implementación:

1. Guardar el producto como borrador para obtener UUID y código. Completar grupo y color antes de preparar cargas.
2. Autorizar ADMIN y CSRF, comprobar propiedad del archivo respecto al producto y validar imágenes JPEG, PNG o WebP, de hasta 5 MB. Decodificar contenido con sharp, limitar dimensiones/píxeles y recodificarlo; no confiar en extensión, MIME ni metadatos enviados por Angular. Los límites concretos de píxeles y el contrato multipart se cerrarán con la API.
3. Crear `ArchivoImagen` en `PENDIENTE` con clave de carga única, hash de solicitud y destino externo previsto. Reclamar un token y plazo de carga antes de iniciar la petición externa. Dos intentos de la misma clave no pueden cargar simultáneamente.
4. Subir desde NestJS fuera de una transacción SQL larga. Confirmar los metadatos y cambiar a `DISPONIBLE` solo si la identidad y el hash coinciden con la solicitud. No reconstruir URL a partir del nombre del archivo.
5. Ante timeout o respuesta incierta, pasar a `CONCILIANDO`, consultar el recurso previsto y recuperar su identidad antes de repetir la carga. `tokenCarga`, `bloqueoCargaHasta`, `intentosCarga` y `proximaRevisionEn` permiten coordinar reintentos y revisión. La caducidad de un token no demuestra que la petición externa haya terminado.
6. Asociar la imagen a la galería mediante versión esperada del producto y bloqueo del archivo; aceptar únicamente `DISPONIBLE`. Repetir una clave con otro contenido devuelve conflicto. Las respuestas al cliente exponen solo los datos necesarios para gestionar la galería.

La limpieza no elimina cargas `PENDIENTE` o `CONCILIANDO` solo por antigüedad. Una respuesta tardía debe recuperarse y conciliarse; no declarar `ELIMINADO` mientras una carga externa siga incierta. El trabajador de conciliación será parte de la integración de fotografías, con reintentos limitados por ejecución y registro de incidencias sin secretos. MySQL y Cloudinary no comparten una transacción; la propuesta requiere recuperación explícita, sin prometer una operación externa exactamente una vez.

Solo un archivo Cloudinary confirmado y sin referencias de galería ni de pedidos puede reclamarse para limpieza. Bajo bloqueo se vuelve a comprobar esa ausencia, se asigna token/plazo y se marca `ELIMINANDO`. El borrado externo ocurre después del COMMIT; el resultado se confirma usando el mismo token. Un fallo conserva el estado para reintento. Checkout y la asociación de galería exigen `DISPONIBLE` bajo el mismo bloqueo, evitando que se añadan referencias mientras se borra. La fila puede conservarse como `ELIMINADO` para auditoría. Nunca limpiar un archivo referenciado por un pedido.

Los archivos existentes se representan como `LEGADO`, disponibles con su ruta actual. No se inventan `asset_id` ni `public_id` para una URL. No hay subida, movimiento ni borrado externo como efecto de una migración SQL. Los recursos heredados se excluyen del borrado automático; una migración de fotos a Cloudinary, si se desea, será otra operación verificable. Los comprobantes de pago mantienen su mecanismo privado actual.

## Restricciones y publicación

Prisma representa columnas, índices y relaciones; los `CHECK` de MySQL existentes y nuevos se escribirán expresamente en las migraciones. Que el archivo Prisma sea válido no demuestra que estas reglas ya estén aplicadas.

| Regla                                                                  | Garantía prevista                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Código interno, slug, SKU, claves de solicitud/carga únicos            | Índices únicos y validación del servicio.                                                    |
| Modelo por marca, color por grupo, talla por producto                  | Índices compuestos; los borradores incompletos pueden conservar `NULL`.                      |
| Códigos y nombres no vacíos, color válido, hexadecimal `#RRGGBB`       | `CHECK` cuando hay valor y validación normalizada del backend.                               |
| Precio positivo; precio anterior nulo o mayor que el actual            | `CHECK` y cálculo con `Decimal`. Pendiente no equivale a cero.                               |
| Producto publicado con grupo, color, categoría y precio definidos      | `CHECK` de sus propios campos, con `IS NOT NULL` explícito.                                  |
| Grupo completo, marca/categoría activas y coherencia de SKU            | Servicio transaccional: son condiciones que cruzan tablas.                                   |
| Publicación con al menos una variante habilitada y una foto disponible | Servicio bajo bloqueos; puede publicarse agotado con stock cero.                             |
| Galería de 0 a 8 fotos, posición 0–7 y sin archivos ajenos o repetidos | `CHECK`, índices únicos, FK compuesta y validación de orden consecutivo. Publicar exige 1–8. |
| Stock y reservas entre 0 y 99999, talla EU válida                      | Conservar los `CHECK` actuales y comprobarlos tras mover la FK de variante.                  |
| Contador único, versiones positivas y cambios coherentes               | `CHECK` del contador/operaciones y autorización/versionado transaccional.                    |
| Archivo disponible con URL y metadatos coherentes con su proveedor     | `CHECK` condicional por proveedor/estado y verificación del backend.                         |
| Limpieza y carga con tokens/fechas coherentes                          | `CHECK` locales y máquina de estados transaccional.                                          |

Las reservas pueden exceder el stock físico por una incidencia ya existente. No imponer `reservado <= existencias` ni reducir reservas para hacer pasar la migración. Se conservan las alertas y el tratamiento actual de pagos aprobados. Publicar, editar fotos o archivar no modifica reservas, movimientos ni política histórica.

Para Cloudinary disponible se exige identidad externa completa, `resourceType = image`, entrega pública prevista, URL HTTPS y dimensiones/tamaño positivos dentro de los límites validados. Para `LEGADO` se conserva la ruta y se permiten metadatos externos nulos. Los hashes y tokens usan formatos definidos y las fechas de eliminación no se confunden con la retirada de una galería.

## Versiones, auditoría y conflictos con pedidos

Las escrituras administrativas usan clave de solicitud, hash y versión esperada. `OperacionProducto` se inserta en la misma transacción que producto, variantes y galería; guarda responsable, antes/después y respuesta confirmada. La clave se vincula al ADMIN y al tipo de operación, además del contenido normalizado. Un reintento con igual identidad y hash recupera esa respuesta; con otro actor, tipo o contenido devuelve conflicto. La autorización se vuelve a comprobar también al recuperar una operación, y después de esperar bloqueos. La respuesta histórica no se utiliza para sobrescribir una versión posterior en Angular: después de recuperarla se consulta el estado vigente.

La versión evita que dos administradores sobrescriban cambios. Una actualización efectiva incrementa la versión una vez, registra su operación y no incluye secretos ni credenciales de sesión en JSON de auditoría. No se fabrican operaciones ni responsables para simular una edición administrativa del catálogo heredado.

Checkout consulta actualmente `variantes → producto_colores → productos`, bloquea filas y después lee las galerías. Al pasar a `variantes → productos → grupos_modelo` debe adaptarse también ese bloqueo, la lectura de fotos y la creación del snapshot. Para evitar referencias a archivos en limpieza, se releen galería y disponibilidad con bloqueo antes de guardar el pedido.

La implementación debe fijar y probar un orden común de bloqueo, conservando primero la secuencia de autorización y recursos de pedido ya utilizada por los servicios existentes. Dentro del catálogo: grupos, contador cuando hay alta, productos ordenados por UUID, variantes ordenadas por UUID y archivos/galerías. Una misma operación no puede invertir ese orden para editar una galería o crear el pedido. Los bloqueos de configuración/cobertura existentes deben integrarse en ese orden completo antes de habilitar escrituras. No basta añadir un helper sin adaptar las consultas actuales; las pruebas cubrirán checkout frente a edición, archivo, publicación y limpieza, y los reintentos acotados de deadlocks.

Pagos, vencimientos, recuperación, cancelación y despacho conservan sus referencias a la variante. Se revisarán sus consultas y se repetirán sus pruebas porque comparten inventario; no se cambian sus reglas ni se recalculan snapshots desde el catálogo. Un pedido confirmado sigue procesándose aunque su producto deje de publicarse.

## Correspondencia de los datos existentes

Antes de escribir SQL de backfill, producir un manifiesto con datos reales leídos de forma controlada: producto anterior, color anterior, grupo nuevo, producto destino, UUID, código interno, slug y variantes asignadas. Debe registrar colisiones y decisiones explícitas. Este diseño no ha consultado `soho_db`.

Regla propuesta para conservar identidades:

1. Cada producto actual genera un grupo, o se une a uno solo si marca/código de modelo y la revisión de datos confirman que es el mismo modelo. No agrupar por nombre parecido.
2. El color principal, determinado por el orden actual y UUID como desempate, conserva UUID, código interno y slug del producto anterior. Si no tiene colores, se conserva como borrador incompleto, sin inventar variantes.
3. Los colores adicionales reciben nuevos UUID, códigos desde el máximo global existente y slugs disponibles. No cambiar un código ya asignado para hacerlo coincidir con los ejemplos `SHO-0012` y `SHO-0013` del usuario. Los casos sin orden válido se incluyen en la revisión del manifiesto.
4. Cada variante mantiene exactamente UUID, SKU, talla, habilitación, existencias, reservas y fechas; solo cambia su FK al producto destino. Los artículos, reservas y movimientos siguen apuntando al mismo UUID. No crear movimientos de stock por dividir colores.
5. Copiar precio, estado y demás atributos comerciales a cada destino, conservar la categoría y el orden del color, y completar el nombre con el color sin truncarlo. Si un caso heredado no cumple las nuevas condiciones de publicación, detener la migración para resolverlo expresamente; no despublicarlo ni inventar datos silenciosamente.
6. Calcular la galería por color con la regla actual del detalle Angular: fotos de ese color, seguidas de fotos generales que no estén identificadas como propias de ningún otro color; deduplicar por ruta, conservando orden y texto alternativo de la asociación de origen. Si una misma ruta tiene textos distintos se registra la prioridad de la foto del color. Más de ocho fotos, rutas ambiguas o duplicadas entre colores requieren decisión en el manifiesto, sin truncar ni adivinar.
7. Crear archivos `LEGADO` para esas asociaciones y para imágenes históricas de pedidos que ya no estén en una galería. Conservar todas las URL históricas. Cuando una ruta general está compartida se puede representar con un registro heredado por producto; no inventar una identidad Cloudinary común. Resolver cada referencia de pedido mediante su variante y ruta exacta.
8. Registrar alias para el slug anterior sin color y para cada código de color anterior. Resolver primero la combinación explícita: por ejemplo, `samba?color=NG` debe llegar al nuevo Negro aunque `samba` siga siendo el slug del Blanco. Conservar parámetros válidos de talla y resolver carritos por SKU, sin convertir un Negro en Blanco.

La revisión previa detectará códigos internos fuera del patrón, duplicidades normalizadas, códigos modelo vacíos, variantes sin correspondencia, slugs mayores de 160, nombres mayores de 180 y recursos sin procedencia clara. Si falta información para un borrador, se conserva `NULL`; si afecta una publicación o el reparto de variantes, no se continúa automáticamente.

### Vista previa con el archivo local de demostración

La evidencia de revisión usa únicamente `prisma/datos/catalogo-demostracion.json`, sin ejecutar el seed. Sus 11 productos contienen 14 colores y 168 variantes: el resultado ilustrativo sería 11 grupos, 14 productos y las mismas 168 variantes/SKU. Con el orden de ese archivo, los códigos adicionales serían:

| Producto/color adicional | Código de ejemplo en esta vista previa |
| ------------------------ | -------------------------------------- |
| Samba Negro              | `SHO-0012`                             |
| Chuck 70 Negro           | `SHO-0013`                             |
| Old Skool Azul           | `SHO-0014`                             |

Los once códigos originales se conservan en su color principal. Esto no describe ni autoriza un reparto de la base real, cuyos datos pueden haber cambiado. El manifiesto local se guarda en `.checkout-review/propuesta-productos/vista-previa.json` desde la raíz SOHO; sus identificadores de demostración no son UUID reales ni una migración ejecutable.

## Estrategia de migración y despliegue

El esquema adjunto representa el destino final. Un diff automático directo quitaría tablas y columnas que todavía usa la aplicación. No debe aplicarse como migración de producción. La implementación se prepara y prueba primero en MySQL aislado, desde las ocho migraciones actuales.

1. **Inventario previo y respaldo.** Revisar solo lectura, generar y revisar el manifiesto real, guardar conteos y huellas de los datos protegidos y probar restauración del respaldo. Definir ventana de mantenimiento o un mecanismo de doble escritura completo; este diseño propone mantenimiento para la conversión y no presupone compatibilidad de ambas versiones.
2. **Ampliación.** Añadir grupos, archivos, secuencia, auditoría y alias; agregar columnas inicialmente compatibles y `variantes.producto_id` opcional, conservando `producto_color_id`, tablas de color y las columnas comerciales antiguas. Preparar nuevas relaciones sin eliminar las usadas por el código desplegado.
3. **Copia y comprobación.** Aplicar el manifiesto de forma reanudable, sin reasignar códigos o UUID al repetirlo. Copiar marca/modelo a grupos, colores y precios a productos; completar ambas referencias de variante durante la transición. Migrar galerías y referencias históricas. La unicidad global antigua de código de modelo debe retirarse en la fase adecuada para permitir productos hermanos; el dato compartido ya estará conservado en el grupo. Los `CHECK` antiguos que dependen de marca/modelo/ruta no se eliminan sin sustitutos equivalentes.
4. **Adaptación y cambio coordinado.** Preparar API, Prisma y Angular para la estructura nueva antes de retirar las relaciones antiguas. Durante la conversión detener escrituras y trabajadores que puedan competir, conciliar reservas y verificar el manifiesto. Cambiar catálogo, consulta administrativa y checkout juntos; resolver alias antes de reabrir. No se indica al usuario aplicar una migración que rompa el backend aún desplegado.
5. **Consolidación posterior.** Cuando ningún consumidor dependa de las tablas/columnas anteriores, eliminarlas mediante otra migración revisada. Hacer obligatoria la FK nueva de variante y mantener sus índices/`CHECK`. Conservar manifiesto y alias. La novena migración no tiene por qué realizar toda la conversión y eliminación en un solo paso.
6. **Validación del despliegue.** Comparar valores protegidos, ejecutar recorridos y verificar un segundo despliegue sin cambios de datos. Ante un fallo no confiar en un rollback transaccional de todo el DDL de MySQL: usar el respaldo y el procedimiento de recuperación probado, sin borrar las ocho migraciones aplicadas.

El seed actual también necesita adaptación: detecta productos por campos como código de modelo que dejarán de estar en el producto. No volver a ejecutarlo sobre una base convertida hasta que use las identidades y relaciones nuevas. Las pruebas usarán una base temporal; `soho_db` no es una base de pruebas.

## Impacto y entregas siguientes

| Área                                                                     | Adaptación necesaria al implementar                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma` y migraciones nuevas                              | Modelo definitivo por fases, backfill con manifiesto y restricciones SQL. Generar cliente con Prisma, sin editarlo a mano. |
| `src/catalogo/catalogo.service.ts` y `dto/producto-publico.dto.ts`       | Lectura por color, marca/modelo desde grupo y enlaces de otros colores publicados.                                         |
| `src/productos/consulta-productos.service.ts` y DTO administrativos      | Consultas Prisma y SQL directo, totales, filtros, galería y variantes directas.                                            |
| `src/pedidos/pedidos.service.ts`                                         | Joins, bloqueos, foto seleccionada y referencia histórica, conservando cálculo y reservas.                                 |
| Servicios de pagos, envíos, cancelación y reservas                       | Revisar dependencias y conservar reglas; UUID de variante estable.                                                         |
| Angular: catálogo, detalle, favoritos, carrito y consulta administrativa | Fichas por color, enlaces del grupo, alias antiguos y contratos nuevos. Formularios de escritura en su entrega.            |
| Cargas y conciliación de fotografías                                     | Piezas nuevas mediante Nest CLI; credenciales solo en backend y pruebas con proveedor simulado antes de una carga real.    |

La siguiente entrega concreta será preparar la ampliación y el procedimiento de correspondencia sobre este diseño, con sus pruebas aisladas. Después se implementarán la adaptación de lecturas/checkout y las escrituras administrativas con Cloudinary; finalmente se conectarán los formularios. No se habilitan movimientos manuales ni se cambian distritos, tarifas, comprobantes privados o políticas de reserva como parte de esta propuesta.

Al crear nuevas piezas del backend se utilizará `npx.cmd --no-install nest generate <tipo> <ruta>` desde `soho-backend`, reutilizando los componentes existentes y adaptando sus importaciones ESM `.js`. En esta entrega solo se crean documentos y artefactos de revisión, por lo que no hace falta generar un módulo o recurso vacío.

## Verificación de esta propuesta

Se valida el archivo Prisma independiente con el CLI local y se compara su estructura con el esquema activo, sin conectar a MySQL. La vista previa comprueba correspondencia, unicidades, límites de galería y conservación de los 168 SKU y de sus cantidades en los datos de demostración. Se verifican mediante SHA-256 las fuentes y migraciones existentes para confirmar que esta entrega no las modificó.

El destino propuesto tiene 29 modelos frente a los 26 actuales: añade cinco, retira las dos entidades de color y adapta seis modelos existentes. La comparación de declaraciones confirma que los otros 18 modelos se conservan. El comando local `migrate diff` terminó sin salida verificable, por lo que no se presenta como una validación SQL; se utilizó la comparación de los archivos de esquema y se conserva el resultado del comando en la evidencia.

Estas comprobaciones no son una prueba de migración en MySQL ni de integración con Cloudinary. La implementación deberá probar, como mínimo: actualización poblada desde la octava migración y despliegue desde cero; conservación de pedidos/reservas/movimientos; borradores incompletos y colisiones; altas concurrentes y reintentos; `40P5`; límites de galería y fotos históricas; timeout/confirmación tardía/limpieza concurrente; checkout frente a edición/archivo; permisos revocados durante bloqueos; navegación de colores, favoritos y carritos anteriores. Los resultados locales se conservan en `.checkout-review/propuesta-productos/resultado.json`.
