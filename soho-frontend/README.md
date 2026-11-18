# SOHO Frontend

Tienda online de zapatillas multimarca desde La Esperanza, Trujillo, La Libertad, Perú. Implementación en Angular 22 con componentes independientes, TypeScript y plantillas en modo estricto.

La [limpieza del checkout](docs/limpieza-checkout-restos.md) retiró PagoPedido y el formulario y cálculo de cupones ilustrativos del resumen. Los descuentos históricos se muestran con los importes confirmados por la API y se conservan DatosEntrega, recepción y estilos compartidos del flujo actual.

La [limpieza de Configuración e Inicio](docs/limpieza-configuracion-inicio.md) retiró el estado y guardado globales de demostración y conservó los servicios y guardas de cada apartado real. El menú móvil y las ventanas informativas viven ahora en `estructuras/componentes/panel-tienda/`.

El [nuevo checkout](docs/integracion-checkout-recepciones.md) ya conecta instrucciones verificadas, destino histórico, recepción privada, procesamiento y correcciones. Recupera envíos de cuenta/invitado tras recargar y conserva pedidos anteriores. Pasaron 1080 pruebas y ocho recorridos de Chrome con API/MySQL aislados. No necesita migración ni regenerar Prisma. `PAGOS_CHECKOUT_ACTIVO=false` sigue por defecto; la activación con receptores reales corresponde a la puesta en marcha controlada.

[Configuración → Pagos](docs/integracion-configuracion-pagos.md) ya utiliza su API real: publicaciones versionadas de Yape/Plin, datos receptores, cargas de QR y recuperación de operaciones por cuenta, con vista previa y confirmación. Pasaron 1015 pruebas y el recorrido con API/MySQL aislados y Cloudinary simulado. Sigue conectar el nuevo checkout; mantener `PAGOS_CHECKOUT_ACTIVO=false` hasta verificarlo completo.

La [administración de recepciones](docs/integracion-recepciones.md) ya está conectada: bandeja, detalle, diagnóstico, comprobantes privados e historial, registro explícito con condiciones originales y solicitudes de corrección. Conserva y recupera decisiones por cuenta al navegar o recargar la pestaña. Pasaron 964 pruebas y el recorrido Angular/NestJS/MySQL aislado. Sigue Configuración → Pagos y después el checkout; mantener `PAGOS_CHECKOUT_ACTIVO=false` hasta completar el recorrido.

El catálogo público y el detalle ya consultan MySQL mediante la API de NestJS. El arranque de ambos proyectos, el proxy, los estados y la validación están en [Integración del catálogo](docs/integracion-catalogo.md). El [checkout](docs/integracion-checkout.md) consulta cobertura y tarifas reales y permite elegir direcciones guardadas; la [integración de pedidos](docs/integracion-pedidos.md) ya crea compras y reservas, guarda comprobantes privados y consulta Mis pedidos en MySQL. Las secciones siguientes conservan el historial de la migración de interfaces.

Registro, login, edición de nombres y apellidos, recuperación de contraseña, verificación de correo, sesión tras recarga, logout y control de acceso `ADMIN`/`CLIENTE` ya están conectados al backend. La estructura administrativa muestra el usuario real y sus rutas están protegidas; las operaciones comerciales siguen en demostración. El contrato, arranque y límites están en [Integración de autenticación](docs/integracion-autenticacion.md).

La entrega de migración de interfaces desde Genspark se documenta en [Cierre de la migración](docs/cierre-migracion.md), con su alcance, validación del 13 de noviembre de 2026 y pendientes de integración con el backend.

## Desarrollo

La [administración de Clientes](docs/integracion-clientes.md) ya consulta datos reales: listado, ficha, historial y direcciones históricas paginadas, con sesión ADMIN, filtros conservados, reintentos parciales y protección de datos al cambiar sesión. Distingue cuentas y compras invitadas sin fusionarlas por correo. No requiere otra migración ni regeneración Prisma.

Desde esta carpeta:

```powershell
npm.cmd install
npm.cmd start
```

Abre http://localhost:4200. En terminales que permitan ejecutar npm directamente también puedes usar `npm start`.

## Primera entrega

- Estructura de tienda: cabecera, buscador, menú móvil y pie de página.
- El submenú de Novedades muestra directamente sus categorías, sin el título «Zapatillas» ni el enlace «Ver todas».
- En los submenús de Hombre y Mujer, «Zapatillas» es un título clicable que abre la sección completa; no aparece un enlace «Ver todas» adicional. Sus rótulos son Urbanas, Running/Gym, Básquet, Skate y Uso diario; los enlaces conservan las categorías de demostración durante esta revisión de diseño.
- La navegación de Novedades, Hombre, Mujer y Ofertas despliega las categorías de los productos publicados de cada sección. Marcas lista las marcas del catálogo. El componente `menu-categorias`, generado con Angular CLI dentro de la cabecera, se reutiliza en escritorio y en el menú móvil. En escritorio los títulos se despliegan al pasar el cursor y no tienen acción de clic; la navegación se realiza desde los enlaces del submenú y «Ver todas». Conserva acceso por teclado y Escape. En celular las secciones se despliegan al tocarlas. Al navegar se cierra el menú.
- Inicio: portada, marcas, novedades, colecciones, productos destacados y campaña.
- Tarjeta de producto, precio, iconos y ventana de diálogo reutilizables.
- Acceso desde el inicio a las páginas dedicadas de catálogo y producto.
- Página dedicada `/favoritos`, con acceso desde la cabecera y el menú móvil. Los favoritos del visitante se conservan en el almacenamiento local al recargar; la sincronización con cuentas corresponde a la integración posterior del backend.
- Imágenes y tipografías locales. Las licencias de Archivo y Geist están en `public/fuentes`.
- Modelos de producto, color, variante, marca y filtros; datos de demostración separados.

Inicio, catálogo, detalle de producto, favoritos, carrito, finalizar compra, seguimiento, acceso y Mi cuenta tienen páginas propias. La autenticación ya utiliza NestJS y MySQL. Las operaciones administrativas comerciales continúan en demostración; los precios y existencias del catálogo cargado son ilustrativos.

## Catálogo y detalle de producto

