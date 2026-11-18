# Configuración comercial: Pagos y Tienda

Continuidad: el [esquema y la duodécima migración comercial](esquema-configuracion-comercial.md) ya están preparados y validados; el usuario confirmó posteriormente su aplicación local. La [API administrativa de Pagos y QR](api-configuracion-pagos.md) también está implementada. El [diseño posterior de instrucciones/recepción](analisis-instrucciones-pago.md) concreta el tratamiento de cambios después de transferir mediante recepción privada independiente. Su [decimotercera migración](esquema-recepciones-compra.md) está preparada y validada; el usuario confirmó su aplicación local. Sus contratos detallados prevalecen sobre la propuesta inicial de creación directa de esta página. Este documento conserva el análisis previo; las referencias a «esquema actual» describen las once migraciones anteriores.

Análisis funcional y técnico del 15 de noviembre de 2026, America/Lima. Contrasta las pantallas Angular, checkout, pie de tienda y esquema/servicios existentes. **Documenta una propuesta; no modifica código, Prisma ni migraciones y no genera piezas.** Las once migraciones aplicadas proceden de la confirmación del usuario; no se consultó `soho_db` ni servicios externos.

## Conclusión

**El esquema actual no basta para integrar esta configuración de forma persistente e histórica.** Existen el método `YAPE`/`PLIN`, pagos y comprobantes privados, pero no las cuentas receptoras, QR oficiales, versiones de configuración ni datos comerciales de Tienda. Hace falta una nueva migración antes de implementar esas API.

La siguiente entrega propuesta es preparar el esquema y la duodécima migración, con configuración versionada de Pagos y Tienda, QR independientes del catálogo y vínculo opcional de los pagos existentes con instrucciones históricas. Después implementar Pagos, sus imágenes y la preparación del checkout; Tienda se conectará como otro apartado con guardado independiente. Preparar el esquema no habilita transferencias reales.

Hay una diferencia importante con una simple tabla de ajustes: **el comprador ve la cuenta receptora antes de crear el pedido**. Actualmente adjunta el comprobante y recién entonces se crean pedido, pago y reservas. Guardar solamente la configuración vigente, o copiarla al registrar el pedido, no demuestra qué número, titular o QR vio antes de transferir. La propuesta conserva una instrucción emitida por el servidor antes de mostrar esos datos.

## Qué existe y qué falta

| Recorrido               | Funcionamiento actual                                                                                                                                                        | Consecuencia para la integración                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administración → Pagos  | `ConfiguracionEstado` guarda en señales de memoria; ambos métodos empiezan activos, pero sin celular, titular o QR. Guardar no llama al backend.                             | No trasladar esos valores iniciales como configuración oficial ni interpretar `activo: true` como listo para cobrar.                                                                |
| Validación de Pagos     | Permite celular vacío, no exige titular para un método activo y QR es opcional.                                                                                              | Exigir datos reales mínimos para activar; permitir guardar métodos desactivados sin información completa.                                                                           |
| Subida de QR            | `FileReader` convierte PNG/JPEG/WebP de hasta 2 MiB a una URL de datos y el navegador intenta decodificarla.                                                                 | La vista previa no equivale a almacenamiento. Validar y subir en el backend; persistir identidad del archivo, no base64.                                                            |
| Checkout                | `PagoPedido` ofrece Yape y Plin desde una lista fija. Número, titular y QR muestran pendientes y se mantiene “No realices transferencias”. No consume `ConfiguracionEstado`. | Publicar un contrato de métodos disponibles y sustituir el contenido pendiente cuando la integración completa esté lista.                                                           |
| Creación del pedido     | `CreatePedidoDto` exige comprobante. `PedidosService` comprueba precio, stock, cobertura y total al insertarlo.                                                              | La comprobación ocurre después de la pantalla que pide transferir; hay que conservar instrucciones previas y resolver los cambios posteriores al pago sin pedir otra transferencia. |
| Historial del pago      | `PagoPedido` guarda método, estado y versión de revisión; no destino del dinero ni versión de cuenta receptora.                                                              | Su `version` no debe reutilizarse como versión de configuración. Los pagos anteriores no reciben datos históricos inventados.                                                       |
| Administración → Tienda | Correo, WhatsApp, horario, dos enlaces y tres políticas se guardan solo en memoria.                                                                                          | Persistencia propia y lectura pública; no introducir campos de negocio que la pantalla no captura.                                                                                  |
| Pie público             | Ayuda e información comercial son textos locales; varios mensajes todavía hablan de demostración. Los logotipos de billeteras son estáticos.                                 | Conectar esos consumidores, no solo el formulario administrativo; distinguir un logotipo de un QR real.                                                                             |
| Guardado general        | Pagos y Tienda comparten guardar/descartar y validación del objeto completo, que aún incluye valores de demostración de zonas y reservas.                                    | Separar los dominios. Guardar Pagos no guarda Tienda ni toca la cobertura o las reservas reales.                                                                                    |
| Auditoría               | `acciones` contiene hasta quince entradas en memoria con “Admin Demo”.                                                                                                       | Responsable y fecha del servidor, historial persistente y recuperación de respuestas inciertas.                                                                                     |

