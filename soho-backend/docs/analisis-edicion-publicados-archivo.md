# Edición de publicados, archivo y restauración

Análisis funcional y técnico del 15 de noviembre de 2026, America/Lima. Contrasta el funcionamiento de `soho-frontend` con el esquema y los servicios existentes. **Este documento propone el comportamiento de la siguiente implementación; no habilita operaciones ni modifica código.** El usuario confirmó aplicada la undécima migración de inventario.

Actualización posterior al análisis: los puntos 1 y 2, [API de archivo y restauración](api-archivo-productos.md) y [edición comercial/fotografías de publicados](api-edicion-publicados.md), ya están implementados y probados. Las descripciones de situación inicial y rutas propuestas de este análisis se conservan como antecedente. El punto 3, [conexión Angular](../../soho-frontend/docs/integracion-publicados-archivo.md), también está implementado y verificado. Este documento conserva el análisis previo como antecedente.

## Conclusión

El esquema vigente **permite implementar este alcance sin una duodécima migración**. Ya dispone de estados, versión comercial, responsables, archivos con referencias históricas y operaciones `ACTUALIZAR`, `ARCHIVAR` y `RESTAURAR` con clave, hash, copias y respuesta. Lo que falta es la lógica de aplicación, sus contratos, validaciones y conexión Angular.

La propuesta es editar los datos comerciales y la galería de un publicado conservando su estado; archivar para retirarlo de nuevas compras; y restaurar siempre como borrador. Archivo y restauración no alteran stock, habilitación de variantes, reservas, pagos ni pedidos. Los cambios de identidad y la gestión adicional de variantes quedan separados de esta primera ampliación.

## Comportamiento que existe hoy

| Recorrido                     | Demostración Angular                                                                                   | Integración real                                                                                                                                        | Consecuencia                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Editar un publicado           | El formulario admite datos comerciales y guardar con estado elegido.                                   | El editor real pone todo producto distinto de borrador en consulta; la API de borradores rechaza publicados y archivados.                               | Hace falta una operación específica de edición de publicados.                         |
| Pasar de publicado a borrador | Los radios y Guardar borrador permiten cambiar el estado local.                                        | No existe esa transición administrativa.                                                                                                                | No trasladar el selector de estado directamente a un PATCH genérico.                  |
| Archivar                      | Confirmación local; cambia únicamente el estado.                                                       | Los controles están restringidos y `archivar()` remoto devuelve `false`.                                                                                | Implementar una acción transaccional antes de habilitar el botón.                     |
| Restaurar                     | Cambia de archivado a borrador desde el listado, sin confirmación adicional.                           | `restaurar()` remoto devuelve `false`.                                                                                                                  | Conservar el destino borrador y añadir confirmación, versión y recuperación.          |
| Fotografías                   | El formulario de demostración trabaja con imágenes locales.                                            | Carga Cloudinary, galería, conciliación y limpieza están implementadas, pero nuevas cargas y cambios de galería exigen borrador.                        | Ampliar esas operaciones para publicados con reglas de integridad.                    |
| Identidad y variantes         | La demostración permite generar combinaciones y stock inicial; sus SKU nuevos usan una regla anterior. | Un producto representa modelo/color; NestJS asigna código interno y SKU por marca/modelo/color/talla. Las variantes nuevas de borradores nacen en cero. | Mantener el modelo real y no reutilizar el generador de demostración para escrituras. |

Fuentes: [formulario de demostración](../../soho-frontend/src/app/administracion/productos/paginas/formulario-producto/formulario-producto.html), [validaciones de demostración](../../soho-frontend/src/app/administracion/productos/modelos/edicion-producto.ts), [variantes de demostración](../../soho-frontend/src/app/administracion/productos/modelos/edicion-variantes.ts), [servicio de demostración](../../soho-frontend/src/app/administracion/productos/servicios/productos-administracion.ts), [servicio remoto](../../soho-frontend/src/app/administracion/productos/servicios/productos-administracion-api.ts) y [editor real](../../soho-frontend/src/app/administracion/productos/paginas/formulario-producto/editor-producto.ts).

