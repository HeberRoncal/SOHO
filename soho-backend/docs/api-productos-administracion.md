# Consulta administrativa de productos e inventario

Esta entrega conecta la consulta de productos e inventario con MySQL. Conserva el esquema y las ocho migraciones existentes. No incorpora operaciones de creación, edición, archivo ni movimientos manuales.

Actualización posterior: la conversión por color ya está aplicada y comprobada en la base local con diez migraciones. La [API de borradores](api-borradores-productos.md) añade creación y edición exclusiva de borradores, versiones, códigos/SKU, auditoría y recuperación por clave, conservando los endpoints de consulta aquí descritos. Las referencias a escrituras pendientes de esta entrega inicial se mantienen como contexto histórico; la [API de fotografías Cloudinary](api-fotografias-productos.md) y la [publicación de borradores](api-publicacion-productos.md) ya están implementadas; formularios Angular, edición de publicados y movimientos manuales siguen pendientes.

## Organización y permisos

`ProductosModule` está registrado en `AppModule` y utiliza `PrismaModule`. Las piezas nuevas se generaron desde `soho-backend` con Nest CLI:

```powershell
npx.cmd --no-install nest generate module productos
npx.cmd --no-install nest generate controller productos/administracion-productos --flat
npx.cmd --no-install nest generate service productos/consulta-productos --flat
npx.cmd --no-install nest generate class productos/dto/consulta-productos
npx.cmd --no-install nest generate class productos/dto/respuesta-productos
```

Los DTO y sus pruebas se reorganizaron en `productos/dto/`; las importaciones ESM conservan `.js`. Se reutiliza `ErrorCatalogoFilter` para devolver 503 ante errores de persistencia sin exponer SQL.

Todas las rutas requieren sesión y rol `ADMIN`, aplican el límite de acceso administrativo existente y devuelven `Cache-Control: no-store`. Las consultas no modifican inventario, reservas, pagos ni pedidos. Invitados reciben 401 y clientes sin rol administrativo reciben 403. No se exige confirmación ni CSRF adicional en estas peticiones GET.

## Rutas

