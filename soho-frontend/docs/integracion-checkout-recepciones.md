# Checkout con instrucciones y recepciones

El [primer lote de limpieza](limpieza-simulacion-lote1.md), completado el 18 de noviembre de 2026, retiró la página anterior y trasladó sus estilos necesarios al flujo actual. CheckoutCompra y RecepcionCompra usan `checkout-estructura.css` y `checkout-compra.css`; las pruebas de cobertura/direcciones ya ejercitan CheckoutCompra.

La [retirada de componentes antiguos del checkout](limpieza-checkout-restos.md) eliminó PagoPedido y el formulario/cálculo de cupones ilustrativos de ResumenCheckout. El resumen conserva exclusivamente los descuentos y totales confirmados de pedidos históricos; los componentes y estilos compartidos del flujo actual permanecen intactos.

Implementado el 16 de noviembre de 2026, America/Lima, sobre las API existentes de [instrucciones](../../soho-backend/docs/api-instrucciones-pago.md), [recepción](../../soho-backend/docs/api-recepciones-compra.md), [procesamiento](../../soho-backend/docs/api-procesamiento-recepciones.md) y [correcciones](../../soho-backend/docs/api-atencion-recepciones.md). No añade piezas del backend, dependencias, migraciones ni cambios al cliente Prisma.

## Compra y destino verificados

`/finalizar-compra` carga sesión, cobertura y métodos publicados. Reutiliza los formularios de contacto, boleta/factura, entrega, direcciones guardadas y resumen. Conserva los siete distritos: solo cotiza zonas habilitadas con tarifa definida; La Esperanza conserva gratuidad. Elegir una dirección no cambia el correo de contacto ni la facturación. No aplica cupones de demostración.

El catálogo público de métodos no muestra receptores. Elegir una tarjeta Yape/Plin obtiene automáticamente las instrucciones enviando preparación completa y versión esperada, dentro del mismo paso. El servidor verifica productos, SKU, cantidades, importes y cobertura antes de devolver el destino histórico y el monto exacto. Angular valida pertenencia, sumas y URL HTTPS de Cloudinary del QR. No usa receptores locales.

Una instrucción confirmada fija los datos mostrados. Cambiar datos o método exige declarar que todavía no se pagó. Recibir una transferencia realizada usa la instrucción original, sin reemplazarla por precios, destino o tarifas actuales. Emitir no reserva ni crea un pedido.

El botón superior **Volver a datos y envío** y el primer paso abren esa decisión cuando ya existen instrucciones. Confirmar **Todavía no pagué: editar datos** recupera contacto, entrega, destinatario, referencia y boleta/factura desde la preparación histórica, también después de recargar. Conserva la clave de compra y el acceso; la próxima emisión obtiene una instrucción nueva y comprueba otra vez las condiciones. Cancelar conserva el pago mostrado. Durante una escritura los controles quedan deshabilitados; una recepción ya enviada no ofrece editar esos datos desde la cabecera. Esta corrección aprobó 1088 pruebas Angular y comprobación en Chrome con instrucciones interceptadas, sin escrituras comerciales.

## Comprobante, procesamiento y corrección

El paso 2 recupera la distribución de Genspark: contacto y entrega con edición, tarjetas con logotipos/selección, panel de celular/titular/QR/monto, copias de celular y monto, instrucciones en cuatro pasos, área de arrastre y lista de requisitos. El resumen lateral permanece visible con la instrucción confirmada; sus líneas, precio y envío proceden de esa preparación histórica aunque cambie el carrito. Las imágenes y marcas disponibles se resuelven por SKU, sin inventar fotografías cuando ya no están en el carrito. En móvil el resumen se despliega arriba.

Cambiar a otra billetera exige declarar que todavía no se pagó; cancelar conserva la selección original. Confirmar vuelve a verificar la compra en el mismo paso y retira el archivo/número preparados para la instrucción anterior. La carga está bloqueada hasta obtener una instrucción confirmada. Recuperar una clave nueva sin huella ni UUID no consulta una operación todavía inexistente, por lo que no muestra el aviso rojo de un envío perdido. Los intentos realmente enviados conservan su recuperación.