- `/zapatillas`, `/zapatillas-hombre`, `/zapatillas-mujer`, `/zapatillas-unisex`, `/zapatillas-novedades` y `/zapatillas-ofertas` comparten el mismo componente de catálogo. Cada sección determina su filtro base. Las demás selecciones se conservan como parámetros adicionales al recargar y utilizar Atrás.
- Las direcciones anteriores `/catalogo` y `/catalogo?genero=Hombre` se redirigen a las rutas nuevas, conservando los filtros adicionales y el fragmento. Los enlaces nuevos utilizan directamente las rutas de sección. La guarda `normalizar-seccion`, generada con Angular CLI, realiza esa normalización.
- `/zapatillas?novedades=1`, `/zapatillas?ofertas=1` y sus equivalentes anteriores bajo `/catalogo` se redirigen a las secciones promocionales. Al combinar filtros se conserva la sección visitada; por ejemplo, `/zapatillas-ofertas?genero=Hombre&marca=Nike`. Al desmarcar la selección que define la sección, se pasa al catálogo correspondiente a los filtros restantes.
- El botón «Filtrar y ordenar» abre un panel lateral en escritorio y celular, con fondo oscurecido, filtros aplicados, secciones desplegables y acciones para borrar o quitar filtros. La cabecera y el botón «Mostrar productos» permanecen visibles mientras se desplazan las opciones. Los cambios actualizan los resultados al instante; «Mostrar productos» cierra el panel.
- «Relevancia» es el orden predeterminado y conserva el orden base del catálogo. «Borrar todo» elimina los filtros adicionales y restablece «Relevancia», conservando la sección visitada, también en Novedades y Ofertas. El género aparece en «Filtros aplicados» y suma al contador, incluso cuando está definido por la ruta. Su etiqueta permite quitarlo individualmente y pasar al catálogo general conservando las demás selecciones. «Borrar todo» se deshabilita cuando solo queda el género propio de la sección y ya se utiliza Relevancia. Las selecciones base de Novedades y Ofertas se identifican en el título y en sus controles.
- Precio utiliza una barra con dos controles y campos «Mínimo (PEN)» y «Máximo (PEN)» sincronizados. Los límites iniciales se obtienen del catálogo publicado. El arrastre muestra los importes al instante y aplica el filtro al soltar; los campos admiten centavos y la navegación conserva los importes explícitos de la URL.
- El filtro de color y talla exige que ambos coincidan en una misma variante disponible, descontando sus reservas. Unisex utiliza el mismo producto en Hombre y Mujer.
- `/producto/:identificador`: galería de las imágenes existentes por color, ampliación, descripción, precio común del modelo, tallas disponibles, SKU, cantidad, favoritos, información de envío y productos relacionados.
- En la ficha, la imagen principal aumenta progresivamente hasta 2× en 900 ms al pasar el cursor y permite recorrer sus detalles con el puntero, dentro del mismo cuadro. Al salir del cuadro, regresa suavemente a su tamaño normal en 900 ms desde el aumento actual, conservando el último origen. Si el cursor vuelve durante el regreso, el aumento continúa desde la escala visible. Al cambiar fotografía o color, abrir la ampliación o abandonar la vista se restablece inmediatamente y se cancela cualquier animación pendiente. La directiva `zoom-imagen`, generada con Angular CLI, usa la API de animaciones del navegador para el aumento y agrupa los movimientos por fotograma para actualizar su origen sin retrasar el recorrido ni reiniciar el aumento. Con movimiento reducido se aplica el zoom directamente. En pantallas táctiles se conserva la ampliación al tocar la imagen.
- Al pulsar la imagen principal se abre el componente `visor-imagenes` a pantalla completa, con fondo claro, cierre, flechas centradas verticalmente y miniaturas superpuestas abajo. La superficie de la imagen ocupa todo el visor y continúa detrás de las miniaturas. Conserva la fotografía seleccionada y sincroniza los cambios con la galería. Dentro del visor el zoom 2× se activa y desactiva por clic o toque; pasar el cursor no lo inicia. La imagen ampliada se recorre con el cursor o mediante arrastre táctil. Cambiar fotografía o cerrar restablece el zoom. Admite flechas del teclado, Espacio/Enter para el zoom, Tab dentro del visor y Escape para cerrar y devolver el foco. Usa un diálogo nativo y respeta movimiento reducido.
- El color y la talla seleccionados se reflejan en la URL. Cambiar el color elimina la talla previa y reinicia la cantidad. Una combinación agotada o inválida nunca habilita la acción de compra.
- Las fotografías son las proporcionadas en Genspark; no se simulan ángulos adicionales. La guía explica cómo elegir la talla sin inventar equivalencias oficiales por marca.
- El botón Agregar al carrito valida la selección y agrega la variante elegida al carrito de demostración. La confirmación se presenta en el propio botón: «Agregando…» con un indicador de carga durante 500 ms, seguido de «Añadido» con un check durante 1500 ms, y regreso al estado inicial. El guardado local ocurre inmediatamente; estos tiempos pertenecen solo a la presentación. Se bloquean clics repetidos durante la confirmación y se limpian sus temporizadores al cambiar la selección o abandonar la vista. Movimiento reducido conserva los textos y desactiva el giro. Los errores de stock se muestran debajo; no se muestra el aviso anterior con «Ver carrito». Repetir un SKU suma cantidades y respeta el stock acumulado. No reserva inventario ni registra pedidos.
- Los componentes nuevos se generaron con Angular CLI y conservan `.ts`, `.html`, `.css` y `.spec.ts` separados.

## Carrito de compras

- `/carrito` es una página dedicada con productos, color, talla EU, precio unitario, cantidades, subtotales, eliminación individual y estado vacío. Cada SKU corresponde a una línea; los colores o tallas diferentes permanecen separados. Los enlaces de cada producto conservan su variante.
- La cabecera cuenta unidades, actualiza su etiqueta accesible y enlaza a la página del carrito. El menú móvil incluye el mismo destino. Se retiró la ventana temporal de carrito vacío.
- `Carrito` es el servicio utilizado por las vistas. Delega mediante `GESTOR_CARRITO` al contrato `GestorCarrito`; `CarritoDemostracion` implementa la simulación local. El carrito conserva SKU y cantidades locales; al crear un pedido, NestJS valida precios, disponibilidad y reservas en el servidor. Añadir al carrito no reserva inventario.
- La simulación guarda únicamente SKU y cantidad bajo `soho:carrito:demostracion`, con formato versionado. Al recargar, obtiene nombres, imágenes, precios y disponibilidad del catálogo. Ignora precios guardados, depura entradas inválidas y agrupa duplicados. No modifica los favoritos.
- Una variante agotada, retirada o con cantidad superior al stock bloquea la continuación. El usuario puede eliminar la línea o ajustar la cantidad a las unidades disponibles. El cálculo considera las reservas y comparte el inventario de los productos unisex. Los importes se suman en céntimos.
- `producto-carrito` muestra cada variante dentro de una tarjeta con borde, imagen grande a la izquierda, nombre, color y talla EU arriba, acciones de eliminar y favoritos a la derecha, y control de cantidad y subtotal abajo. Conserva los botones para disminuir y aumentar. Los favoritos corresponden al producto y se sincronizan con la cabecera y la página dedicada; no cambian las cantidades del carrito. En ofertas, el precio anterior tachado y el precio actual corresponden a toda la cantidad de la línea. En celular el pie ocupa el ancho de la tarjeta. `resumen-compra` es un componente de presentación separado. El envío aparece por calcular al seleccionar distrito; no se incluye una tarifa ficticia en el subtotal. La política de envío gratuito corresponde únicamente a La Esperanza, sin monto mínimo.
- Continuar compra abre `/finalizar-compra` cuando todas las variantes y cantidades son válidas. Si el navegador bloquea el guardado, el carrito sigue funcionando durante la visita y lo comunica.
- Los componentes, servicios e interfaces se generaron con Angular CLI. Los tres componentes nuevos conservan sus archivos `.ts`, `.html`, `.css` y `.spec.ts` separados.

## Finalizar compra y seguimiento