| Método y ruta                           | Contenido                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/admin/productos`              | Productos, paginación y conteos globales                                  |
| `GET /api/admin/productos/opciones`     | Marcas y categorías, incluidas las que aún no tienen productos publicados |
| `GET /api/admin/productos/:id`          | Datos y variantes del producto, identificado por UUID                     |
| `GET /api/admin/inventario/movimientos` | Historial paginado de movimientos existentes                              |
| `GET /api/admin/inventario/resumen`     | Conteos y primeras siete alertas, con totales globales                    |

Las respuestas incluyen `capacidades: { escrituraDisponible: false }`. No existen rutas de escritura en este módulo. Las rutas de detalle, opciones y resumen rechazan parámetros de consulta no previstos.

Las migraciones `20261118020000_categorias_iniciales` y `20261118040000_nombres_categorias_comerciales` dejan las categorías con sus nombres comerciales exactos: Urbanas, Running/Gym, Básquet, Skate y Clásicos, conservando las relaciones existentes con productos. `20261118030000_orden_catalogo_y_marcas_iniciales` establece el orden del formulario y garantiza las diez marcas del menú aunque todavía no tengan productos. Estas migraciones no cargan productos de demostración; el seed no debe ejecutarse en producción.

## Listado

| Parámetro            | Valores o regla                                                                |
| -------------------- | ------------------------------------------------------------------------------ |
| `busqueda`           | Hasta 120 caracteres; nombre, código interno, código de modelo, marca o SKU    |
| `marca`, `categoria` | Slug de la opción correspondiente                                              |
| `estado`             | `publicado`, `borrador` o `archivado`; omitido incluye publicados y borradores |
| `disponibilidad`     | `disponible`, `bajo` o `agotado`                                               |
| `orden`              | `catalogo`, `nombre`, `precio-ascendente`, `precio-descendente` o `stock`      |
| `pagina`             | Entero de 1 a 100000; predeterminado 1                                         |
| `limite`             | Entero de 1 a 50; predeterminado 20                                            |

La búsqueda trata `%`, `_` y la barra inversa como texto literal. Los filtros y el orden se resuelven antes de paginar, mediante consultas parametrizadas. El UUID desempata el orden. Los precios pendientes quedan al final tanto en orden ascendente como descendente. Una página posterior a la última devuelve una lista vacía conservando los totales.

`resumen` contiene publicados, borradores, archivados y número total de variantes de la base; no representa únicamente el filtro o página actual. Las consultas de listado, movimientos y resumen utilizan una transacción de lectura `RepeatableRead` para mantener coherentes sus filas y conteos.

## Identidad, precios e inventario

La respuesta distingue `id` UUID, `slug` público, `codigoInterno`, `codigoModelo` y `sku`. Los códigos y SKU existentes se consultan sin regenerarlos. Un SKU sigue identificando una combinación de color y talla EU. El precio es común al producto y se envía como cadena decimal con dos posiciones; los datos pendientes de borrador permanecen en `null`.

Cada variante incluye su UUID, SKU, color, talla, habilitación, `existencias`, `cantidadReservada`, `disponible` y `faltante`. También se consultan las variantes deshabilitadas.

```text
disponible = habilitada ? máximo(0, existencias − cantidadReservada) : 0
faltante = máximo(0, cantidadReservada − existencias)
```

El resumen de cada producto suma stock físico y reservado de todas sus variantes; el disponible solo procede de las habilitadas. Stock bajo significa entre una y dos unidades disponibles; agotada significa cero disponible en una variante habilitada. El filtro `bajo` encuentra productos con alguna variante habilitada baja o agotada; `agotado` encuentra productos sin disponible total, incluidos los que aún no tienen variantes. Un déficit físico no reduce ni libera reservas. SQL convierte los contadores a valores con signo antes de restarlos.

## Historial

Admite `producto` UUID, `sku` exacto, `busqueda` de hasta 120 caracteres, `tipo` (`entrada`, `salida`, `ajuste`), `origen` (`manual`, `stock-inicial`, `envio-pedido`), `desde`, `hasta`, `pagina` y `limite`.

Las fechas usan `YYYY-MM-DD` y se interpretan como días de Perú: desde las 00:00 UTC−05 hasta las 00:00 del día posterior al final solicitado. Se rechazan fechas inexistentes y rangos invertidos. Se ordena por fecha e UUID descendentes.

Los movimientos conservan delta, saldo anterior y posterior, reserva y habilitación históricas, disponible calculado en ese momento, motivo y referencia. Las cargas históricas pueden tener responsable nulo. El responsable administrativo se proyecta con UUID y nombre; no se exponen correo ni credenciales. Las salidas `envio-pedido` incluyen el código del pedido asociado y se muestran sin ejecutar otro descuento. Cambiar el inventario actual no reescribe el saldo histórico.

## Alertas

El resumen considera variantes habilitadas de productos no archivados, con disponible menor o igual a dos. Incluye borradores. Entrega `alertasTotal`, `agotadasTotal`, `faltantesTotal`, conteos globales y hasta siete alertas ordenadas priorizando faltantes y disponibilidad. Cada alerta incluye identidad de producto y variante, color, talla, stock físico, reservado, disponible, faltante e imagen cuando existe.

Estos totales no dependen de que el listado de productos esté abierto ni de sus filtros o paginación. Las incidencias comerciales generales por faltantes, especialmente las de pagos aprobados, continúan pendientes de una entrega posterior.

## Errores y alcance posterior

Parámetros desconocidos, repetidos o inválidos devuelven 400; un UUID válido inexistente devuelve 404; los fallos de persistencia se presentan como 503 recuperable. Los DTO rechazan listas y objetos donde se espera texto.

La creación y edición, almacenamiento de nuevas fotografías, publicación, archivo y movimientos manuales requieren operaciones posteriores con autorización transaccional, control de concurrencia y reintentos sin duplicar. No se habilita la demostración como sustituto de una escritura real.

Para esa entrega, el usuario definió el SKU como `[MARCA]-[MODELO]-[COLOR]-[TALLA]`, con los códigos correspondientes y `P` como representación del punto decimal de la talla. Por ejemplo: `NK-AF107-BL-40` y `NK-AF107-BL-40P5` para EU 40 y 40.5. La generación futura será del backend, exigirá marca y código de modelo definidos y conservará los SKU ya guardados. El código interno del producto seguirá siendo independiente. Esta especificación no habilita aún rutas de escritura ni cambia el generador de demostración.

El usuario también definió un código interno distinto por modelo y color: por ejemplo, `SHO-0012` para el Blanco y `SHO-0013` para el Negro, cada uno agrupando sus tallas. La consulta aquí documentada aún utiliza la estructura vigente de un `Producto` con varios colores. Antes de las escrituras se debe definir su adaptación y la agrupación de otros colores del mismo modelo; revisar especialmente la unicidad de `codigoModelo` y la correspondencia de los códigos existentes. La futura migración debe conservar las variantes, sus SKU y las referencias de pedidos e inventario.

Para las fotografías de productos, el usuario eligió Cloudinary. La propuesta de integración es subir archivos desde NestJS después de autorizar ADMIN y validar el contenido, tamaño y formato. Las credenciales se configurarán exclusivamente en el backend mediante `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`; el secreto no se enviará a Angular. La configuración y las subidas autenticadas se apoyarán en la [integración oficial de Node.js](https://cloudinary.com/documentation/node_integration) y la [guía oficial de cargas](https://cloudinary.com/documentation/upload_images).

El esquema futuro debe guardar la identidad Cloudinary del recurso (`asset_id` y `public_id`), URL HTTPS de entrega y versión, junto con metadatos de archivo, orden y texto alternativo según el contrato definitivo. La galería pertenecerá al producto de modelo y color. Una sustitución creará un recurso nuevo cuando sea necesario conservar la imagen histórica; quitar una asociación de galería no implica borrar un archivo usado por un pedido. También deben definirse el tratamiento de subidas pendientes, la recuperación de respuestas inciertas y la limpieza de archivos sin asociación. Los comprobantes privados de pago siguen fuera de este cambio. No se han instalado dependencias, configurado credenciales ni habilitado cargas reales como parte de esta definición.

La integración Angular se documenta en [Consulta administrativa de productos e inventario](../../soho-frontend/docs/integracion-productos-inventario.md).

## Organización de Cloudinary

La implementación vigente está en la [API de fotografías de borradores](api-fotografias-productos.md). La cuenta configurada utiliza modo dinámico, comprobado mediante lectura autenticada. Los párrafos de propuesta siguientes conservan el contexto de diseño; la guía de implementación describe las rutas, validaciones y procesador reales.

La [conversión y adaptación de lecturas](conversion-productos-color.md) ya están implementadas, probadas en entornos aislados y comprobadas en la base local tras su aplicación por el usuario. El listado, detalle, inventario y movimientos agrupan por ficha de color y utilizan sus variantes directas, conservando las relaciones anteriores durante la transición. La API de borradores añade `version`, referencia `grupoModelo` y `ordenColor` a los productos administrativos, y códigos de marca, grupos con versión y tallas a las opciones. El resto del contrato se conserva.

La estructura final y su estrategia de migración están en la [propuesta de productos por modelo y color](propuesta-productos-por-color.md) y el [esquema objetivo independiente](propuestas/productos-por-color.prisma). La [primera ampliación compatible](esquema-productos-expansion.md) ya está preparada como novena migración, sin dividir productos, habilitar rutas de escritura ni configurar Cloudinary. Esta API de consulta sigue utilizando el contrato vigente hasta su adaptación coordinada.

La referencia visual elegida por el usuario organiza la Media Library bajo `SOHO/marcas` y `SOHO/productos`, con una carpeta por modelo dentro de productos. Se propone completar esa estructura con una subcarpeta por producto de modelo y color:

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

Las tallas de cada producto comparten su galería. Los nombres visibles de las fotos pueden identificar las vistas frontal, lateral o posterior; la identidad persistida del recurso debe ser única y no depender de su posición como portada. No sobrescribir una imagen histórica por reutilizar un nombre visible.

Se verificará el modo de carpetas de la cuenta antes de la integración. En modo dinámico, `asset_folder` controla la ubicación visible y se gestiona de forma independiente del `public_id`; en modo fijo se utiliza `folder`, que también afecta al identificador de entrega. La aplicación conservará los identificadores y la URL de la respuesta de Cloudinary sin reconstruirlos desde el árbol visual. Consultar [Modos de carpetas de Cloudinary](https://cloudinary.com/documentation/folder_modes). No se han creado carpetas ni movido activos como parte de esta definición.