El pie ofrece ayuda con enlace al seguimiento y ventanas para los documentos del negocio. Términos, privacidad y canal de reclamaciones siguen indicando que no están publicados/configurados: no se inventaron textos legales ni contactos. El QR pendiente explica cómo usar el celular; se mostrará el recurso histórico cuando el administrador lo agregue y publique. El resumen ya no declara que los métodos publicados están pendientes de configuración.

El selector admite JPG/PNG/WebP de hasta 5 MB, comprueba decodificación/dimensiones y conserva bytes originales. El backend realiza la validación y el saneamiento definitivos. El número de operación opcional conserva ceros iniciales.

`/recepcion/:id` consulta el estado vigente:

- **RECIBIENDO:** consulta o reenvío del archivo original con la misma clave. Un 202 no significa confirmación.
- **RECIBIDA:** permite registrar el pedido con clave y versión. El servidor crea conjuntamente pedido, pago pendiente y reservas completas, o pasa a atención sin reservas parciales.
- **REQUIERE_ATENCION:** conserva evidencia y condiciones originales, sin pedir otra transferencia. ADMIN puede solicitar una imagen clara o registrar posteriormente el pedido con las condiciones originales.
- **PEDIDO_CREADO:** enlaza el seguimiento existente, donde se consulta el estado actual del pago y la entrega.

`procesamientoDisponible: false` en las proyecciones históricas no representa una bandera global de activación. El cliente usa el protocolo implementado para una recepción vigente `RECIBIDA`, sin corrección u operación pendiente; el servidor comprueba otra vez permisos, versión y condiciones. Pausar nuevas instrucciones no bloquea recuperar o procesar transferencias anteriores.

Las imágenes se consultan como blobs privados, con sesión o `X-Pedido-Acceso`. No son URLs públicas de Cloudinary. La vista revoca la URL al cerrar, cambiar de imagen, navegar, perder acceso o cambiar de identidad.

La corrección muestra solamente el mensaje público ADMIN y permite otra imagen del mismo pago. No expone motivo interno ni permite editar monto, método, destino o número de operación, incluida su ausencia. Tras confirmar, consulta el estado actual: si quedan motivos comerciales sigue en atención; si vuelve a `RECIBIDA`, puede procesarse con una clave nueva. No usa resultados históricos como estado vigente.

## Recuperación e identidad

`AccesoCompras` guarda antes del IO claves UUID, propietario, credencial invitada, referencias, versiones y huellas SHA-256 en `sessionStorage`. No guarda contacto, dirección ni bytes/base64. Exige verificar el guardado antes del envío, separa cuenta/visitante y conserva hasta veinte compras sin eliminar intentos inciertos.

Una respuesta perdida se consulta por clave. Si faltan bytes después de recargar, exige la misma imagen original, nombre, tipo y número. Reintentar conserva cuerpo, clave y versión. Un GET de operación 404 mantiene el intento y también consulta la recepción. Un POST histórico siempre se sigue de GET vigente.

Un rechazo de imagen 400/413/415/422 se comprueba por GET. Solo si el intento no existe (404) permite otro archivo, conservando instrucción o solicitud de corrección. Si esa consulta falla, conserva el rechazo para recuperarlo después. Un error de infraestructura nunca autoriza cambiar el archivo de un envío incierto.

Descarta respuestas tardías de otra identidad/revisión. Un 401 exige la cuenta original y no cae a invitado; un acceso privado 403/404 retira los datos cacheados. Un invitado sin su referencia de pestaña no puede consultar otro UUID.

Al confirmar un pedido, consulta su fecha original y vincula la credencial invitada al seguimiento sin consumir una creación v1 pendiente ni renovar el vencimiento. Atiende el carrito una sola vez: lo vacía únicamente si sigue siendo la compra en curso y conserva los mismos SKU/cantidades. Persiste ese resultado antes de limpiar, incluso cuando la cesta ya cambió, para que consultar después el pedido no borre otra compra idéntica.

La compra en curso y la recepción que se está consultando son referencias distintas. Registrar y vincular el pedido libera el checkout para otra compra sin esperar aprobación del pago, despacho o entrega; su recepción y seguimiento permanecen en el historial. Abrir una recepción anterior no sustituye una instrucción nueva ni cambia sus claves o acceso invitado. La confirmación ofrece **Empezar otra compra** junto a **Ver mi pedido**, sin desplegar opciones adicionales.