- `/finalizar-compra` permite revisar los pasos Entrega, Pago y Confirmación. Valida nombres, apellidos, correo, celular peruano, distrito y dirección; la referencia es opcional. Volver a editar conserva los datos durante el recorrido.
- `CoberturaEntrega` utiliza `CoberturaApi` mediante `FuenteCobertura`. Consulta los siete distritos y cotiza su tarifa real al seleccionar, antes del pago y antes de crear el pedido. La Esperanza conserva envío gratuito; tarifas pendientes y zonas deshabilitadas bloquean continuar. Los errores permiten reintentar y conservan los campos. La fuente de demostración permanece disponible para pruebas.
- El resumen se actualiza al seleccionar distrito. El pago muestra ese mismo total de productos y entrega, con IGV incluido. No se suma el IGV nuevamente.
- Yape y Plin muestran sus logotipos y un espacio pendiente para configurar el QR real. No hay códigos de cobro ni transferencias reales. El comprobante admite JPG, PNG y WebP de hasta 5 MB; rechaza archivos vacíos, corruptos y otros formatos. La vista previa es local y se elimina al cambiar el método o el importe.
- `Pedidos` delega mediante `GESTOR_PEDIDOS` a `PedidosApi` en la aplicación. Crea códigos `SOHO-…`, guarda datos históricos, comprobantes privados y reservas en MySQL. `PedidosDemostracion` permanece como doble aislado de pruebas.
- Contacto, domicilio, facturación e imagen no se guardan en almacenamiento web. `sessionStorage` conserva solo referencias de intentos y credenciales de invitado por pestaña. El carrito se vacía tras confirmar y únicamente si no cambió durante el envío.
- `/pedido/:codigo` consulta la compra persistida y el comprobante autorizado. Un invitado necesita el acceso privado de su pestaña: el código solo no concede acceso. El archivo se recupera como Blob y su URL se revoca al cerrar. Se distinguen todos los estados de pago y entrega del backend.
- Los componentes compartidos `campo-formulario`, `pasos-compra`, `articulos-pedido`, `estado-pedido` y `resumen-compra` evitan duplicar las vistas. Los componentes, servicios, interfaces y la clase `ValidacionEntrega` se generaron mediante Angular CLI; cada componente conserva sus cuatro archivos.
- NestJS ya valida precios, disponibilidad, cobertura e importes y crea el conjunto mediante transacción. Revisión de pagos, preparación, despacho, entrega y cancelaciones ya están integrados. Vencimiento de reservas y posventa quedan pendientes.

## Acceso y Mi cuenta

- `/iniciar-sesion` y `/crear-cuenta` utilizan la API real; el alta inicia sesión directamente. Se conservan validación y mostrar/ocultar contraseña, con los requisitos actuales del servidor.
- El icono de cuenta de la cabecera y el menú móvil abren `/mi-cuenta`. Sus secciones requieren una sesión comprobada con `/api/auth/me`; al iniciar sesión se recupera un destino interno seguro. El panel y sus rutas hijas requieren `ADMIN`.
- Google utiliza su botón oficial y validación en NestJS; la vinculación exige sesión y contraseña local. La recuperación de contraseña utiliza enlaces temporales de un solo uso y requiere configurar SMTP para enviar correos. No se incluyen credenciales públicas de cuentas. La verificación de correo sigue pendiente.
- `Cuenta` expone `GestorCuenta` con `CuentaApi` como proveedor predeterminado. Perfil y CSRF permanecen en memoria; la sesión se conserva mediante la cookie `HttpOnly` del backend. Los antiguos dobles de demostración solo se utilizan explícitamente en pruebas.
- [Mis direcciones](docs/integracion-direcciones.md) utiliza MySQL mediante la API protegida: permite añadir, editar, eliminar y elegir una predeterminada. La agenda persiste al recargar y se limpia de la pantalla al cambiar de cuenta. En checkout se elige explícitamente una dirección, conservando correo y facturación, y se cotiza su distrito. Guardar un destino no confirma cobertura ni tarifa.
- Mi cuenta consulta `/api/pedidos/mios`, con paginación y contador reales, y reutiliza `/pedido/:codigo` para el detalle y seguimiento. Solo lista los pedidos creados con la sesión de ese cliente iniciada; no atribuye compras de invitado por coincidencia de correo. Cerrar sesión oculta los datos del cliente sin vaciar el carrito ni los favoritos del visitante.
- La selección de texto utiliza los colores predeterminados del navegador. No se definen reglas `::selection`.

## Administración: Dashboard

Los resúmenes de pagos y pedidos consultan MySQL mediante `/api/admin/resumen-pedidos`, con carga, error y reintento reales. Los contadores consideran todos los pedidos; las listas breves y la caché no limitan los totales. Las ventas suman los importes históricos según aprobación en hora de Lima, incluido envío y sin descontar reembolsos. Conserva filtros de Hoy, 7, 30 días y período personalizado hasta 366 días. El inventario administrativo continúa identificado como demostración. Consultar [Integración de pagos](docs/integracion-pagos.md).

## Administración: listado y formularios de productos

- `/admin/productos` abre el listado, dentro de la estructura administrativa independiente de la tienda y con diseño adaptado de Genspark. El listado y los formularios conservan el mismo estilo administrativo y requieren `ADMIN`; sus operaciones de productos todavía se ejecutan en memoria.
- El buscador encuentra nombres, marcas, códigos internos y SKU sin distinguir mayúsculas ni acentos. Los filtros de marca, categoría, estado y disponibilidad se combinan; búsqueda, filtros y orden se conservan en la URL. Los productos archivados aparecen al seleccionar ese estado.
- La tabla de escritorio se adapta a tarjetas en celular. La consulta lateral permite revisar datos del modelo, precio común, colores, variantes, tallas EU y existencias físicas, reservadas y disponibles por SKU. La disponibilidad descuenta las reservas y excluye variantes deshabilitadas.
- «Agregar producto» abre `/admin/productos/nuevo`; la acción «Editar» de cada producto abre `/admin/productos/:identificador/editar`. El formulario reúne nombre, marca, categoría, modelo, género y descripción. El código interno se asigna automáticamente y permanece inmutable; el código de modelo puede editarse sin regenerar los SKU existentes.
- Las fotografías generales se seleccionan localmente: JPG, PNG o WebP, hasta ocho imágenes y un máximo de 5 MB por archivo. Se pueden quitar y elegir como portada; la primera imagen es la portada. Se rechazan archivos vacíos, dañados y formatos no admitidos. No se suben archivos a un servidor.
- El precio de venta incluye IGV y es común a todas las variantes, sin precios individuales por SKU. El precio anterior es opcional para ofertas y debe superar al precio de venta. También se puede marcar el producto como novedad y elegir borrador o publicado. Tanto los productos nuevos como los existentes pueden publicarse con nombre, marca, categoría, modelo, código de modelo, precio válido, al menos una fotografía y una variante activa. La descripción es opcional.
- «Generar variantes» está disponible al crear o editar un producto. Sus tres etapas permiten elegir colores y códigos, seleccionar tallas EU y revisar los SKU antes de generar. Se pueden agregar colores del catálogo o personalizados con nombre, tono y un código único de dos letras de A a Z; los nombres tampoco pueden repetirse. Los colores guardados conservan código, nombre, tono e imágenes.
- El generador combina los colores seleccionados con tallas EU de 35 a 48, incluidas las medias tallas. Los SKU nuevos siguen `CODIGO_INTERNO-COLOR-TALLA`, por ejemplo `SHO-0010-AZ-40P5`; `P` sustituye el punto en las medias tallas. Las combinaciones existentes se omiten incluso si están deshabilitadas y conservan su SKU anterior. La revisión detecta colisiones de SKU antes de generar.
- Las variantes generadas se agregan al formulario con stock inicial cero, sin reservas y habilitadas. Antes de guardar el producto se puede definir un stock inicial entero de 0 a 99,999 y quitar las variantes nuevas. Una vez guardadas conservan SKU, color y talla; se pueden habilitar o deshabilitar y sus existencias se modifican mediante movimientos, sin alterar las reservas. Los productos archivados deben restaurarse como borrador para editar sus datos o variantes.
- La tabla de variantes permite mostrar todas, habilitadas, deshabilitadas, agotadas o con stock bajo. El disponible es `max(0, stock físico − reservado)`; una variante deshabilitada tiene cero disponible. Stock bajo corresponde a una o dos unidades disponibles y agotadas a cero, considerando solo las habilitadas.
- «Registrar movimiento» está habilitado en el listado y en los productos guardados con variantes. También se abre al pulsar el stock físico de un SKU guardado. El diálogo permite registrar entradas, salidas o ajustes; estos últimos pueden sumar o restar unidades. Exige una cantidad entera de 1 a 99,999, un motivo de hasta 160 caracteres y admite una referencia opcional de hasta 80 caracteres. Las variantes nuevas deben guardarse antes de registrar movimientos.
- La vista previa muestra stock físico anterior y resultante, reservas y disponible. Se bloquean saldos físicos negativos o superiores a 99,999. Si el saldo queda por debajo de las reservas aparece una advertencia explícita; el movimiento conserva las reservas y el disponible se limita a cero cuando corresponde, incluida la variante deshabilitada.
- La pestaña global «Historial de movimientos» se abre con `/admin/productos?tab=movimientos`. Cada producto guardado tiene además un historial desplegable en su formulario. Ambos permiten buscar por SKU, producto, color, motivo, referencia o identificador, y filtrar por tipo y rango de fechas de Perú. Cada registro conserva una copia inmutable del nombre del producto, SKU, color, talla, fecha, actor «Admin Demo», cantidad con signo, saldo físico anterior y posterior, reservas, disponible, motivo y referencia.
- Guardar una variante nueva con stock inicial mayor que cero registra una entrada de «Stock inicial» una sola vez. El catálogo de demostración comienza sin movimientos históricos: no se inventan entradas para sus existencias previas. Registrar un movimiento desde el editor sincroniza los saldos sin perder cambios generales, habilitación ni variantes nuevas, y sin crear avisos falsos de cambios pendientes; los cambios del formulario se guardan por separado.
- Guardar, archivar, restaurar y registrar movimientos funcionan únicamente en memoria sobre una copia aislada del catálogo público, sin conexión con el backend. Restaurar devuelve el producto a borrador. Recargar o restablecer la demostración recupera los datos originales y elimina productos nuevos, movimientos y cambios de stock, incluso si se habían guardado durante la visita.
- Si quedan cambios sin guardar, incluidos los cambios pendientes del generador, la navegación muestra un diálogo para continuar editando o salir; al recargar o cerrar la pestaña se solicita el aviso nativo del navegador mediante `beforeunload`. Antes de guardar el producto hay que completar la generación de variantes o cancelarla.
- «Escenarios de demostración» permite revisar lista vacía, carga y error. La selección de texto conserva los colores predeterminados del navegador, sin reglas `::selection`.