La configuración real de Envíos e Inventario ya tiene su propio circuito. Debe mantenerse intacta, con los siete distritos, sus códigos y la gratuidad vigente de La Esperanza. Los importes de envío no pertenecen a la nueva configuración comercial.

## Reglas propuestas para Pagos

1. Se mantienen exactamente `YAPE` y `PLIN`. Cada método tiene activación, celular nacional de nueve dígitos que empieza por 9, titular de hasta 120 caracteres y QR opcional. El prefijo `+51` es presentación; la base guarda el número normalizado.
2. Para activarlo se exigen celular y titular válidos. Si se adjunta QR, debe estar confirmado y disponible. El administrador confirma que el titular, número y QR corresponden al destino correcto. El sistema no puede certificar al beneficiario bancario por decodificar una imagen.
3. Un método sin QR puede funcionar con número y titular: mostrar pago por número y omitir el bloque QR, sin un recuadro de configuración pendiente. El QR facilita el pago, no sustituye los datos obligatorios en esta primera versión.
4. Un método desactivado admite datos pendientes; los valores no vacíos igualmente se validan. Ambos métodos desactivados es una pausa válida: el checkout informa que no hay métodos disponibles y no emite instrucciones nuevas.
5. Yape y Plin se guardan juntos, en una transacción y con una versión de Pagos. No se publica la mitad de una actualización. Tienda tiene otra versión y otro guardado.
6. El estado inicial será sin configurar: sin números, titulares ni QR de ejemplo y sin métodos habilitados para emitir instrucciones. No se copian los `activo: true` de la demostración como datos oficiales.
7. Desactivar o cambiar un método afecta a las instrucciones futuras. No modifica pagos, pedidos, comprobantes, reservas ni instrucciones ya emitidas. Esa consecuencia debe estar visible en la confirmación administrativa.

La revisión del comprobante continúa siendo manual. No se añade conexión bancaria, verificación automática de transferencias, cobro, pasarela, webhook ni reembolso. Un cambio de QR tampoco cambia un pago de pendiente a aprobado.

## Instrucción de pago e historial

Flujo propuesto para conservar el destino mostrado:

1. El cliente obtiene los métodos disponibles y elige uno. Antes de mostrar número/titular/QR para transferir, solicita una instrucción al servidor.
2. La petición identifica la preparación del checkout, la versión esperada y el método. El servidor verifica que sigue disponible y fija su versión inmutable. Devuelve un identificador de instrucción y los datos receptores de esa versión.
3. La instrucción pertenece a la cuenta autenticada o a la credencial privada de invitado. Reutilizar el patrón actual de `X-Pedido-Acceso`; un UUID o correo no autoriza consulta ni consumo. La clave de creación del pedido debe prepararse antes y conservarse hasta su envío.
4. El cliente mantiene esa instrucción durante la transferencia y la adjunta al crear el pedido junto con el comprobante y la misma clave de creación. El backend comprueba propietario, método, clave y que no esté asociada a otro pago; vincula instrucción y pago en la transacción del pedido.
5. Correcciones posteriores de comprobante usan la misma instrucción. Cancelar o aprobar no la sustituye por el receptor vigente. Un cambio de sesión retira la preparación local y no permite utilizar instrucciones ajenas.
6. Los reintentos conservan la solicitud exacta. No se emite otra instrucción ni se cambia la cuenta receptora automáticamente para resolver una respuesta perdida.