## Datos editables de un publicado

La edición propuesta mantiene `PUBLICADO` durante toda la transacción. Un rechazo conserva la versión y la ficha anteriores, sin retirarla temporalmente de la tienda. Los cambios guardados se aplican a consultas y compras posteriores; las páginas ya abiertas pueden seguir mostrando datos anteriores hasta actualizarse. No se propone una copia de trabajo editorial de publicados.

| Datos                                             | Regla propuesta                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nombre                                            | Editable, entre 1 y 180 caracteres, normalizado como en el backend. No imponer la unicidad de nombre de la demostración: el esquema no la exige. El nombre visible no cambia el slug.                                                                              |
| Descripción                                       | Editable, hasta 600 caracteres; puede quedar vacía. Conservar normalización y rechazo de caracteres de control del contrato real.                                                                                                                                  |
| Categoría y género                                | Editables. Categoría existente, activa y obligatoria para conservar la publicación; género `HOMBRE`, `MUJER` o `UNISEX`.                                                                                                                                           |
| Precio                                            | Obligatorio, mayor que cero y hasta `999999.99`, expresado como cadena decimal con hasta dos decimales y normalizado por el servidor.                                                                                                                              |
| Precio anterior                                   | Opcional, `null` para retirarlo; si se informa debe superar el precio actual. No dejar un precio anterior incompatible al cambiar el precio de venta.                                                                                                              |
| Novedad y orden                                   | `esNovedad`, `ordenCatalogo` y `ordenColor` editables con los límites existentes. El orden de catálogo y el de colores son independientes.                                                                                                                         |
| Fotografías, portada, orden y textos alternativos | Editables mediante el recorrido de galería, con las condiciones del apartado siguiente. No aceptar URLs arbitrarias en el PATCH comercial.                                                                                                                         |
| Grupo, marca, modelo, códigos y color             | Fijos en esta entrega para un publicado, incluidos nombre y hexadecimal de color. Evita reasignar la ficha a otro modelo/color y conserva el puente compatible. Otro modelo/color se crea como otra ficha; una corrección de identidad requiere un alcance propio. |
| UUID, código interno, slug, SKU y talla existente | Inmutables. Mantener `SHO-…`, enlaces y SKU actuales; no recalcularlos por editar el nombre. La regla `[MARCA]-[MODELO]-[COLOR]-[TALLA]` y `40P5` sigue aplicándose en el backend a variantes nuevas.                                                              |
| Stock, reservas, habilitación y responsables      | No pertenecen al PATCH comercial. El stock usa movimientos; responsable y fecha proceden del servidor.                                                                                                                                                             |

No se propone incorporar en este PATCH nuevas tallas, borrar variantes o cambiar `habilitada`. El borrador conserva su alta de tallas existente. La ampliación de variantes de publicados puede usar posteriormente `AGREGAR_VARIANTES`, SKU generado por NestJS y stock inicial cero, con su propia confirmación y controles sobre reservas y última variante habilitada. Su presencia en la demostración no la convierte en parte de esta entrega.

Para conservar `PUBLICADO`, validar el resultado completo con las reglas compartidas de [RequisitosPublicacion](../src/productos/publicacion/requisitos-publicacion.ts): identidad coherente, marca/categoría activas, precio válido, al menos una variante habilitada y galería disponible. Se admite stock cero. Un producto con datos antiguos incoherentes debe devolver incidencias concretas; no se reparan SKU o relaciones silenciosamente. Archivar debe seguir siendo posible aunque no cumpla requisitos de publicación.

La [API de borradores](api-borradores-productos.md) permanece exclusiva de borradores. No basta con eliminar su comprobación de estado: permite campos opcionales y datos incompletos que no deben quedar publicados.