## Administración: pedidos

`/admin/pedidos` y `/admin/pedidos/:codigo` consultan la API real con ADMIN. Conservan los datos históricos, SKU, tallas EU, contacto, entrega e importes. El listado pagina y combina búsqueda, estados de pago/entrega, tipo de cliente, fechas de Lima y orden en servidor. Abrir un enlace directo carga el detalle; las decisiones de Pagos se reflejan al consultar nuevamente. Preparación, despacho, entrega y cancelaciones ya utilizan sus APIs; la posventa real sigue pendiente. Consultar [Integración de pagos](docs/integracion-pagos.md).

## Administración: preparación y envíos

Las tres acciones ya están integradas con la API y MySQL. Consultar [Integración de preparación y envíos](docs/integracion-preparacion-envios.md).

- El detalle ofrece únicamente la siguiente acción válida: iniciar preparación, registrar envío o confirmar entrega, siempre con pago aprobado.
- Preparar conserva reservas y existencias; despachar guarda transportista y referencia, consume reservas y descuenta stock una sola vez; entregar no vuelve a descontarlo.
- Las notas son internas. Los formularios conservan borradores, fijan la versión consultada, protegen cierre y navegación y consultan el resultado ante respuestas inciertas.
- Seguimiento y Mis pedidos muestran fechas y datos de entrega sin empleados ni notas internas. Se conserva el diseño administrativo existente.

La demostración conserva sus servicios y restablecimientos propios; no modifica pedidos reales.

## Administración: cancelación de pedidos

La [integración de cancelaciones y reservas retenidas](docs/integracion-cancelaciones.md) ya utiliza la API sobre la octava migración aplicada. No requiere otra migración.

- Cancelar se ofrece antes del despacho desde Pendiente, Confirmado, En preparación o Incidencia. Exige motivo interno y confirmación explícita.
- La política histórica determina qué reservas se liberan automáticamente. Si hay reservas consultadas, exige elegir liberar o conservar sin una elección inicial.
- Un pedido cancelado con reservas conservadas ofrece su liberación posterior con confirmación. La decisión y el registro originales se conservan y el historial identifica al responsable de liberar.
- Pagos aprobados, comprobantes y existencias físicas se conservan; cancelar no realiza un reembolso. Mis pedidos y seguimiento muestran cancelación y fecha, con el pago separado.
- Versiones de pedido y pago, borradores, cierre, navegación, conflictos y respuestas perdidas se controlan antes de otra escritura. Una ventana cuyo pedido ya no admite la acción queda bloqueada.

La demostración sigue separada de los pedidos reales. Reembolsos, devoluciones, reapertura y vencimiento de reservas requieren otras entregas.

## Administración: Pagos por verificar

`/admin/pagos` y `/admin/pagos/:codigo` usan `PagosAdministracionApi` en producción. El listado pagina y filtra en servidor. El visor abre comprobantes privados reales con zoom, rotación y ampliación. Aprueba, observa o rechaza el comprobante vigente con ADMIN, CSRF, versiones y confirmación del backend; conserva revisiones anteriores, responsable, fecha, motivo y mensaje. El seguimiento permite al propietario o invitado autorizado adjuntar una corrección al mismo pedido. Aprobar mantiene reservas y stock físico; rechazar libera reservas sin cancelar ni reembolsar. Los estados de demostración quedan únicamente en los dobles de pruebas. Consultar [API de pagos](../soho-backend/docs/api-pagos.md) e [Integración Angular](docs/integracion-pagos.md).

## Administración: Clientes

- La navegación administrativa abre `/admin/clientes`; cada contacto tiene su ficha en `/admin/clientes/:identificador`. El listado muestra nombre, correo, teléfono, tipo, cantidad de pedidos y último pedido. Conserva la identidad administrativa existente: Archivo y Geist locales, rojo y negro, superficies claras y paneles con bordes finos. En celular las filas se presentan como fichas; la selección de texto mantiene el comportamiento predeterminado del navegador.
- La búsqueda encuentra nombres, correos e identificadores sin distinguir mayúsculas ni tildes y normaliza los separadores del teléfono. Se combina con Todos, Registrados o Invitados y con los órdenes Último pedido, Nombre: A–Z y Más pedidos. `busqueda`, `tipo` y `orden` se conservan en la URL al recargar, abrir una ficha y volver; Último pedido es el orden predeterminado.
- Los datos de ejemplo reúnen siete contactos: los seis compradores de los doce pedidos administrativos y Luis Mendoza Cruz, registrado sin compras. Hay cuatro registrados y tres invitados. Cada pedido incluye `cliente.identificador`; los pedidos se atribuyen por esa identidad explícita, sin fusionar personas por coincidencia de correo o teléfono. «Cuenta desde» es una fecha ficticia solo para registrados; los invitados compran sin crear una cuenta.
- La ficha reúne contacto, primer y último pedido, historial de compras y resumen de pagos aprobados. `ClientesAdministracion` consulta `PedidosAdministracion`, que entrega la proyección vigente de Pagos, envíos y cancelaciones. Las aprobaciones, cambios de entrega y cancelaciones se reflejan en las mismas compras, sin copiar estados a una fuente independiente. Pago y entrega aparecen separados.
- El importe de pagos aprobados se suma en céntimos e incluye los pedidos cancelados cuyo pago se conserva aprobado. La ficha aclara que no descuenta reembolsos; no representa un gasto neto. Un registrado sin compras muestra cero pedidos, S/ 0.00 y ninguna dirección. Las direcciones históricas únicas proceden de las copias guardadas en los pedidos y muestran calle, distrito y referencia cuando existe; no son la libreta personal de Mi cuenta.
- Desde el historial se puede abrir el pedido y su revisión de pago, y regresar a la ficha y al listado conservando la búsqueda, el tipo y el orden. El pedido muestra «Volver al cliente» solo cuando `clienteOrigen` coincide con su comprador; un origen ajeno se ignora y el retorno lleva a Pedidos. El contacto del detalle de pedido también enlaza a su ficha.
- «Vista de demostración» permite revisar carga, error con reintento y lista vacía. Esta última muestra cero clientes, registrados e invitados y permite recuperar los siete ejemplos. También se contemplan búsquedas sin coincidencias, identificador inexistente y registrado sin pedidos, sin inventar compras ni direcciones.
- Esta ficha es de consulta y usa datos ficticios en memoria. No modifica clientes, no consulta cuentas ni checkout, no muestra credenciales, no envía mensajes y no tramita reembolsos. No hay backend, persistencia ni autenticación o autorización administrativa real; recargar recupera los datos originales y elimina los cambios administrativos de demostración.

