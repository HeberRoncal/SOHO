# Edición de publicados, fotografías, archivo y restauración

Las pantallas de Productos e inventario se conectan con las [API de edición comercial y fotografías de publicados](../../soho-backend/docs/api-edicion-publicados.md) y [archivo/restauración](../../soho-backend/docs/api-archivo-productos.md). Esta entrega conserva el diseño administrativo, los formularios de borradores y la separación de las demostraciones.

## Edición de un publicado

En el listado, **Editar** abre la ficha vigente y conserva en el enlace de regreso la búsqueda, estado, orden y página. El editor permite nombre, descripción, categoría activa, género, precios, novedad, orden en catálogo y orden entre colores. El botón se llama **Guardar cambios**. El producto conserva su publicación y los cambios confirmados se aplican a consultas y compras posteriores.

Modelo, marca, color, códigos y SKU permanecen en consulta. No se permite generar tallas, cambiar habilitación o escribir físico/reservado desde este recorrido. El cuerpo comercial contiene solamente los campos permitidos y utiliza la ruta `PATCH :id/publicado`, con versión y clave propias. La edición de borradores continúa utilizando `PATCH :id/borrador`; un archivado permanece en consulta y no ofrece un enlace público.

El nombre admite hasta 180 caracteres. Los órdenes son enteros de cero a 4294967295. Un publicado requiere categoría y precio positivo; el precio anterior, si existe, debe superar al actual. El backend valida nuevamente el resultado completo, incluidas identidad, marca/categoría activas, variantes y fotografías. Un rechazo conserva los campos locales y explica las incidencias recibidas.

## Fotografías

Las cargas multipart de JPEG, PNG o WebP de hasta 5 MB utilizan el recorrido Cloudinary existente. Una carga disponible se agrega a la selección y se guarda mediante **Guardar galería**; subir por sí solo no sustituye la portada ni cambia la galería pública.

En publicados se conservan entre **una y ocho imágenes**. La interfaz bloquea quitar la última y el guardado de una selección vacía; para sustituirla se agrega primero otra. La primera posición es la portada. El orden y los textos alternativos se guardan con versión y clave; las fotografías de pedidos anteriores siguen protegidas por el backend. Las fichas archivadas conservan consulta y recuperación de cargas iniciadas, sin permitir nuevas escrituras.

## Archivo y restauración

El listado habilita **Archivar** en borradores y publicados y **Restaurar como borrador** en archivados. Cada acción consulta el detalle actual antes de mostrar su confirmación; no utiliza una versión inferida de una fila antigua. El diálogo identifica nombre, código interno, estado y unidades reservadas.

La confirmación de archivo explica que retira la oferta para nuevas compras y conserva SKU, fotografías, físico, reservas y pedidos. Restaurar explica que la ficha vuelve siempre como borrador y necesitará publicación posterior. Los errores de versión bloquean otra confirmación hasta elegir **Actualizar ficha**. Durante el envío se bloquean dobles clics, cierre y navegación.

Estas acciones utilizan capacidades específicas de edición de publicados, archivo y restauración; no se activa un permiso general ni se cambia la capacidad heredada `escrituraDisponible: false` de las consultas. La autorización real continúa siendo ADMIN, cookies, origen y CSRF en cada API.

## Solicitudes pendientes y resultados inciertos

La recuperación comercial comparte el registro por administrador de `sessionStorage`. Antes de escribir conserva clave, producto, ruta, método y cuerpo exactos; las ediciones añaden el contexto de borrador/publicado. Los registros anteriores de borrador sin contexto se siguen interpretando como borrador. El contexto no se envía como campo del cuerpo HTTP.

Si se pierde una respuesta, no se genera otra clave. Se ofrecen **Consultar resultado** y **Reintentar misma solicitud**. El reintento conserva ruta, versión, clave y cuerpo originales. Un rechazo de un reintento no borra una solicitud cuyo resultado anterior pudo haberse confirmado. Un 404 de recuperación no acredita que el POST/PATCH no se ejecutara. La respuesta histórica se valida y después se consulta el detalle actual, que puede reflejar acciones posteriores.

La salida del editor y del diálogo advierte de operaciones pendientes y cambios sin guardar. Al regresar al listado, **Resolver operación pendiente** permite consultar una solicitud iniciada en el editor o en archivo/restauración sin inferir una acción distinta desde otra fila. Los campos no enviados no se guardan al salir expresamente; la solicitud ya enviada conserva su recuperación en la misma pestaña y cuenta.

Un registro dañado ya no se interpreta como ausencia de operación. Bloquea nuevas escrituras y reintentos; si conserva metadatos seguros puede consultarse por su clave. Si no se puede identificar con seguridad, se conserva para revisión técnica y no se inventa una clave ni se elimina automáticamente. No se guardan cookies ni secretos en ese registro.

Las respuestas de otra cuenta o revisión de sesión se descartan. El editor y el diálogo limpian los datos privados al perder ADMIN; las consultas y cargas antiguas no se incorporan después de cambiar de ficha o identidad.

## Actualización posterior al éxito

Después de confirmar o recuperar se actualizan las consultas administrativas activas, detalle y resumen conservando filtros. El editor consulta también la galería vigente antes de continuar. Si una transición elimina la última fila de una página, el listado ajusta únicamente la página que quedó fuera de rango.

Si la escritura se confirmó y solo falla una consulta posterior, se muestra **Operación confirmada** y **Actualizar consultas**. Ese botón solo realiza lecturas; no repite el guardado ni la transición. En el editor, mientras esa actualización está pendiente se bloquean nuevos cambios de servidor.

## Validación y requisitos

Pasaron **869 pruebas Angular en 137 archivos**, compilación de producción y formato. Chrome verificó nueve recorridos completos y 18 capturas a 1440, 768 y 390 px, sin desbordamientos, imágenes fallidas ni errores JavaScript. El detector estático señaló tres imágenes sin `src` literal en editor/listado: utilizan `[src]` de Angular y se comprobaron cargadas en el navegador.

La API requiere las once migraciones existentes, incluida la undécima confirmada por el usuario. Esta entrega no modifica el backend, el esquema, el cliente generado ni las migraciones; no requiere `db:generate`, seeds o conversión del catálogo.

Las pruebas Angular incluyen contratos y rutas por contexto, sesión/CSRF, almacenamiento no disponible o dañado, recuperación histórica, reintentos, estado de confirmación, conservación de campos, galería publicada, doble envío, conflictos, navegación y consultas posteriores al COMMIT. La evidencia y el recorrido del navegador se conservan en `.checkout-review/publicados-frontend/`, desde la raíz SOHO.

Los recorridos se ejecutan con Angular compilado, NestJS real, once migraciones en MySQL temporal y Cloudinary simulado. No se escriben datos de prueba en `soho_db` ni se suben o borran archivos en la cuenta real del proveedor. Los resultados finales y la retirada del entorno figuran en `validacion.json` de esa carpeta.