## Estados y visibilidad

| Estado inicial           | Acción                                 | Estado final                  | Resultado                                                                                   |
| ------------------------ | -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `BORRADOR`               | Publicar, operación existente          | `PUBLICADO`                   | Exige todos los requisitos vigentes.                                                        |
| `PUBLICADO`              | Guardar datos comerciales o galería    | `PUBLICADO`                   | Valida el resultado completo y aumenta la versión una vez.                                  |
| `BORRADOR` o `PUBLICADO` | Archivar                               | `ARCHIVADO`                   | Conserva la ficha y retira su oferta pública.                                               |
| `ARCHIVADO`              | Restaurar                              | `BORRADOR`                    | Conserva identidad y datos; requiere publicación posterior para volver a venderse.          |
| `PUBLICADO`              | Guardar como borrador                  | Sin operación en este alcance | Para retirarlo se utiliza Archivar; no aceptar `estado` libre en el cuerpo.                 |
| `ARCHIVADO`              | Editar datos o iniciar una carga nueva | Sin operación en este alcance | Restaurar primero. La consulta y recuperación de solicitudes anteriores siguen disponibles. |

Una acción nueva con clave distinta sobre un estado que ya no admite la transición devuelve conflicto, sin generar una segunda auditoría. Una repetición con la misma clave y solicitud válida devuelve su respuesta histórica aunque el producto haya cambiado después.

Archivar no elimina filas, imágenes ni archivos Cloudinary; tampoco libera o consume reservas ni deshabilita variantes. Se puede archivar con stock o pedidos en curso. No se exige stock cero ni ausencia de reservas porque esta acción retira la oferta pública, mientras los compromisos existentes conservan sus flujos.

Archivo y restauración no requieren consultar Cloudinary ni disponer de una conexión activa al proveedor: son operaciones de MySQL sobre el estado comercial y su auditoría.

Restaurar no recupera automáticamente el estado anterior. Siempre llega a borrador, incluso si antes se archivó un publicado. No necesita requisitos de publicación para restaurarse: puede requerir correcciones de precio, marca/categoría o galería antes de publicar. Este destino fijo evita necesitar una columna de estado anterior y coincide con el listado actual.

El [catálogo](../src/catalogo/catalogo.service.ts) ya filtra `PUBLICADO`, tanto en listado como en detalle y alias. Un enlace a un archivado deja de resolver en la tienda; no debe revelar la ficha privada ni redirigir a otro color arbitrario. Los otros colores publicados mantienen sus enlaces. Los carritos antiguos conservan su SKU, pero el [checkout](../src/pedidos/pedidos.service.ts) vuelve a comprobar disponibilidad; una pantalla desactualizada no autoriza una compra.

## Fotografías y datos históricos

Ampliar las rutas de cargas y galería existentes para `BORRADOR` y `PUBLICADO`, manteniendo `ARCHIVADO` en consulta. La publicación inicial debe seguir exigiendo exclusivamente borrador. No ampliar globalmente `exigirBorrador()` porque también protege esa transición: separar la autorización de edición de fotografías de la autorización de publicación.

Para un publicado, cada guardado de galería debe dejar entre **1 y 8** fotografías disponibles del mismo producto, sin repetidas, con orden consecutivo y portada en posición cero. Para borrar su última foto se debe asociar otra en la misma operación o archivar primero; no aceptar una galería vacía mientras continúe publicado. Los borradores conservan la posibilidad de guardar una galería vacía. Aplicar también las invariantes de publicación al resultado de la galería publicada.

La carga por sí sola no sustituye la portada ni cambia la galería pública. Se completa el archivo y después se guarda la selección con versión. Si el producto se archiva mientras termina una carga, la conciliación puede confirmar el archivo iniciado; no puede asociarlo automáticamente ni publicar el producto. Consultar la carga y recuperar un guardado ya confirmado debe funcionar aunque haya cambiado el estado. Las llamadas externas permanecen fuera de la transacción SQL.