Al entrar al checkout, recupera exclusivamente la compra en curso. Si una referencia de la versión anterior todavía apunta a una recepción con `PEDIDO_CREADO`, consulta su estado vigente y la retira como compra activa sin borrar el carrito nuevo. Los pedidos antiguos sin el indicador de carrito se consideran ya atendidos. Las recepciones `RECIBIENDO`, `RECIBIDA`, `REQUIERE_ATENCION` y las operaciones inciertas mantienen la recuperación; empezar otra compra desde atención continúa exigiendo una decisión explícita y conserva la anterior.

## Compatibilidad y activación

El nuevo componente ocupa la ruta de compra; el componente anterior y sus pruebas conservan la referencia del flujo previo. Pedidos v1 existentes mantienen seguimiento, comprobantes, correcciones observadas y procesos administrativos. El checkout recupera una creación v1 pendiente antes de permitir otra compra.

`PAGOS_CHECKOUT_ACTIVO=false` sigue por defecto. La pantalla pausa compras nuevas y permite recuperar recepciones anteriores. No se leyó/modificó el `.env` real ni se habilitaron cobros. La puesta en marcha posterior requiere publicar y comprobar receptores reales en Configuración → Pagos y habilitar expresamente la variable en el entorno previsto, reiniciando NestJS. Esta entrega no requiere otra migración ni `db:generate`.

Configuración → Tienda y posventa mantienen entregas independientes. El checkout no aprueba fondos, despacha ni reembolsa.

## Validación

- **Compras sucesivas:** 1106 pruebas aprobadas en 152 archivos, once nuevas, tipos de aplicación/pruebas, producción sin avisos y formato. Chrome verificó cinco recorridos y doce capturas a 1440/768/390 px: primera compra, pedido entregado, segunda cesta idéntica, nueva instrucción Plin, consulta del seguimiento anterior y recuperación de referencias de la versión previa. Se simularon dos instrucciones, una recepción y un pedido; cero escrituras comerciales reales. Backend, Prisma, migraciones y configuración local conservados. Evidencia: `.checkout-review/compras-sucesivas/validacion.json`.

- **Actualización del diseño Genspark:** 1095 pruebas aprobadas en 152 archivos, siete nuevas, tipos completos, producción sin avisos (449.77 kB iniciales), formato y revisión visual sin incidencias. Chrome verificó cinco recorridos y dieciocho capturas a 1440/768/390 px: emisión automática, copia de datos, cambio/cancelación de billetera, regreso y recarga sin aviso falso, arrastre, ayuda y recuperación tras respuesta perdida. Las escrituras HTTP se interceptaron con respuestas del contrato; tres instrucciones, una recepción y un pedido fueron simulados, con cero escrituras comerciales en la base local. Backend, esquema, cliente Prisma y configuración real permanecieron intactos. Evidencia: `.checkout-review/pago-diseno-genspark/validacion.json`.

- **1080 pruebas en 151 archivos**, incluidas 65 nuevas, tipos de aplicación/pruebas, producción y formato.
- Chrome con Angular/NestJS reales, trece migraciones en MySQL exclusivo y Cloudinary simulado: ocho recorridos y 48 capturas a 1440/768/390 px, sin errores JavaScript ni desbordamientos. Incluye respuesta perdida de recepción/procesamiento/corrección, cambio de receptor/precio, atención y registro ADMIN, imagen privada, cuenta ajena, pedido v1 y firma de imagen rechazada después de decodificar en Chrome.
- Cinco recepciones terminaron en cinco pedidos nuevos; junto con el pedido v1 preparado quedaron seis pedidos y seis reservas completas, cero pagos aprobados y cero movimientos. El stock físico siguió en 50, con doce unidades reservadas. La corrección mantuvo `001234` en sus dos versiones. Un QR simulado conservó referencias históricas sin borrados.
- Se conservaron fuentes del backend, esquema, trece migraciones y cliente generado. No se utilizó `soho_db` ni proveedores reales. Evidencia: `.checkout-review/checkout-recepciones-frontend/validacion.json`.