## Administración: Cambios y devoluciones

- La navegación administrativa abre `/admin/cambios`; cada caso tiene su ficha en `/admin/cambios/:identificador`. «Nueva solicitud» abre un diálogo desde el listado. La tabla se adapta a fichas en celular y conserva Archivo y Geist locales, rojo y negro, paneles blancos con bordes finos y radio de 6 px. La selección de texto mantiene el comportamiento predeterminado del navegador.
- El listado busca por solicitud, pedido, cliente, correo, SKU o motivo sin distinguir mayúsculas ni tildes. Combina Todas, Abiertas, En evaluación o Cerradas con tipo y los cinco estados: En evaluación, Esperando retorno, Aprobada, Rechazada y Cerrada. `busqueda`, `grupo`, `tipo` y `estado` se conservan en la URL al recargar, abrir una ficha y volver. Abiertas reúne los casos en evaluación, esperando retorno y aprobados. Las solicitudes más recientes aparecen primero.
- Los dos casos iniciales reutilizan los doce pedidos administrativos existentes: `CD-000002` es un cambio en evaluación de Andrea para `SOHO-000120`; `CD-000001` es una devolución rechazada de Mateo para `SOHO-000119`. Ambos pedidos están entregados y tienen pago aprobado. El caso rechazado permite registrar otra solicitud sobre ese par, sin inventar pedidos adicionales.
- El formulario exige pedido entregado con pago aprobado, producto del pedido, cantidad disponible para atender, tipo, motivo, descripción de 10 a 1000 caracteres y confirmación de demostración. Un cambio permite seleccionar otra variante disponible del mismo modelo, con talla EU. Se impide usar de nuevo un par que ya tenga una solicitud activa o completada; rechazar libera exactamente las unidades de ese caso. La disponibilidad se consulta en el catálogo administrativo y se vuelve a validar al aprobar y cerrar el cambio.
- Las evidencias son opcionales: hasta tres imágenes JPG, PNG o WebP de 2 MB cada una, leídas y decodificadas localmente. Se rechazan archivos vacíos, dañados o no admitidos. El formulario muestra miniaturas eliminables y la ficha permite ampliarlas en un visor con cierre por Escape. No se suben archivos a un servidor; imágenes, solicitudes nuevas, notas y decisiones solo permanecen durante la visita.
- La ficha reúne pedido, cliente, producto original, variante solicitada, motivo, evidencias, importe de referencia e historial con actor «Admin Demo» y fecha de Perú. El importe usa precios y descuento históricos del pedido, distribuidos por par en céntimos, y excluye el envío; no define una política real de reembolso. Las notas internas admiten de 3 a 500 caracteres y no se envían al cliente.
- Aprobar pasa de En evaluación a Esperando retorno. Registrar el retorno físico exige indicar la condición del producto y pasa a Aprobada. El cierre requiere una referencia de ejemplo de 5 a 100 caracteres para el envío del cambio o el reembolso. Rechazar solo está disponible en evaluación y exige un motivo de 10 a 500 caracteres. Las decisiones requieren confirmación y se bloquean si el caso cambió o la acción no corresponde al estado vigente.
- Desde la solicitud se puede abrir el pedido y revisar su pago, volver a la solicitud y regresar al listado conservando los filtros. El pedido muestra el retorno solo si `solicitudOrigen` identifica un caso existente del mismo pedido; un origen ajeno o inexistente se ignora. El retorno anterior mediante `clienteOrigen` sigue disponible.
- «Vista de demostración» permite revisar carga, error con reintento y lista vacía con contadores cero y recuperación de ejemplos. También se contemplan filtros sin resultados y solicitud inexistente. «Restablecer solicitudes de ejemplo» recupera solo los dos casos iniciales y elimina sus cambios; conserva las decisiones actuales de pagos, entregas, cancelaciones y catálogo. Recargar la aplicación recupera todos los datos originales de demostración.
- `SolicitudesAdministracion` consulta Pedidos y el catálogo administrativo sin modificar estados de pago o entrega, inventario ni reservas. Registrar un reembolso de ejemplo conserva el pago aprobado y no descuenta el resumen de Clientes. No conecta con checkout ni con Mi cuenta pública. Esta entrega no incluye backend, autenticación, autorización, persistencia, política comercial real, solicitudes públicas, notificaciones, reembolsos, reposición de stock ni envíos reales.

## Administración: Configuración

- La entrada «Configuración» del menú abre `/admin/configuracion`, que redirige a `/admin/configuracion/pagos`. Las cuatro pestañas visibles son Pagos, Envíos, Inventario y Tienda. El contenedor mantiene su navegación y el desplazamiento de la pestaña activa en celular; la ruta informativa de Administradores permanece fuera de esas pestañas.
- Cada apartado consulta, edita y guarda con su propio servicio real. El contenedor ya no tiene borrador, validación ni guardado en memoria. Las guardas de cada formulario y sus listeners de recarga protegen cambios y operaciones pendientes. Consultar [Limpieza de Configuración e Inicio](docs/limpieza-configuracion-inicio.md).
- Pagos utiliza su [API real](docs/integracion-configuracion-pagos.md) para datos receptores Yape/Plin, activación, cargas de QR y recuperación de operaciones. Deshabilitar permite editar; habilitar guarda la configuración confirmada. Los campos y archivos se validan según las capacidades consultadas.
- Envíos conserva los siete distritos y sus códigos existentes. La quinta migración inicia La Esperanza a S/ 0.00 y Moche desactivado; las demás tarifas y los plazos quedan pendientes (`NULL`), sin copiar los precios ilustrativos. Permite editar tarifa, plazo y habilitación con sesión `ADMIN` y CSRF; los nombres y códigos permanecen estables. El guardado conjunto detecta conflictos de versión y conserva el borrador ante errores. No incorpora país, departamento, provincia, Transportistas ni otra pantalla administrativa de cobertura.
- Inventario consulta y guarda la política real mediante la [API de reservas](../soho-backend/docs/api-configuracion-reservas.md), con versión, responsable, confirmación y guardado independiente. Los cambios afectan solo a nuevas reservas. La disponibilidad temporal procede de las capacidades de la API. Consultar [Integración de configuración de reservas](docs/integracion-configuracion-reservas.md).
- Tienda consulta y guarda contacto, WhatsApp, horario, enlaces y políticas mediante su [API real](../soho-backend/docs/api-configuracion-tienda.md), con versiones y recuperación de resultados pendientes. El footer consulta el contacto público guardado.
- Administradores muestra la identidad de la API y los únicos roles `ADMIN` y `CLIENTE`. Se retiraron propietario, permisos individuales e invitaciones ficticias. La gestión de otras cuentas queda pendiente; el alta administrativa se realiza con el comando del backend. Las rutas del panel requieren el rol vigente de la sesión.
- Se retiraron `ConfiguracionEstado` y sus pruebas exclusivas de simulación. Las comprobaciones que comparaban borradores de Inventario y Pagos utilizan ahora ambos servicios reales con HTTP de pruebas.