**Política inicial propuesta:** las instrucciones ya emitidas se conservan y pueden acompañar el registro de su compra aunque el administrador cambie o desactive después el método. No caducarlas ni revocarlas automáticamente como efecto de una actualización. El administrador debe saber que ocultar un método no invalida destinos ya mostrados. Una retirada de emergencia de instrucciones emitidas requerirá su propio procedimiento de atención, fuera de esta primera entrega.

La instrucción fija el destino del pago; **no representa una reserva de inventario ni garantiza por sí sola precio, cobertura o disponibilidad**. Antes de mostrar datos para transferir, la preparación debe comprobar la cotización y disponibilidad vigentes reutilizando las reglas del backend. No confiar exclusivamente en el total del navegador.

La instrucción conserva también moneda, importe de referencia y huella de esa preparación verificada. La creación final debe contrastar clave, método y preparación, además de ejecutar las validaciones transaccionales actuales. Esa copia permite identificar el monto mostrado, pero no promete inmovilizar precios o stock. Reorganizar las reglas compartidas cuando corresponda; no mantener dos cálculos independientes que puedan divergir.

El código actual puede rechazar precio, stock o tarifa al crear el pedido después de adjuntar la transferencia. Ese recorrido necesita tratamiento explícito antes de habilitar cobros reales: conservar instrucción y comprobante, permitir recuperación/atención y no reemplazar el importe o pedir pagar nuevamente de forma automática. Crear el pedido y reservar antes de transferir sería otro cambio de flujo y no queda aprobado por este análisis. La preparación del esquema y la API administrativa pueden avanzar sin anunciar todavía que toda la venta real está habilitada.

### Pagos anteriores y compatibilidad

`PagoPedido.instruccionId` será opcional para los registros previos. Su ausencia significa **“Destino histórico no registrado”**. No rellenar números o QR con la configuración actual ni inferirlos del comprobante del cliente. Conservar método, estados, versiones y operaciones existentes.

En el despliegue del nuevo checkout, exigir instrucción para una creación nueva; conservar la recuperación y repetición autorizada de pedidos ya confirmados con el contrato anterior. La validación de entrada y el cálculo del hash deben permitir reconocer esas solicitudes históricas antes de exigir el nuevo campo. No cambiar silenciosamente el hash de una repetición antigua añadiendo `null` ni saltarse sus comprobaciones de propietario y solicitud.

## QR: almacenamiento, calidad y referencias

Se propone extender a los QR públicos la infraestructura Cloudinary ya configurada, con un dominio independiente, por ejemplo `SOHO/pagos/yape/<archivo-uuid>` y `SOHO/pagos/plin/<archivo-uuid>`. Es una propuesta de esta entrega: no se conectó la cuenta, creó carpetas ni subió archivos. No cambia el almacenamiento privado de comprobantes.

`ArchivoImagen` no se reutiliza para fingir un producto: exige `productoOrigenId`, y `CloudinaryService` también valida/contextualiza recursos por producto. Reutilizar o reorganizar el transporte, configuración y patrones de conciliación existentes; el modelo y control de referencias del QR deben ser específicos. No duplicar clientes del proveedor ni hacer nullable la propiedad de todas las fotografías para resolver este caso.

- Validación servidor de contenido real PNG/JPEG/WebP estático, archivo no vacío y máximo 2 MiB, con límite de dimensiones/píxeles y rechazo de imágenes corruptas o animadas. No basta `accept`, MIME declarado o `Image.decode()` del navegador.
- Conservar una representación legible del QR, su margen y proporción. No recortar, generar un QR a partir del celular ni aplicar cambios de color o compresión con pérdida sobre el código. La visualización debe permitir al administrador verificarlo antes de publicar.
- No aceptar URL arbitraria o base64 en el guardado de configuración. La carga devuelve `archivoQrId`, identidad del recurso, estado y URL HTTPS; el guardado referencia un archivo confirmado del dominio correcto.
- Nueva carga significa recurso nuevo, sin sobrescribir un identificador ya usado. Conservar `asset_id`, `public_id`, versión, cuenta/proveedor, formato, dimensiones, bytes y hash, además de clave/hash de carga y responsable.
- Quitar o sustituir un QR retira su referencia del borrador o de una nueva versión; no borra el que perteneció a una versión histórica. La limpieza física solo admite cargas huérfanas confirmadas y sin referencias de ninguna versión o instrucción.
- Distinguir pendiente, disponible, fallida y resultado incierto. Una carga incierta se concilia por identidad; reintentar consulta antes de volver a subir. Las credenciales del proveedor permanecen en el backend.