Conservar la carpeta reservada `SOHO/productos/<modelo>/<codigo-interno-color>`, la identidad única de cada archivo y la ausencia de sobrescritura. Cambiar nombre, orden o portada no mueve ni renombra recursos. Reutilizar [archivos](../src/productos/fotografias/archivos-producto.service.ts), [galería](../src/productos/fotografias/galeria-producto.service.ts) y [mantenimiento](../src/productos/fotografias/mantenimiento-fotografias.service.ts), con su protección de referencias.

`PedidoArticulo` ya conserva nombre, SKU, color, talla, imagen y precio unitario comprados, además de `archivoImagenId`. El checkout copia esos datos y conecta el archivo vigente al crear el pedido. Por eso una edición posterior no debe actualizar artículos, unidades, totales o imágenes de pedidos anteriores. Quitar una foto de la galería no elimina el archivo utilizado por esos pedidos. La limpieza actual vuelve a comprobar referencias de galería y pedidos; conservar ese bloqueo, las imágenes de proveedor `LEGADO` y las referencias heredadas durante esta ampliación.

Fuentes: [esquema de artículos y archivos](../prisma/schema.prisma), [creación de pedidos](../src/pedidos/pedidos.service.ts) y [API de fotografías](api-fotografias-productos.md).

## Reservas, pagos y compras concurrentes

| Operación o situación                    | Comportamiento que debe conservarse                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cambio de precio y carrito abierto       | Una compra nueva compara el precio esperado. Si cambió, `PRECIO_CAMBIADO`; no aceptar el importe viejo ni alterar pedidos confirmados.                                                                              |
| Archivo y checkout simultáneos           | Si la compra confirma antes, el pedido conserva sus condiciones; si el archivo confirma antes, no se crea una compra nueva del producto. Comprobar esa carrera en MySQL temporal.                                   |
| Cambio de portada y checkout simultáneos | El pedido recibe una imagen y referencia coherentes, anteriores o posteriores al cambio, sin un archivo borrado durante la asociación.                                                                              |
| Reservas pendientes u observadas         | Conservan su política histórica, plazo y contadores. El archivo no renueva plazos ni decide liberar o retener.                                                                                                      |
| Pago aprobado                            | Conserva sus importes, comprobante y reservas. Se puede preparar, despachar y entregar el pedido según sus reglas actuales aunque la ficha esté archivada.                                                          |
| Recuperación por vencimiento             | El servicio actual comprueba habilitación, stock y política del pedido, sin exigir publicación del producto. Conservar esa recuperación administrativa para pedidos existentes; archivar no cambia la habilitación. |
| Cancelación y vencimiento                | Conservan sus acciones explícitas o automáticas. No se añade cancelación, reembolso o liberación por archivar.                                                                                                      |
| Movimiento manual de inventario          | Sigue disponible para fichas archivadas. Reponer stock no restaura ni publica. El movimiento cambia su versión física; la edición comercial no cambia esa versión.                                                  |

La versión de `Producto` protege información comercial, estado y galería. `Variante.versionExistencias` protege el físico. Reservar o liberar unidades no incrementa por sí solo ninguna de esas versiones comerciales. No rechazar un cambio de nombre porque cambió el reservado ni copiar contadores de un formulario sobre las variantes.

Fuentes: [pagos](../src/pedidos/pagos/pagos-pedidos.service.ts), [envíos](../src/pedidos/envios/envios-pedidos.service.ts), [recuperación](../src/pedidos/reservas/recuperacion-reservas.service.ts), [inventario](../src/inventario/movimientos-inventario.service.ts) y [carrito](../../soho-frontend/src/app/tienda/carrito/servicios/carrito-demostracion.ts). El nombre heredado de este último archivo no implica que el checkout omita la API real.

## Esquema disponible

