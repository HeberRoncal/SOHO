# Conversión del catálogo a fichas por color

Fecha: 15 de noviembre de 2026. Implementación preparada para despliegue; no aplicada a `soho_db` durante el desarrollo.

Actualización posterior: el usuario confirmó ejecutados los comandos. La verificación de solo lectura confirmó diez migraciones, conversión registrada, 11 grupos, 14 productos y 168 variantes con identidades y galerías coherentes. Ya está implementada la [API de creación y edición de borradores](api-borradores-productos.md), sin otra migración. Las instrucciones de despliegue siguientes se conservan como referencia del corte realizado.

Esta entrega incorpora el ejecutor transaccional y adapta catálogo, consulta administrativa, checkout y Angular. Utiliza el [manifiesto del catálogo real revisado](revision-correspondencia-productos.md): once productos pasan a catorce fichas por color, conservando los 168 UUID/SKU de variantes. Las escrituras administrativas de productos y la conexión de fotografías nuevas con Cloudinary siguen pendientes.

## Décima migración

`20261115010000_conversion_productos_color` prepara la conversión, sin ejecutarla automáticamente:

- Retira la unicidad global de `productos.codigoModelo` y `productos.nombre`. El grupo conserva la unicidad del modelo por marca; cada producto conserva su UUID, código interno y slug únicos, y un color único dentro del grupo.
- Amplía a 180 caracteres el nombre de producto y su copia en `pedido_articulos`. No cambia valores guardados.
- Añade `conversion_catalogo`, con una fila inicial pendiente y dos `CHECK`. El registro confirma conjuntamente la huella del origen, huella del manifiesto, contenido y fecha de la conversión. Permite reconocer un COMMIT aunque la respuesta del comando se pierda.

El esquema pasa de 31 a 32 tablas de negocio durante esta transición. Las nueve migraciones anteriores permanecen intactas. El contador de códigos no se inicializa mediante esta migración: lo hace el ejecutor en la transacción que crea las fichas adicionales.

## Ejecutor y conservación

`ConvertirCatalogo` y `LecturaCatalogo` se generaron con Nest CLI desde `soho-backend`:

```powershell
npx.cmd --no-install nest generate class productos/migracion/convertir-catalogo --flat
npx.cmd --no-install nest generate class productos/migracion/lectura-catalogo --flat --no-spec
```

`LecturaCatalogo` centraliza la lectura utilizada por planificación y conversión. El ejecutor no es una ruta HTTP ni inicia NestJS: se invoca únicamente mediante el comando local de mantenimiento. Usa una transacción `Serializable` en MySQL y `RepeatableRead` (Snapshot Isolation) en TiDB, que no admite `Serializable`. Detecta el motor mediante `SELECT VERSION()`. Conserva el bloqueo del punto de control y de los datos afectados y un plazo de 120 segundos. En ambos casos es obligatorio detener la API y los trabajadores; Snapshot Isolation no equivale a Serializable.

Para un catálogo vacío también se genera y aplica su propio manifiesto: registra la conversión e inicializa el contador en cero, sin crear productos. La siguiente alta asigna `SHO-0001`. No basta con aplicar las migraciones de esquema. La selección de aislamiento y el plan vacío tienen cobertura unitaria; la ejecución en TiDB debe verificarse en el entorno de destino.

Las fechas existentes se conservan literalmente: los productos adicionales se copian mediante `INSERT SELECT` y los cambios de FK no asignan fechas. Esto evita que la zona horaria del adaptador reinterprete un DATETIME heredado. Se comprobó con cadenas SQL y un lector configurado con otro huso horario.

Antes de escribir, vuelve a calcular el plan desde el catálogo bloqueado. Rechaza una huella obsoleta, un JSON modificado, incidencias pendientes o datos futuros que indiquen una conversión parcial. No incluye una opción para ignorar esas comprobaciones.

En una sola transacción:

1. Crea los grupos y las tres fichas adicionales. El color principal conserva UUID, código y slug del producto original. Conserva atributos comerciales, estado, categoría, precios y fechas de origen.
2. Mueve cada fila de color existente a su producto destino y completa `Variante.productoId`. Mantiene UUID de color y variante, SKU, talla, habilitación, existencias, reservas y fechas de las variantes.
3. Reparte la galería según el manifiesto, sin perder rutas. Crea identidades `LEGADO` por producto y archivo, con su asociación ordenada. No sube, mueve, sobrescribe ni elimina archivos físicos o recursos Cloudinary.
4. En cada artículo de pedido añade únicamente la FK de la imagen histórica. Si esa URL ya no figura en la galería, crea un archivo heredado independiente que la conserve. No modifica el nombre, color, talla, SKU, URL, importes o fecha del artículo.
5. Guarda los alias, inicializa el contador hasta el último código reservado y confirma el punto de control.