Los límites técnicos concretos de dimensiones y la preparación de imagen deben fijarse al implementar el circuito QR y probarse con códigos escaneables. El requisito es conservar legibilidad; no afirmar que una imagen válida o una respuesta del proveedor certifica la cuenta receptora.

## Tienda: datos y consumidores

| Campo actual                   | Regla propuesta                                                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correo de atención             | Opcional mientras esté pendiente; validar formato y máximo 160 caracteres, conservando el límite de la pantalla. Es contacto público, no la cuenta SMTP.                                                                                                             |
| WhatsApp                       | Opcional; guardar nueve dígitos nacionales válidos, presentar `+51` y construir el enlace de atención a partir del número. No copiar desde Yape/Plin.                                                                                                                |
| Horario                        | Texto opcional de hasta 160 caracteres. No interpretar como agenda ni prometer atención automática.                                                                                                                                                                  |
| Enlaces de ayuda               | Mantener los dos espacios actuales, en orden. Etiqueta de hasta 100 caracteres y URL absoluta HTTP/HTTPS de hasta 2048; si hay URL, exigir etiqueta. Rechazar credenciales en URL y protocolos como `javascript:` o `data:`. No descargar destinos desde el backend. |
| Cambios, privacidad y términos | Texto plano de hasta 10000 caracteres por política; conservar saltos de línea y rechazar controles no permitidos. No ejecutar HTML ni inventar condiciones comerciales.                                                                                              |

Guardar/publicar crea una versión de Tienda y actualiza su versión vigente. Campos vacíos se conservan como pendientes y los consumidores no fabrican correos, números, horarios o documentos. Los textos comerciales deben ser aportados por SOHO.

Consumidores a conectar: pie público y sus diálogos de ayuda/información, enlaces de atención y políticas. La ayuda sobre billeteras debe describir la disponibilidad real de Pagos. Mantener la identidad de SOHO, operación online, ausencia de recojo y reglas de cobertura existentes; este formulario no permite editar logotipo, catálogo, tarifas, IGV, RUC o facturación.

El pie actual anuncia que las condiciones se publicarán antes de habilitar compras. La preparación para vender incluye esos contenidos y contactos aportados por SOHO, además del circuito de pago; no retirar todos los avisos comerciales por el mero guardado de un QR.

Las políticas son contenido informativo versionado; no implementan automáticamente devoluciones, reembolsos o decisiones posventa. Tampoco hay hoy evidencia de aceptación de una versión en `CreatePedidoDto`. Si se quiere registrar aceptación de términos o consentimiento, definir su flujo y datos explícitos en otra ampliación; no inferirla de abrir la página o adjuntar un comprobante.

## Preparación del esquema propuesta

Propuesta de siete modelos nuevos, normalizados por responsabilidad. Sus nombres y restricciones finales se concretarán al preparar Prisma/SQL; esta tabla no es una migración generada.