| Estructura existente                                              | Uso para esta ampliación                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Producto.estado`, `version`, `actualizadoPorId`, `actualizadoEn` | Transición y edición con concurrencia y último responsable.                                                    |
| `OperacionProducto`                                               | Auditoría por acción: responsable, fecha, antes/después, versiones, clave única, hash y respuesta recuperable. |
| `TipoOperacionProducto`                                           | Ya incluye `ACTUALIZAR`, `ARCHIVAR`, `RESTAURAR` y `ACTUALIZAR_GALERIA`.                                       |
| `ArchivoImagen` e `ImagenProducto`                                | Galería por ficha, identidad del recurso, portada/orden y limpieza diferida.                                   |
| `PedidoArticulo` y `PedidoArticuloUnidad`                         | Datos e importes históricos independientes de la ficha comercial vigente.                                      |
| Variante y reservas                                               | Conservan UUID, SKU, físico y compromisos existentes. No requieren cambios por archivar/restaurar.             |

La [novena migración](../prisma/migrations/20261115000000_expansion_productos_color/migration.sql) ya incluye los valores del enum en MySQL y los `CHECK` de operaciones: toda acción distinta de crear exige versión anterior y posterior igual a anterior más uno, copias de objeto y hash válido. No basta con que el enum aparezca en Prisma: también está preparado en el SQL existente.

Para este alcance no hacen falta `archivadoEn`, `estadoAnterior`, una nueva tabla de historial ni otros campos de recuperación. La fecha y el responsable del archivo están en su operación. No se propone motivo obligatorio porque la pantalla actual no lo solicita. Una futura exigencia de motivo o programación editorial debe analizarse aparte.

No corresponde ejecutar migraciones, `db:generate`, seeds ni conversión para realizar este análisis. La implementación propuesta tampoco cambia Prisma; las once migraciones actuales se conservan.

## Contratos propuestos para implementar

Estas rutas nuevas son una **propuesta**, no endpoints disponibles:

| Método y ruta                                | Cuerpo o propósito                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/admin/productos/:id/publicado`   | `claveSolicitud`, `version` y al menos un campo comercial permitido. Solo estado `PUBLICADO`; tipo de operación `ACTUALIZAR`. |
| `POST /api/admin/productos/:id/archivo`      | Solo `claveSolicitud` y `version`. `BORRADOR` o `PUBLICADO` → `ARCHIVADO`; tipo `ARCHIVAR`.                                   |
| `POST /api/admin/productos/:id/restauracion` | Solo `claveSolicitud` y `version`. `ARCHIVADO` → `BORRADOR`; tipo `RESTAURAR`.                                                |

Se conservan `PATCH :id/borrador`, `POST :id/publicacion`, `POST :id/fotografias`, `PATCH :id/galeria` y sus consultas. Las dos rutas de fotografías ampliarían sus estados admitidos como se describe arriba. Recuperar cualquier operación comercial utiliza el `GET /api/admin/productos/operaciones/:clave` existente; no crear otro almacén de claves o historial.

Todas las escrituras exigen ADMIN, CSRF, origen permitido, cuerpo estricto, `no-store`, clave UUID y versión entera con margen para incrementarse. Rechazar campos de identidad, `estado`, stock, reservas, fechas y responsable enviados por el cliente. Mantener el límite administrativo existente.

Devolver `{ producto, operacion: { claveSolicitud, tipo, versionAnterior, versionPosterior } }`, siguiendo publicación y borradores. La galería conserva además su estructura actual. Los tipos y adaptadores Angular deberán admitir las nuevas operaciones sin confundir `ACTUALIZAR` de borrador con `ACTUALIZAR` de publicado: ruta, contexto y cuerpo exactos forman parte de la solicitud guardada y de su hash.

Separar los errores de versión/estado/clave incompatibles (409), datos incompletos del resultado publicado (422), campos inválidos (400), acceso (401/403), inexistencia (404) y respuesta incierta. No convertir una respuesta de publicación incompleta en un guardado parcial.