Pedidos, pagos, comprobantes, reservas, envíos, cancelaciones, movimientos, datos de entrega y políticas históricas no se reescriben. Un déficit existente no provoca una liberación de reservas. No se fabrican responsables ADMIN para una operación local.

Si cualquier paso falla, se revierte toda la conversión de datos. La migración SQL previa permanece aplicada, pues el DDL de MySQL no forma parte de esa transacción.

## Compatibilidad durante el despliegue

Se conservan temporalmente las tablas de colores y las columnas antiguas de marca/modelo. Después de convertir hay una fila de color por ficha; las variantes mantienen su relación anterior y la relación directa nueva. Las copias antiguas permanecen coherentes con el grupo en el corte.

Las lecturas distinguen registros anteriores y convertidos. Los convertidos utilizan grupo, variantes directas y galería propia; los anteriores conservan su consulta previa. Esto permite instalar la versión antes de ejecutar el cambio de datos. El inventario agrupa por el producto directo cuando existe y conserva el vínculo anterior como respaldo de transición.

Las escrituras futuras deberán mantener esta coherencia hasta completar la retirada de las estructuras antiguas. Esta entrega no elimina tablas ni FK anteriores ni convierte en obligatoria la nueva FK de variante. La consolidación estructural será otra migración cuando se retire el soporte de datos anteriores.

El seed de demostración anterior rechaza un catálogo que ya tenga productos agrupados por modelo. No se utiliza como herramienta de recuperación o actualización del catálogo convertido.

## Catálogo, enlaces y Angular

El contrato público conserva `colores` y `variantes`, pero una ficha convertida contiene solamente su color y sus tallas. El campo opcional `otrosColores` enlaza las otras fichas publicadas del mismo grupo. No publica borradores, archivados, marcas/categorías inactivas o galerías sin fotos disponibles. Las fotos del color y de la galería permiten mantener las tarjetas, detalle y carrito existentes.

`GET /api/productos/:slug?color=NG` resuelve los alias revisados. Un color solicitado que no corresponda a la ficha devuelta responde 404; un parámetro mal formado o repetido responde 400. No devuelve otro color silenciosamente.

Angular muestra enlaces nativos a otros colores y añade el color al título de las tarjetas convertidas. Resuelve enlaces antiguos como `/producto/samba?color=NG&talla=40` a `/producto/samba-negro?talla=40`, conserva la talla y mantiene la compra bloqueada para combinaciones inválidas. Los favoritos anteriores mantienen el slug principal.

El carrito continúa guardando SKU. Si una respuesta de catálogo traslada un SKU a otra ficha, la caché deja de asociarlo a la anterior. Tras una recarga recupera el producto canónico mediante el SKU guardado. La API recalcula precio, disponibilidad, cobertura y reservas al crear el pedido.

## Checkout e imágenes históricas

El checkout bloquea inventario y datos comerciales del producto directo, además de las filas de galería y archivo antes de guardar su snapshot. Una foto convertida debe estar `DISPONIBLE`. El artículo nuevo conserva URL y FK del archivo en la misma transacción que el pedido y sus reservas.

Se conservan las reglas de CSRF, propiedad, ADMIN, precios exactos, stock y cobertura. Aprobar sigue conservando las reservas; despachar consume las de ese pedido y descuenta una vez. El cambio de agrupación no altera esos estados.

## Despliegue en la base local

La novena migración ya está confirmada como aplicada. Para este corte, detener todas las instancias de la API y sus trabajadores, disponer de un respaldo completo restaurable y mantener el servicio detenido hasta terminar la comprobación. Las pruebas de restauración se realizaron con una copia sintética aislada; este desarrollo no creó ni restauró un respaldo de `soho_db`.