| Modelo                       | Propósito y datos esenciales                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ConfiguracionPagos`         | Única fila de control; apunta a la versión vigente o queda sin configurar. Bloqueo común para publicaciones y emisión de instrucciones.                                                                                                                                        |
| `VersionConfiguracionPagos`  | Versión inmutable, número único, responsable/fecha, clave de solicitud, hash y respuesta recuperable del guardado. Es historial y registro de la operación, sin una segunda auditoría genérica duplicada.                                                                      |
| `MetodoPagoConfigurado`      | Dos filas por versión, una `YAPE` y otra `PLIN`: activación, celular, titular y archivo QR opcional. Único por versión/método. Se referencia esta fila histórica, no un dato mutable.                                                                                          |
| `ArchivoQrPago`              | Carga del QR con identidad, metadatos, hash, estado, claves y control de conciliación/limpieza; independiente de fotografías y comprobantes.                                                                                                                                   |
| `InstruccionPago`            | Referencia al método versionado, claves de creación de checkout/pedido y de emisión, hash de solicitud/preparación, moneda e importe de referencia verificados, propietario de cuenta o credencial invitada y fecha. Emisión recuperable; no representa aprobación ni reserva. |
| `ConfiguracionTienda`        | Única fila de control, con versión vigente independiente de Pagos.                                                                                                                                                                                                             |
| `VersionConfiguracionTienda` | Copia inmutable de contacto, horario, dos enlaces y tres políticas; responsable/fecha, clave/hash y respuesta recuperable. Los enlaces pueden ser JSON de estructura y tamaño estrictamente validados.                                                                         |

Extender `PagoPedido` con relación única opcional a `InstruccionPago`, conservando su método y versión de revisión actuales. Proteger con claves foráneas y borrado restringido las versiones, QR, responsables e instrucciones referenciadas. Exigir coherencia entre el método de la instrucción y el del pago, preferentemente con referencias compuestas además de la validación de servicio.

Restricciones a preparar: números/versiones y tamaños válidos; solo dos métodos; unicidad por versión/método; activación con celular/titular completos; QR disponible y de su dominio; propietario de instrucción de cuenta o invitado, nunca ambos ni ninguno; instrucción de un solo pago y ligada a su clave de creación. La creación de las dos filas de método y el cambio del puntero vigente deben ser atómicos. Los campos nuevos no deben alterar el significado de `PagoPedido.version`.

La migración inicial solo prepara estructura y filas de control sin datos comerciales inventados. No ejecuta conversión del catálogo, seeds de pedidos ni publicaciones de QR. Datos antiguos permanecen sin destino histórico cuando no existe evidencia.

## Contrato API propuesto

Las cinco rutas administrativas de Pagos y QR están implementadas y documentadas en [su contrato vigente](api-configuracion-pagos.md). Las demás rutas de esta sección siguen siendo propuestas.

| Método y ruta                                            | Alcance                                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/configuracion/pagos`                     | Configuración completa, versión vigente y estado de métodos/QR. ADMIN.                                                                                      |
| `PATCH /api/admin/configuracion/pagos`                   | Publica juntos Yape/Plin con `claveSolicitud`, `versionEsperada`, `confirmado` y `metodos`. ADMIN/CSRF.                                                     |
| `GET /api/admin/configuracion/pagos/operaciones/:clave`  | Recupera la respuesta de un guardado del mismo responsable. ADMIN.                                                                                          |
| `POST /api/admin/configuracion/pagos/qr`                 | Carga multipart con `claveCarga` y método; devuelve referencia y estado. ADMIN/CSRF.                                                                        |
| `GET /api/admin/configuracion/pagos/qr/cargas/:clave`    | Consulta/conciliación de una carga propia; no reenvía archivos. ADMIN.                                                                                      |
| `GET /api/configuracion/pagos`                           | Catálogo de métodos habilitados —código/nombre—, versión y disponibilidad. Público; el checkout obtiene número, titular y QR al emitir su instrucción.      |
| `POST /api/pagos/instrucciones`                          | Emite o recupera una instrucción propia con clave, versión y método esperados; requiere identidad de cuenta/invitado y CSRF. No crea pedido ni mueve stock. |
| `GET /api/pagos/instrucciones/:id`                       | Recupera la instrucción con su identidad privada, sin mostrar datos ajenos.                                                                                 |
| `GET /api/admin/configuracion/tienda`                    | Configuración vigente y su versión de Tienda. ADMIN; no devuelve todas las versiones históricas sin límite.                                                 |
| `PATCH /api/admin/configuracion/tienda`                  | Publica contacto, enlaces y políticas con versión, clave y confirmación. ADMIN/CSRF.                                                                        |
| `GET /api/admin/configuracion/tienda/operaciones/:clave` | Recupera el guardado del mismo responsable. ADMIN.                                                                                                          |
| `GET /api/configuracion/tienda`                          | Contacto/enlaces/textos públicos y versión, sin auditoría privada.                                                                                          |