## Transacciones y recuperación

Reutilizar los servicios existentes de autorización, transacciones, identidad, requisitos y fotografías. Las piezas nuevas se generarán posteriormente con `npx.cmd --no-install nest generate <tipo> <ruta>`, desde `soho-backend`, adaptando ESM `.js`. En este análisis no se ejecuta el generador.

Cada escritura debe bloquear el producto, releer su estado y versión y volver a autorizar después de esperar bloqueos. Recuperar primero una operación repetida válida antes de exigir el estado de una operación nueva. El hash debe incorporar operación, ruta/producto y datos normalizados; una clave de otro administrador, producto, ruta o cuerpo no autoriza escrituras ni recuperación ajena.

Bloquear y releer las relaciones compartidas que se validan, siguiendo los recorridos existentes de publicación, galería y checkout. La edición de fotos debe coordinarse con el bloqueo de producto y archivo utilizado por el trabajador de limpieza. No introducir llamadas Cloudinary dentro de la transacción ni un segundo mecanismo de reintentos.

El checkout ya toma bloqueos conjuntos de variantes y datos comerciales y después bloquea las fotografías; publicación empieza por el producto. No prometer ausencia de deadlocks ni imponer un orden nuevo solo en una parte: conservar el reconocimiento y los tres intentos acotados de [EscrituraAutorizadaService](../src/autenticacion/seguridad/escritura-autorizada.service.ts), y probar las carreras. Un agotamiento no permite reenviar con otra clave sin consultar el resultado.

Actualizar estado/datos/galería, aumentar una sola vez la versión comercial y crear la auditoría y respuesta en la misma transacción. Si falla la auditoría o una validación, revertir el conjunto. La unicidad global de clave debe proteger también carreras entre productos distintos. Una repetición no incrementa otra vez la versión ni repite limpieza, publicación o movimiento.

Tras un COMMIT cuya respuesta se perdió, conservar clave y cuerpo originales. La consulta por clave acredita lo confirmado, incluso si después se archivó/restauró otra vez; luego consultar la ficha vigente. Un 404 de recuperación mientras la escritura pudo estar en curso no demuestra que fallara. Si solo falla la recarga del listado/resumen después del éxito, reintentar lecturas sin repetir la acción.

## Conexión Angular posterior

Mantener las pantallas existentes y la separación entre demostración y API. Habilitar capacidades específicas de edición de publicados, archivo y restauración; no cambiar `soloLectura` o el indicador global heredado para activar a la vez acciones pendientes.

En el editor publicado, habilitar únicamente los campos autorizados y fotografías. Mostrar **Guardar cambios** y explicar su efecto en la tienda; conservar identidad y variantes en consulta. No ofrecer Guardar borrador para un publicado ni trasladar los radios de estado de la demostración. Un archivado permanece en consulta hasta restaurar. El formulario de borradores conserva su funcionamiento.

Archivar y restaurar requieren confirmación con el producto identificado. Archivo explica que se retira de nuevas compras y conserva pedidos/reservas; restauración explica que vuelve como borrador. La versión debe proceder del detalle vigente, no de una fila antigua. Si aparece conflicto después de consultar, conservar los cambios y exigir actualización explícita antes de volver a confirmar.

Ampliar la recuperación comercial existente con rutas y tipos estrictos; no inventar una segunda recuperación para cada botón. Actualmente el servicio Angular solo acepta cuatro tipos y deduce `ACTUALIZAR` como ruta de borrador. Además, un registro local mal formado devuelve `null`: al ampliar este recorrido, un pendiente inválido debe bloquear otra escritura y mostrar una recuperación asistida, conservando el registro para no perder una clave potencialmente enviada. No basta con ampliar una unión TypeScript.

