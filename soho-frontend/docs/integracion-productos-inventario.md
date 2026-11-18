# Consulta administrativa de productos e inventario

`/admin/productos` y el inventario del Dashboard utilizan la [API administrativa](../../soho-backend/docs/api-productos-administracion.md). La consulta inicial se amplió con la [edición real de borradores, fotografías y publicación](integracion-edicion-productos.md) y los [movimientos manuales](integracion-movimientos-inventario.md). El usuario confirmó aplicadas las once migraciones, incluida la undécima necesaria para movimientos; esta integración Angular no añade migraciones.

## Fuente real

`ProductosAdministracion` es un token de inyección con contrato independiente que proporciona `ProductosAdministracionApi` por defecto; `app.config.ts` conserva su vinculación explícita. La API no hereda de la clase de demostración. La implementación local anterior se aisló exclusivamente como fixture de pruebas. El listado, el detalle, el historial y los formularios utilizan solo los componentes y fuentes reales. Consultar [Limpieza de Productos e inventario](limpieza-productos.md).

El adaptador administrativo mantiene UUID, slug, código interno y SKU separados. Conserva el precio pendiente en `null` y lo muestra como pendiente. A diferencia del adaptador público del catálogo, mantiene los contadores reales de stock físico y reservado. Verifica importes, tipos, disponibilidad y resúmenes antes de aceptar una respuesta.

El servicio cancela solicitudes anteriores por canal y descarta respuestas de otra identidad o revisión de sesión. Al perder acceso, limpia productos, movimientos, detalle, opciones y resumen. Las consultas requieren ADMIN en el backend.

## Listado y detalle

El listado envía búsqueda, marca, categoría, estado, disponibilidad, orden y página al servidor. Los filtros de productos permanecen en la URL; los cambios de filtro u orden regresan a la primera página. Los estados de carga, error y vacío proceden de la API. Se retiraron los controles y las ramas de escenarios de demostración; el parámetro antiguo `vista` se ignora.

Las marcas y categorías proceden de sus opciones administrativas, incluidas las que no tienen productos publicados. Un fallo de estas opciones permite reintentarlas. El listado no calcula totales globales a partir de la página cargada.

El panel lateral consulta el detalle por UUID y muestra datos generales, variantes habilitadas y deshabilitadas y cantidades físicas, reservadas y disponibles. Permite abrir los movimientos de ese producto. Los enlaces de alertas del Dashboard utilizan `producto` en la URL del listado para abrir el detalle, sin dirigir a un formulario de edición pendiente.

## Historial

La pestaña de movimientos consulta la API con búsqueda por SKU, producto, motivo o referencia, tipo, origen, fechas de Perú y página. Puede limitarse al UUID de un producto y volver al historial de todos los productos. Tiene carga, error y reintento propios y valida el rango de fechas.

Incluye movimientos históricos de stock inicial, manuales existentes y salidas por despacho. Muestra responsables cuando existen, pedido asociado al despacho y saldos históricos. Consultar no ejecuta movimientos ni modifica reservas.

## Dashboard

El resumen de inventario se consulta independientemente del resumen de ventas y pagos. Muestra los totales globales de variantes bajas o agotadas y hasta siete alertas, con enlace al inventario. El indicador no utiliza únicamente la página visible del listado. Los errores de inventario se presentan con su propio reintento y no se convierten en un cero de existencias confirmado.

## Escrituras integradas y pendientes

La [creación y edición real de borradores, fotografías y publicación](integracion-edicion-productos.md) ya está integrada. El listado permite agregar productos y editar los borradores reales. Los [movimientos manuales](integracion-movimientos-inventario.md) también están conectados, con búsqueda remota, confirmación, protección de reservas y recuperación por clave. La [edición de publicados y archivo/restauración](integracion-publicados-archivo.md) ya está integrada mediante capacidades específicas, confirmaciones, protección de datos históricos y recuperación compartida con el editor.

El código interno identifica un modelo y color; las tallas comparten esa ficha y reciben el SKU del backend, con `40.5` representado como `40P5`. Los otros colores enlazan entre fichas del mismo grupo. Las fotografías utilizan Cloudinary y la organización `SOHO/productos/<modelo>/<código-color>` definida por el usuario, conservando la identidad estable del recurso y las fotografías históricas de pedidos.

## Evidencia

La [conversión por color](../../soho-backend/docs/conversion-productos-color.md) ya fue aplicada por el usuario y comprobada mediante lectura. Mantiene UUID, SKU, stock y referencias anteriores; la tienda enlaza otras fichas del modelo y el carrito sigue utilizando SKU. Su entrega original pasó 739 pruebas Angular. La entrega posterior del editor real y su evidencia se describen en [Integración de edición de productos](integracion-edicion-productos.md).

El diseño previo a las escrituras está documentado en la [propuesta de productos por modelo y color](../../soho-backend/docs/propuesta-productos-por-color.md). El esquema activo y la conversión aplicada conservaron SKU, referencias e imágenes históricas. La integración vigente mantiene enlaces anteriores y carritos por SKU.

Las pruebas y recorridos de esta entrega se conservan en `.checkout-review/productos-inventario/`, desde la raíz SOHO. Los datos de integración pertenecen a MySQL temporal; no se utiliza `soho_db` para prepararlos. El cierre de validación y sus resultados se recogen en [Estado de integración](../../soho-backend/docs/estado-integracion.md).