## Organización

```text
src/app/
  compartido/componentes/       Iconos, precios, cantidades, resumen de compra y diálogos
  compartido/directivas/        Zoom de imagen con el cursor o por clic
  estructuras/                 Estructura de tienda, cabecera, pie y estado de presentación
  administracion/
    estructuras/               Navegación y estructura administrativa
    dashboard/
      dashboard.*             Página de resumen y estilos principales
      dashboard-contenido.css Paneles de pedidos, comprobantes e inventario
      dashboard-estados.css   Estados de demostración y controles compartidos del Dashboard
      dashboard-datos.ts      Fachada reactiva de Pagos y Productos existentes
      resumen-dashboard.*    Cálculos de períodos, ventas e inventario y sus pruebas
      grafico-ventas/         Gráfico diario con plantilla, estilos y selección por teclado
    productos/paginas/         Listado y formulario de creación y edición
    productos/componentes/     Consulta, fotografías, variantes, movimiento e historial de inventario
    productos/modelos/         Estados, filtros, edición, movimientos y sincronización de saldos
    productos/datos/           Copia aislada del catálogo de demostración
    productos/servicios/       Guardado, archivo, restauración, stock y registros en memoria
    productos/guardas/         Protección de cambios sin guardar al navegar
    pedidos/paginas/           Listado, detalle y restablecimientos de envíos y cancelaciones
    pedidos/componentes/       Estados, gestión de entrega y formularios de entrega y cancelación
    pedidos/modelos/           Pedido, filtros, fechas, orden y validaciones de entrega y cancelación
    pedidos/datos/             Pedidos y contactos ficticios de partida
    pedidos/servicios/         Consulta compartida y APIs de envíos/cancelaciones; demostración separada
    pagos/paginas/             Listado por estados y revisión de comprobantes
    pagos/componentes/         Visor de documento ficticio y diálogo de decisión
    pagos/modelos/             Comprobantes, versiones, decisiones y validaciones
    pagos/datos/               Metadatos ficticios de comprobantes y revisiones previas
    pagos/servicios/           Simulación de pagos y proyección compartida con envíos y cancelaciones
    clientes/paginas/          Listado con filtros y ficha de contacto e historial
    clientes/modelos/          Identidad, ficha, búsqueda, orden y resumen de pagos
    clientes/datos/            Contactos ficticios de Pedidos y registrado sin compras
    clientes/servicios/        Consulta de clientes desde la proyección vigente de Pedidos
    cambios/paginas/           Listado de solicitudes y ficha de atención posventa
    cambios/componentes/       Estado, nueva solicitud y decisiones en diálogo
    cambios/modelos/           Solicitud, unidades, importes históricos y validaciones
    cambios/datos/             Dos casos ficticios vinculados a Pedidos existentes
    cambios/servicios/         Consulta, registro, decisiones, notas y restablecimiento en memoria
    configuracion/
      configuracion.*         Contenedor y navegación de apartados reales
      configuracion-controles.css  Controles compartidos limitados a Configuración
      pagos/                  Formularios Yape/Plin, carga y vista previa de QR
      envios/                 Distritos, tarifas, plazos y habilitación
      inventario/             Política persistida de reservas y cancelación
      tienda/                 Contacto, ayuda y políticas pendientes
      administradores/        Permisos, acceso, invitación y registro de ejemplo
  tienda/catalogo/
    catalogo.*                 Página del catálogo con sus cuatro archivos
    componentes/               Tarjeta de producto, panel y filtros del catálogo
      filtros-catalogo/componentes/filtro-precio/  Barra y campos de precio
    modelos/                   Contratos de producto y variante
    datos/                     Productos y marcas de demostración
    servicios/                 Consulta de datos y conversión de filtros a parámetros de URL
    guardas/                   Redirección y normalización de las rutas de sección
  tienda/detalle-producto/
    detalle-producto.*         Página de detalle con sus cuatro archivos
    componentes/               Galería, visor de imágenes, selector de variantes y guía de tallas
  tienda/carrito/
    carrito.*                  Página del carrito con sus cuatro archivos
    componentes/producto-carrito/  Presentación de una variante y sus acciones
    modelos/                   Artículo, línea, resultado y contrato del gestor
    servicios/                 Acceso al carrito y simulación local separada
  tienda/finalizar-compra/
    finalizar-compra.*         Página de entrega y pago con sus cuatro archivos
    componentes/               Datos de entrega y pago del pedido
    modelos/                   Dirección, cobertura, cotización y validación de datos
    datos/                     Zonas y tarifas ilustrativas de entrega
    servicios/                 Acceso a cobertura y fuente de demostración separada
  tienda/pedidos/
    seguimiento-pedido/        Confirmación y consulta del mismo pedido
    modelos/                   Pedido, artículos, comprobante y contrato del gestor
    servicios/                 Acceso centralizado y registros de demostración en memoria
  tienda/cuenta/
    paginas/                   Acceso y área del cliente
    componentes/               Cabecera de acceso, perfil, direcciones y lista de pedidos
    modelos/                   Perfil, dirección, contrato y validaciones
    servicios/                 Cuenta, simulación en memoria y derivación de claves de prueba
    guardas/                   Acceso a Mi cuenta con retorno a la sección solicitada
  tienda/inicio/
    paginas/                   Composición de la página de inicio
    componentes/               Secciones del inicio y vistas previas
  tienda/favoritos/             favoritos.ts, favoritos.html, favoritos.css y favoritos.spec.ts
src/estilos/                   Variables, tipografías y base global
public/imagenes/               Identidad, marcas, productos, campañas y pagos
public/fuentes/                Archivo, Geist y sus licencias
```

Las plantillas y hojas de estilo se mantienen separadas del código TypeScript; algunos componentes administrativos comparten hojas CSS. Las pruebas se conservan en archivos `.spec.ts`. No se cargan las hojas completas de React ni se utiliza Babel o React en Angular.

En `administracion/pedidos`, `modelos/entrega-admin.ts` define pasos, acciones y validaciones; `servicios/envios-administracion.ts` conserva los cambios de entrega en memoria. `modelos/cancelacion-admin.ts` define la solicitud, los estados admitidos y sus validaciones; `servicios/cancelaciones-administracion.ts` conserva los metadatos y eventos inmutables y proyecta los estados resultantes. `componentes/gestion-entrega` presenta el recorrido, la siguiente acción y la cancelación cuando corresponde. `componentes/formulario-entrega` y `componentes/formulario-cancelacion` reúnen los datos y la confirmación en el diálogo compartido. `servicios/pedidos-administracion.ts` consulta la proyección única de Pagos y delega las acciones reales en `EnviosAdministracionApi` y `CancelacionesAdministracionApi`; los servicios de demostración y sus restablecimientos se conservan separados.

En `administracion/clientes`, `modelos/cliente-admin.ts` construye la ficha a partir de la identidad del comprador y los pedidos vigentes, deduplica direcciones históricas y calcula pagos aprobados. `datos/clientes-admin-demo.ts` define los contactos ficticios; `servicios/clientes-administracion.ts` los combina con la fuente compartida de Pedidos. Las páginas `listado-clientes` y `detalle-cliente` reutilizan estados, precios e iconos existentes; `clientes-admin.css` reúne sus estilos comunes.