Usar `Cache-Control: no-store` inicialmente, especialmente para destinos de pago e instrucciones. La respuesta pública sin métodos devuelve una lista vacía y `disponible: false`, sin datos de ejemplo. Un QR pendiente o fallido no se presenta como publicable. El detalle autorizado del pedido incorporará la instrucción histórica o indicará que no se registró para un pago anterior.

Contrato mínimo de lectura pública antes de configurar:

```json
{ "version": 0, "disponible": false, "metodos": [] }
```

La lectura administrativa inicial presenta los dos métodos desactivados con celular, titular y QR nulos y `version: 0`. Esa versión es la ausencia de una publicación, no una cuenta receptora ficticia. El primer guardado válido usa `versionEsperada: 0`; publica la versión 1. Los siguientes comparan contra la versión vigente.

El guardado de Pagos tiene esta estructura; `qrId` solo admite un archivo confirmado o `null`:

```text
{
  claveSolicitud: UUID,
  versionEsperada: entero >= 0,
  confirmado: true,
  metodos: [
    { metodo: "YAPE", activo: boolean, celular: string | null, titular: string | null, qrId: UUID | null },
    { metodo: "PLIN", activo: boolean, celular: string | null, titular: string | null, qrId: UUID | null }
  ]
}
```

La emisión usa `{ claveSolicitud, claveCreacionPedido, metodo, versionConfiguracionEsperada, preparacion }` y la identidad privada de cuenta/invitado. `preparacion` contiene artículos —SKU, cantidad y precio esperado—, código de distrito y cotización esperada —envío, plazo y total—; permite al servidor contrastar catálogo, disponibilidad y cobertura antes de transferir. No es una garantía de reserva. Su respuesta incluye `{ instruccionId, claveCreacionPedido, metodo, versionConfiguracion, emitidaEn, moneda, importeReferencia, destino: { celular, titular, qr } }`. La petición final de pedido incorpora `instruccionPagoId`. Recuperar una emisión repetida conserva su respuesta inicial; no selecciona una versión receptora nueva.

Los contratos rechazarán propiedades desconocidas, parámetros repetidos, tipos inesperados y valores fuera de límites. El frontend no envía responsable, fecha, estado de pago ni URL de proveedor para que el backend los acepte como autoridad.

## Concurrencia, auditoría y recuperación

- Reutilizar sesión, RBAC, CSRF, límites y comprobación de autorización dentro de la transacción. Un identificador de QR/instrucción/operación no sustituye permisos.
- Serializar el cambio de configuración y la emisión de instrucciones sobre la misma fila de Pagos: o se emite con la versión anterior antes del cambio, o se solicita revisar la nueva antes de transferir. No mezclar número de una versión y QR de otra.
- Revalidar versión y referencias de QR al publicar. Los conflictos conservan el borrador y requieren recarga explícita. Un cambio de cuenta receptora se confirma con los datos vigentes y la advertencia sobre instrucciones ya emitidas.
- Misma clave y solicitud del mismo responsable devuelve la respuesta histórica; una clave usada con otro contenido o responsable produce conflicto, sin otra versión. Guardar respuesta y versión en la misma transacción.
- Distinguir fallo previo al guardado de respuesta perdida después de COMMIT. En esta última, consultar la operación; no publicar otra versión ni volver a subir QR automáticamente.
- Los pagos ya aprobados y su revisión no dependen de que el método siga habilitado. Corregir un comprobante conserva cuenta/instrucción y no pide una transferencia adicional.
- Las cuentas receptoras históricas son datos públicos mostrados al comprar, pero el historial de administración, claves/hash y credenciales de invitado no forman parte del contrato público.

Estados de error a definir: 400 por contrato, 401/403 por autorización, 404 por referencias propias inexistentes, 409 por versión/clave o método cambiado, 422 por datos/imágenes no publicables, 429 por límite y 503 por persistencia/proveedor. Los errores no muestran SQL, secretos ni respuestas del proveedor.