Conservar protección de navegación/cierre, campos ante rechazo, foco y carga, doble clic, sesión por administrador y la solicitud exacta antes del POST/PATCH. Una solicitud incierta impide otra escritura comercial del mismo contexto hasta resolverse. Archivo/restauración desde el listado deben respetar también un pendiente comercial iniciado en el editor.

Después del éxito recargar listado, detalle y resumen preservando filtros y página; consultar la situación vigente si una fila desaparece del filtro. No incorporar al historial físico un movimiento por archivar/restaurar: no lo hay. Reutilizar el mecanismo de actualización existente donde corresponda.

Fuentes: [recuperación comercial Angular](../../soho-frontend/src/app/administracion/productos/servicios/edicion-productos-api.ts), [contratos del editor](../../soho-frontend/src/app/administracion/productos/modelos/edicion-productos-api.ts), [listado](../../soho-frontend/src/app/administracion/productos/paginas/listado-productos/listado-productos.html) e [integración del editor](../../soho-frontend/docs/integracion-edicion-productos.md).

## Orden de implementación recomendado

1. **API de archivo y restauración**, sin cambiar Prisma: contratos estrictos, versión, responsable, auditoría, recuperación, estados válidos y pruebas de conservación de reservas/pedidos y carrera con checkout. Mantener todavía sus botones reales restringidos.
2. **API de edición de publicados y ampliación de fotografías**: campos comerciales permitidos, invariantes de publicación, galería no vacía, protección histórica y pruebas de precio/portada frente a checkout y limpieza. Reutilizar componentes sin convertir la API de borradores en una edición genérica.
3. **Integración Angular de las operaciones verificadas**: editor, confirmaciones de archivo/restauración, capacidades, recuperación y actualización de consultas. Revisar en escritorio, tableta y móvil conservando las interfaces actuales.

La entrega inmediata recomendada es el punto 1. Los puntos siguientes describen continuidad y no amplían por sí solos una autorización de implementación. No se necesita que el usuario aplique otra migración para empezar esa API.

## Comprobaciones exigibles a la implementación

| Grupo             | Casos mínimos                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acceso y contrato | ADMIN/CLIENTE/anónimo, CSRF, origen, campos extra, UUID/versión inválidos, responsable del servidor y revocación mientras espera bloqueo.                                                                   |
| Estados           | Archivar borrador/publicado con datos incompletos o stock; restaurar siempre a borrador; rechazar transición nueva incompatible; no publicar al restaurar.                                                  |
| Conservación      | Mismos SKU/UUID, códigos, slug, imágenes, habilitación, físico, reservas, pagos, comprobantes, importes y versiones de pedidos antes/después del archivo y restauración.                                    |
| Comercial         | Límites de textos/importes, categoría/marca inactivas, precio anterior incompatible, stock cero permitido, no cambiar identidad y no editar archivados.                                                     |
| Fotos             | Última imagen de publicado, archivo ajeno/no disponible, carga que termina después del archivo, cambio de portada, referencia de pedido conservada y carrera con limpieza.                                  |
| Concurrencia      | Dos administradores con la misma versión; edición/archivo/publicación/galería cruzadas; checkout frente a precio, archivo y portada; movimientos y despacho sin sobrescribir inventario.                    |
| Recuperación      | COMMIT sin respuesta, misma clave/cuerpo, clave de otra cuenta o producto, 404 transitorio, carrera de clave entre productos, resultado histórico seguido de detalle vigente y rollback si falla auditoría. |
| Angular           | Capacidades independientes, campos conservados, dobles clics, pendiente inválido, salida protegida, reintento solo de consultas tras éxito y filtros/página conservados.                                    |

Este análisis se realizó leyendo fuentes, esquema, migraciones y documentación. No se ejecutaron pruebas de implementación, servidor, migraciones ni operaciones externas. Se conserva una comparación de hashes de fuentes de Angular/backend y Prisma en `.checkout-review/analisis-productos-publicados/`; la validación funcional de las rutas propuestas corresponde a las entregas posteriores.