En `administracion/cambios`, `modelos/solicitud-admin.ts` define estados, contratos, elegibilidad, cantidades e importe de referencia; `datos/solicitudes-admin-demo.ts` aporta los dos casos iniciales. `servicios/solicitudes-administracion.ts` mantiene solicitudes e historial inmutable en memoria y consulta `PedidosAdministracion` y `ProductosAdministracion`. Las páginas `listado-solicitudes` y `detalle-solicitud` reutilizan precios, iconos, estados de pedido y el diálogo existente. Los componentes `estado-solicitud`, `nueva-solicitud` y `decision-solicitud` presentan estados y formularios; `cambios-admin.css` y `formulario-solicitud.css` reúnen estilos compartidos.

En `administracion/configuracion`, el contenedor conserva sus archivos `.ts`, `.html` y `.css`, y cada subcarpeta mantiene sus propios componentes y servicios. `configuracion-controles.css` y `configuracion.css` comparten estilos entre apartados. Las cuatro guardas de salida se declaran en `app.routes.ts` y utilizan `puedeSalir()` del formulario correspondiente. El contenedor no conserva una guarda ni un estado globales; `configuracion.spec.ts` comprueba la navegación entre formularios reales.

En `administracion/dashboard`, `dashboard.ts` conserva plantilla y tres hojas CSS separadas. `dashboard-datos.ts` reúne consultas reactivas sin duplicar ni modificar los servicios de Pagos y Productos; `resumen-dashboard.ts` calcula rangos, ventas y alertas, con pruebas en `resumen-dashboard.spec.ts`. `grafico-ventas` conserva `.ts`, `.html` y `.css` separados. La ruta y la entrada predeterminada se declaran en `app.routes.ts`; el contenedor administrativo proporciona navegación y título.

## Generación mediante Angular CLI

```powershell
ng generate component tienda/catalogo/catalogo --flat
ng generate component tienda/detalle-producto/detalle-producto --flat
ng generate service tienda/catalogo/servicios/catalogo
ng generate interface tienda/catalogo/modelos/producto
ng generate class tienda/compra/modelos/resumen-compra
ng generate directive compartido/directivas/imagen-respaldo
ng generate pipe compartido/transformadores/estado-pedido
ng generate guard nucleo/guardas/cambios-pendientes --implements=CanDeactivate
```

Son ejemplos de generación: los componentes y modelos existentes no deben generarse de nuevo. `angular.json` conserva las plantillas, hojas CSS y pruebas separadas para los futuros componentes. Cada tipo se genera cuando lo requiere la implementación; no se crean clases, directivas ni guardas vacíos.

## Reglas que deben conservar las siguientes entregas

- Un producto tiene un precio común a sus variantes. Cada color y talla tiene SKU e inventario propios. Unisex aparece en Hombre y Mujer con las mismas variantes.
- La disponibilidad considera habilitación, existencias y reservas. SOHO utiliza EU como sistema de tallas en variantes, filtros, detalle y guía. Los valores EU del catálogo de demostración son ilustrativos y no representan conversiones desde US ni tablas oficiales por marca. La constante SISTEMA_TALLAS centraliza esta decisión. Las medias tallas usan P en el segmento de SKU de demostración. El backend deberá generar y garantizar la unicidad comercial.
- La tienda es exclusivamente online: sin local de atención ni recojo en tienda.
- Se puede comprar como invitado sin crear una cuenta. Mi cuenta solo atribuye los pedidos creados con la sesión del cliente iniciada; una coincidencia de correo no incorpora compras de invitado.
- Envío gratuito en La Esperanza mientras esté vigente la política, sin monto mínimo. Otros distritos habilitados de Trujillo tendrán tarifas configurables. Un distrito sin cobertura impide comprar; una tarifa sin calcular no equivale a cero.
- Pago y preparación/entrega son estados separados de un mismo pedido. Solo el pago aprobado permite confirmar y preparar. Todas las secciones consultarán la misma información de NestJS y MySQL.
- El backend validará precios, inventario, cobertura y total, y guardará los importes históricos del pedido. Los cambios posteriores no modificarán los pedidos registrados.
- QR reales configurables por administración; comprobantes con acceso restringido. La demostración no contiene QR de cobro reales ni solicita pagos.
- La configuración real de reservas ya está integrada. Las reservas conservan su política histórica y guardar ajustes no mueve inventario. El procesamiento de vencimientos sigue pendiente y el modo temporal permanece bloqueado para nuevos cambios.

## Validación

La integración de Configuración → Inventario aprobó **654 pruebas en 126 archivos**, incluidas 48 nuevas. Pasaron compilación de producción sin avisos, TypeScript y formato. Ocho recorridos en Chrome con NestJS y MySQL temporal comprobaron persistencia, borradores, conflictos, respuesta perdida, políticas históricas y pérdida de sesión. Las capturas a 1440, 768 y 390 px no presentaron desbordamientos ni errores JavaScript; el detector no encontró avisos. Consultar [Integración de configuración de reservas](docs/integracion-configuracion-reservas.md). Evidencia: `.checkout-review/reservas-config-frontend/` desde la raíz SOHO.

La integración de cancelaciones y liberación de reservas aprobó **606 pruebas en 123 archivos**, incluidas 44 nuevas respecto de la entrega de envíos. Pasaron compilación de producción sin avisos, TypeScript de aplicación y pruebas y formato. Siete recorridos en Chrome con NestJS y MySQL temporal comprobaron escrituras reales, respuestas perdidas, reservas conservadas y liberadas una sola vez, privacidad y conflictos entre dos sesiones. Las capturas a 1440, 768 y 390 px no presentaron desbordamientos ni errores JavaScript. Consultar [Integración de cancelaciones](docs/integracion-cancelaciones.md). Evidencia: `.checkout-review/cancelaciones-frontend/` desde la raíz SOHO.

```powershell
npm.cmd run build
npm.cmd test -- --watch=false
```

El cierre de la migración registra una compilación de producción sin advertencias y **314 pruebas aprobadas en 92 archivos** con estos comandos. `angular.json` carga `vitest.config.mjs` del propio repositorio: ejecución de archivos sin paralelismo, máximo de dos trabajadores y límites de 30 segundos por prueba y preparación. Esta configuración sustituye la dependencia de la configuración externa usada en las revisiones históricas. No se omitieron pruebas ni se modificaron sus aserciones.

Las pruebas incluyen navegación, redirecciones del catálogo anterior, persistencia de favoritos, filtros y orden desde URL, rangos de precios, coincidencia de color y talla en una misma variante, selección de SKU, agotados, reinicio de selección, cantidad máxima, validación de entrega, cobertura, total con envío y conservación de importes del pedido de demostración. La compilación de producción se escribe en `dist/soho-frontend/browser`. El servidor de producción deberá devolver `index.html` para las rutas de Angular, incluyendo las seis rutas `/zapatillas…`, la dirección anterior `/catalogo`, `/producto/:identificador`, `/favoritos`, `/carrito`, `/finalizar-compra`, `/pedido/:codigo` y `/seguimiento-pedido`.

La validación registrada tras integrar Cambios y devoluciones incluye una compilación de producción correcta y 294 pruebas aprobadas en 90 archivos con `npm.cmd test -- --watch=false --runner-config=../.checkout-review/vitest.config.mjs`, usando la configuración de revisión existente con dos trabajadores, ejecución de archivos sin paralelismo y timeout de 30 segundos. Incluye doce pruebas del servicio de solicitudes y una del envío del formulario de notas desde el DOM. En aquella entrega el comando predeterminado mantenía su timeout de 5 segundos; en la revisión anterior de Clientes tres pruebas existentes de inicio y catálogo lo agotaron. La configuración del cierre descrita arriba resuelve esa diferencia.