## Orden de implementación recomendado

1. **Preparar Prisma y la duodécima migración**, con modelos, referencias históricas, restricciones y compatibilidad de los pagos existentes. Revisar el SQL y comprobarlo exclusivamente en MySQL temporal. Esa será una entrega concreta antes de pedir aplicar comandos en la base local.
2. **API administrativa de Pagos y QR**, con piezas nuevas generadas mediante Nest CLI, versiones, auditoría, confirmación y recuperación. No habilitar aún transferencias en checkout por el mero guardado administrativo.
3. **Preparación de instrucciones y adaptación de pedidos**, preservando recuperación antigua y resolviendo el recorrido de cambios de cotización/stock después de transferir. Probar este circuito antes de permitir cobros reales.
4. **Angular de Pagos y checkout**, con fuentes reales, estados, borradores protegidos, QR comprobados, instrucciones conservadas y ausencia de métodos gestionada. Retirar el mensaje de datos pendientes solo para un circuito listo.
5. **API/Angular de Tienda y consumidores públicos**, con su guardado independiente, versiones y textos aportados por SOHO. Mantener Envíos e Inventario fuera de estos guardados.

## Criterios de aceptación para las entregas futuras

- Instalación sin configurar, un solo método, ambos desactivados, teléfono inválido, titular vacío y método válido sin QR; nunca se publica un número ficticio.
- QR corrupto, MIME declarado falso, animación, archivo vacío/excesivo, respuesta externa incierta, publicación antes de terminar carga, dos sesiones y limpieza concurrente. Un QR histórico no se sobrescribe ni elimina.
- Cambio de método/configuración antes de emitir, entre emisión y transferencia y después de adjuntar comprobante; número, titular y QR permanecen de la misma versión.
- Instrucciones de otra cuenta/invitado, clave de checkout distinta, método distinto, duplicación y recuperación tras COMMIT. Corrección, aprobación y cancelación no alteran destino histórico.
- Los pagos antiguos conservan el método y muestran destino no registrado; sus solicitudes antiguas confirmadas se pueden recuperar sin duplicar pedidos o reservas.
- Variación de precio, stock o envío después de mostrar el pago no termina en una invitación automática a pagar otra vez o en pérdida de comprobante/instrucción.
- Guardar Pagos no modifica Tienda, zonas, reservas o permisos; guardar Tienda no activa pagos. El correo de atención no cambia SMTP.
- Enlaces de ayuda y políticas aparecen en sus consumidores, se presentan como texto seguro y no implementan posventa o aceptación de términos por sí solos.

## Evidencia y límites de este análisis

Fuentes principales: [estado de configuración](../../soho-frontend/src/app/administracion/configuracion/configuracion-estado.ts), [reglas actuales comprobadas por sus pruebas](../../soho-frontend/src/app/administracion/configuracion/configuracion-estado.spec.ts), [formulario de Pagos](../../soho-frontend/src/app/administracion/configuracion/pagos/pagos.html), [formulario de Tienda](../../soho-frontend/src/app/administracion/configuracion/tienda/tienda.html), [pago del checkout](../../soho-frontend/src/app/tienda/finalizar-compra/componentes/pago-pedido/pago-pedido.html), [creación desde Angular](../../soho-frontend/src/app/tienda/finalizar-compra/finalizar-compra.ts), [pie público](../../soho-frontend/src/app/estructuras/componentes/pie-tienda/pie-tienda.ts), [creación transaccional de pedidos](../src/pedidos/pedidos.service.ts), [contrato actual](../src/pedidos/dto/create-pedido.dto.ts), [esquema Prisma](../prisma/schema.prisma) y [cliente Cloudinary actual](../src/productos/fotografias/cloudinary.service.ts).

Se revisó código y documentación; no se ejecutaron pruebas funcionales ni se comprobaron estas rutas futuras, que no están implementadas. La validación de esta entrega comprueba formato, enlaces y hashes de fuentes/esquema. Evidencia: `.checkout-review/analisis-configuracion-comercial/validacion.json`, en la raíz SOHO. No se leyeron credenciales, no se conectó MySQL ni se contactó Cloudinary, bancos, billeteras, SMTP o Google.