Desde `soho-backend`:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
npm.cmd run db:productos:convertir -- --manifiesto "../.checkout-review/conversion-productos/manifiesto-revisado.json" --confirmar-mantenimiento
```

El archivo indicado conserva la correspondencia revisada y fue generado con el lector Prisma compartido del comando. Se cotejaron ambos planes: únicamente cambian la representación de las fechas y la huella respecto de la lectura SQL directa; UUID, códigos, SKU, precios, cantidades, rutas y alias son idénticos. Es específico de los UUID y datos de esta base. Si se despliega en otro entorno, hay que generar y revisar su propio manifiesto; no reutilizar este archivo sobre un catálogo distinto.

Los comandos `db:productos:plan` y `db:productos:convertir` cargan deliberadamente `.env` mediante `node --env-file`. Los scripts no lo cargan por su cuenta. No mostrar la URL o credenciales en terminales compartidos. No ejecutar `db:seed` durante este proceso.

### Si la revisión dejó de estar vigente

El ejecutor aborta sin aplicar datos cuando el catálogo cambió desde la lectura. Con la API detenida, generar otro archivo y revisar sus diferencias:

```powershell
npm.cmd run db:productos:plan -- --desde-bd --salida "../.checkout-review/conversion-productos/manifiesto-actualizado.json"
```

No editar a mano el JSON para forzar su aceptación. Una vez revisado, utilizar su ruta en el comando de conversión. El planificador se utiliza antes de convertir; después, el punto de control conserva el manifiesto aplicado.

### Respuesta perdida o reintento

Repetir el mismo comando con el mismo manifiesto. Si el COMMIT ya ocurrió, devuelve `yaRealizada: true`, comprueba las identidades confirmadas y no vuelve a crear productos o reiniciar inventario. Esto sigue siendo válido si después hubo compras o cambios legítimos de stock. Un manifiesto distinto se rechaza.

### Comprobación antes de reabrir

Para el catálogo revisado se esperan 11 grupos, 14 productos, 168 variantes, códigos originales conservados y nuevos códigos `SHO-0012` Samba Negro, `SHO-0013` Chuck 70 Negro y `SHO-0014` Old Skool Azul. Verificar galería, alias, conteos y la recuperación de carritos por SKU. Iniciar la API y comprobar el catálogo antes de reabrir el servicio.

Si una recuperación requiere restaurar el respaldo, hacerlo con el servicio detenido y sobre una base nueva o vacía, comprobando su contenido antes de cambiar la conexión de la aplicación. Importar el respaldo de nueve migraciones sobre el esquema ya convertido puede dejar tablas posteriores, como `conversion_catalogo`, que no figuran en ese respaldo. La restauración verificada utilizó una base vacía independiente. No restaurar sin conciliación una copia anterior si ya se aceptaron operaciones posteriores al corte.

## Validación y evidencia

El cierre aprobó **808 pruebas del backend**, **467 comprobaciones SQL** y **739 pruebas de Angular**, además de nueve capturas en Chrome sin errores de consola o desbordamientos. La lectura final de la base local, realizada en solo lectura el 15 de noviembre a las 09:18:31 America/Lima, confirmó que sigue con nueve migraciones y la misma correspondencia revisada. Una comprobación posterior con Prisma en sesión de solo lectura confirmó la huella del archivo de ejecución: `065060b760307b216db17def80a5003c1ba8ef74f3a7157fdb198939a22e5cb2`. La huella anterior de la lectura SQL directa permanece como evidencia histórica. Esto no sustituye la comprobación de vigencia que el ejecutor realiza al aplicar.

Los resultados se conservan en `.checkout-review/conversion-productos/`. Se prueban despliegue desde cero, actualización de las nueve migraciones con datos, restauración de respaldo previo, segundo despliegue sin reescritura, manifiesto alterado/obsoleto, rollback del último paso, reintento posterior al COMMIT, SKU y movimientos conservados, fotografías retiradas, reservas aprobadas con déficit, compra por color, aprobación/preparación/despacho y bloqueo del seed anterior.

La interfaz se valida con pruebas Angular y Chrome contra NestJS y MySQL reales aislados, incluyendo alias, cambio de ficha, talla conservada, recarga del carrito y capturas a 1440, 768 y 390 píxeles. La compilación/generación, tipos, lint y el diff representable de Prisma también forman parte del cierre. La restricción del lanzador `tsx` dentro del aislamiento de Windows se evita en los recorridos compilando los scripts a JavaScript; la lógica y argumentos de los comandos se prueban igualmente.

Los comandos comerciales y la migración no se ejecutan sobre `soho_db` durante estas comprobaciones. Cloudinary y los ajustes manuales de inventario requieren otras entregas.