El recorrido registrado en navegador de 1440, 768 y 390 px verificó búsqueda y filtros, URL y retorno por Pedido y Pago, aprobación, recepción, ambos cierres, rechazo y reutilización de cantidades, importes, notas, evidencias locales y visor, confirmaciones, restablecimiento aislado y estados de carga, error, vacío e inexistente. No registró errores de consola ni desbordamientos horizontales. La regresión de Clientes también pasó en esas anchuras. Esta comprobación no acredita lector de pantalla ni dispositivo físico. El servidor debe resolver mediante `index.html` también `/admin/clientes`, `/admin/clientes/:identificador`, `/admin/cambios` y `/admin/cambios/:identificador`.

La revisión de Configuración registra una compilación de producción sin advertencias y 305 pruebas aprobadas en 91 archivos con la misma configuración de revisión. Las once pruebas nuevas de `configuracion-estado.spec.ts` cubren guardado sin cambios parciales, descarte, gratuidad de La Esperanza, distritos, validación, reservas, protección del propietario, permisos e invitaciones de demostración. El recorrido de las cinco pantallas a 1440, 768 y 390 px registra validaciones, borrador compartido, cargas locales, navegación y estados sin errores de consola ni desbordamiento de página. Incluye la visibilidad de la pestaña activa al cambiar de ancho y el error y foco en el campo afectado de la invitación. La salida se comprueba con respuesta controlada a la confirmación y la advertencia de recarga con un evento cancelable; no acredita el comportamiento de cada navegador, lector de pantalla o dispositivo físico.

El inspector de las cinco rutas registra cero fallos y una advertencia de texto pequeño en Administradores a 768 px, por cabeceras compactas y metadatos de la referencia, aceptada en la revisión independiente. Cuatro advertencias estáticas de imagen en Pagos proceden de bindings Angular `[src]`; la revisión renderizada verifica los logotipos y la imagen cargada. Tras la revisión de composición, la revisión independiente de cierre comprobó las dos correcciones solicitadas: pestaña activa visible al redimensionar y error y foco solo en el campo afectado de la invitación. El contrato, alcance y observaciones constan en `../.checkout-review/configuracion-nueva/REVIEW.md`; las muestras y resultados están en `../.checkout-review/configuracion-nueva/result.json`, con el recorrido en `../.checkout-review/configuracion-nueva-browser.mjs`. El servidor deberá resolver mediante `index.html` también `/admin/configuracion` y sus cinco subrutas.

La validación anterior de Dashboard registró una compilación de producción sin advertencias y 314 pruebas aprobadas en 92 archivos con la misma configuración de revisión. Las nueve pruebas incorporadas entonces cubren céntimos, fecha de aprobación en Lima, ausencia de duplicación por comprobantes, rangos completos e inválidos, días sin ventas y actualización reactiva al aprobar un pago o registrar una entrada de inventario desde los servicios compartidos. Es un registro histórico: la corrección posterior del tooltip no repitió esas 314 pruebas.

El recorrido anterior de Dashboard a 1440, 768 y 390 px verificó Hoy, 7 y 30 días, rangos personalizados de 8 y 305 días, fechas vacías e inválidas, selección del gráfico por teclado, estados vacío/carga/error con recuperación, filtros y destinos de pedidos, pagos, edición de variantes y nuevo producto, además del menú móvil y selección nativa. No registró desbordamiento de página, errores de consola ni imágenes rotas. No acredita lector de pantalla ni dispositivo físico. El inspector de aquella entrega registró cero fallos y tres advertencias por metadatos pequeños, columnas de paneles independientes y espacio final de los resúmenes de altura uniforme; dos avisos estáticos de imagen corresponden a bindings Angular `[src]`, comprobados en ese recorrido renderizado.

La revisión independiente de aquella entrega emitió `ship`, con `ceiling reached` y ninguna corrección material pendiente en ese momento. Revisó fuentes y 23 PNG y 6 JPG, comprobó las copias principales por SHA-256 y aceptó las adaptaciones de datos compartidos, rangos completos y teclado; consideró no materiales las tres advertencias del inspector y los dos avisos estáticos de imagen. Fue una revisión visual y estática: no repitió pruebas, compilación ni recorrido de navegador y no acredita lector de pantalla o dispositivo físico. No hubo cambios de fuentes entre sus últimas capturas y ese dictamen. El lint de aquella entrega registró cero fallos y cero advertencias; Prettier y `git diff --check` pasaron. Su alcance y observaciones constan en `../.checkout-review/dashboard/REVIEW.md`, sus resultados en `../.checkout-review/dashboard/result.json` y su recorrido en `../.checkout-review/dashboard-browser.mjs`; se conservan como historial. El servidor debe resolver mediante `index.html` también `/admin` y `/admin/dashboard`.

La corrección posterior del tooltip sigue `../.checkout-review/dashboard-tooltip/REVIEW.md`, que revoca la adaptación anterior de detalle persistente bajo la gráfica. Su implementación solo cambia los tres archivos de `grafico-ventas`; conserva datos, cálculos, resto del Dashboard e identidad administrativa. La validación puntual registra una compilación de producción sin advertencias y un recorrido en navegador a 1906, 1440, 768 y 390 px, con resultado aprobado en `../.checkout-review/dashboard-tooltip/result.json` y script en `../.checkout-review/dashboard-tooltip-browser.mjs`. Comprueba hover sin clic ni foco previo, importe/pedidos/fecha, cambio de día y salida, extremos sin recorte, teclado y Escape, eventos táctiles y cierre exterior, rango de 305 días con End y desplazamiento, días cero y selección nativa. No registra errores de consola ni desbordamiento de página. El detector se ejecutó una vez sin incidencias. No se añadieron pruebas unitarias ni se repitió la suite completa; el recorrido no acredita lector de pantalla ni dispositivo físico.

La revisión independiente de esta corrección comprobó fuentes y capturas y dio por resueltos los cinco requisitos de hover y cierre, retirada del detalle permanente, teclado y toque, posición sin recorte y estados. Emitió `ship` con `ceiling reached` para el alcance del tooltip; aceptó su solapamiento transitorio sobre el área de la gráfica, como en Genspark. El inspector final registró cero fallos y las tres advertencias previas, ajenas a esta corrección; no constituye una nueva auditoría de toda la distribución. Prettier y `git diff --check` pasaron para la corrección.

## Siguiente entrega

Checkout, Mis pedidos, revisión de pagos, preparación, despacho, entrega, cancelaciones y liberación de reservas retenidas ya están conectados a NestJS y MySQL. La cobertura conserva los siete distritos y sus tarifas reales. Consultar [Integración de cancelaciones](docs/integracion-cancelaciones.md) y el [estado del backend](../soho-backend/docs/estado-integracion.md).

La configuración de reservas ya está integrada con la API. La siguiente entrega propuesta es analizar el procesamiento de vencimientos, sus alertas internas y su concurrencia con pagos, cancelación y despacho. Productos e inventario administrativos, clientes, incidencias y posventa requieren entregas posteriores. Las operaciones de demostración no modifican pedidos reales.

Los QR, números y titulares oficiales de Yape/Plin continúan pendientes de configuración comercial. No se verifican transferencias automáticamente ni se emiten documentos fiscales. Los correos de pedidos y pagos requieren una integración posterior; las observaciones ya se muestran en el seguimiento privado.
