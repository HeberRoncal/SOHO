# Atención administrativa y correcciones de recepciones

Implementada el 16 de noviembre de 2026, America/Lima, sobre las trece migraciones existentes. Continúa el [procesamiento privado](api-procesamiento-recepciones.md), reutilizando su transacción, copia privada y registro de pedidos. Las seis piezas nuevas se generaron con Nest CLI. No requiere otra migración ni regenerar Prisma; conserva Angular y `.env` real. Mantener `PAGOS_CHECKOUT_ACTIVO=false` hasta completar la integración Angular y probar el recorrido completo.

## Rutas y acceso

| Método y ruta                                                | Resultado                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /api/admin/recepciones`                                 | Bandeja paginada, búsqueda, filtro y conteos globales.                                    |
| `GET /api/admin/recepciones/:id`                             | Preparación original, comprobantes, diagnóstico actual/original, historial y capacidades. |
| `GET /api/admin/recepciones/:id/comprobantes/:comprobanteId` | Streaming privado de una versión confirmada de esa recepción.                             |
| `POST /api/admin/recepciones/:id/registro-pedido`            | Decisión explícita de registrar con condiciones originales.                               |
| `POST /api/admin/recepciones/:id/solicitud-correccion`       | Solicitar otra imagen de la misma transferencia.                                          |
| `GET /api/admin/recepciones/:id/operaciones/:clave`          | Recuperar una decisión del mismo administrador responsable.                               |
| `POST /api/pagos/recepciones/:id/comprobantes`               | Propietario: adjuntar la corrección solicitada.                                           |
| `GET /api/pagos/recepciones/:id/operaciones/:clave`          | Propietario: recupera procesamiento o corrección propios.                                 |

Las primeras seis rutas requieren sesión vigente y rol ADMIN; los permisos se vuelven a comprobar en las transacciones y después de IO. Cualquier ADMIN vigente puede consultar un caso, pero recuperar una decisión exige ser su responsable. Las rutas del comprador conservan sesión de su cuenta o `X-Pedido-Acceso` de invitado; una cuenta ADMIN no adquiere propiedad por su rol en esas rutas. Cookie inválida no convierte la compra en invitada.

POST exige origen permitido y `X-CSRF-Token`. Aplican límites de consulta/creación de pedidos y cabeceras `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`, incluidos errores. El streaming utiliza nombre fijo y no devuelve rutas de disco, hashes o URL pública. La autorización se vuelve a comprobar después de leer los bytes y antes de servirlos.

## Bandeja y detalle

La bandeja admite exclusivamente `pagina` —desde 1, máximo 100000—, `limite` —predeterminado 20, máximo 50—, `busqueda` —hasta cien caracteres— y `estado`: `RECIBIENDO`, `RECIBIDA`, `REQUIERE_ATENCION` o `PEDIDO_CREADO`. Búsqueda literal por referencia, código de pedido, cuenta o correo histórico de compra; conserva invitados sin atribuirlos por correo. Ordena por fecha/UUID descendentes.

Devuelve `{ recepciones, paginacion: { pagina, limite, total, paginas }, resumen }`. El total corresponde al filtro; `resumen` cuenta los cuatro estados de toda la bandeja, independientemente de la página. Las filas contienen referencia, estado/versión, fecha, contacto de compra, distrito, método, importe original, motivos, tipo de comprador y pedido si existe. Las recepciones previas al pedido no se suman como ventas o pagos aprobados.

El detalle incluye la proyección privada de recepción, todas sus versiones de comprobante y un historial con acción/estado, actor, responsable, motivo interno, mensaje público, versiones y fechas. No expone claves físicas, hashes, tokens de lease ni respuestas arbitrarias del JSON de auditoría.

`diagnostico.actual` indica si la compra coincide ahora; `diagnostico.condicionesOriginales` comprueba si puede registrarse aceptando sus importes/plazo originales. Cada diagnóstico devuelve `{ apto, motivos }` con el primer impedimento detectado. Es una lectura: no reserva stock ni modifica la recepción. Un fallo de infraestructura devuelve 503 y no inventa un diagnóstico comercial.

`capacidades.registrarPedido` exige atención, disponibilidad completa y ausencia de corrección/operación pendientes; `solicitarCorreccion` exige recepción recibida o en atención, sin otra solicitud abierta ni operación pendiente. Las acciones vuelven a comprobar todo bajo bloqueo; una capacidad leída no garantiza disponibilidad futura.

## Registrar condiciones originales

```text
{
  claveSolicitud: UUID v4,
  versionEsperada: entero positivo,
  comprobanteActualId: UUID v4,
  motivo: texto de 3 a 300 caracteres,
  confirmado: true,
  aceptarCondicionesOriginales: true
}
```

Requiere `REQUIERE_ATENCION`, versión y comprobante vigentes y ninguna corrección abierta u operación pendiente. No admite otro total, precio, dirección, método o carrito desde el cuerpo. Mantiene el destino y preparación de la instrucción.

Acepta explícitamente los precios, tarifa y plazo originales aunque hayan cambiado, tanto si el precio sube como si baja. Exige todavía cobertura habilitada y con tarifa actual definida, producto publicado, marca/categoría activas, identidad variante/producto coincidente, variante habilitada, fotografía disponible y todas las unidades libres. Concilia reservas activas con su contador. La Esperanza conserva gratuidad y se mantienen los siete códigos de distrito existentes.

Comparte el procesamiento `PROCESAR` mediante la acción `REGISTRAR_PEDIDO`. Reserva la copia privada antes del IO y registra pedido, instrucción, pago pendiente, procedencia del comprobante, unidades, reservas y eventos en una transacción. Las unidades y líneas usan el mismo precio original, sin mezclarlo con el precio actual. La política de reservas se lee al registrar; no se descuenta físico.

El comprador sigue siendo la cuenta o el invitado de la instrucción. El administrador queda como actor/responsable de la decisión y los eventos. Un pedido invitado conserva su hash privado y obtiene su propio plazo de acceso desde creación; no se convierte en compra administrativa.

Resultado HTTP 200 con el contrato de [procesamiento](api-procesamiento-recepciones.md): `{ recepcion, operacion, resultado, pedido }`. Si ya no hay disponibilidad completa, registra `REQUIERE_ATENCION` y su motivo, sin pedido ni reservas parciales. El intento confirmado conserva su respuesta y consume su clave; una decisión posterior requiere consultar la nueva versión y utilizar otra clave. Un fallo 5xx revierte el registro y conserva operación/copia recuperables, no una aprobación o rechazo ficticios.

Los reintentos con igual cuerpo y responsable recuperan su resultado antes de exigir versión actual. Una operación activa devuelve 202; GET del responsable puede conciliarla cuando vence su lease y corresponde revisar. Otro administrador no puede reutilizar la clave ni recuperar su resultado privado. Un resultado de atención anterior sigue siendo histórico después de registrar el pedido; una nueva consulta de recepción muestra el estado vigente.

## Solicitar corrección

```text
{
  claveSolicitud: UUID v4,
  versionEsperada: entero positivo,
  comprobanteActualId: UUID v4,
  motivo: texto interno de 3 a 300 caracteres,
  mensaje: texto público de 3 a 500 caracteres,
  confirmado: true
}
```

Admite `RECIBIDA` o `REQUIERE_ATENCION` antes de crear el pedido. Conserva los motivos comerciales, añade `COMPROBANTE_REQUIERE_CORRECCION`, incrementa versión y registra responsable y resultado idempotente en la misma transacción. No modifica la imagen actual, el método, destino, importe o inventario. Dos solicitudes simultáneas no dejan dos correcciones abiertas.

Devuelve 200 con `{ recepcion, operacion, resultado: "SOLICITAR_CORRECCION", correccion: { solicitudId, mensaje } }`. Su respuesta inicial se recupera por clave sin reescribirla. El motivo interno aparece solo en el detalle administrativo; el comprador recibe el mensaje público al consultar su recepción.

GET de recepción añade, cuando hubo solicitud, `correccion: { solicitudId, mensaje, pendiente, versionEsperada }`. `pendiente` corresponde al comprobante actual y al motivo de corrección todavía abierto. La respuesta histórica del POST inicial de recepción se conserva sin este agregado; una lectura posterior muestra el estado vigente.

## Adjuntar y recuperar otra imagen

```text
{
  claveSolicitud: UUID v4,
  versionEsperada: entero positivo,
  comprobante: {
    nombreArchivo,
    tipoArchivo: "image/png" | "image/jpeg" | "image/webp",
    contenidoBase64,
    numeroOperacion?
  }
}
```

Solo el propietario y la versión autorizada pueden adjuntar. Conserva el número de operación informado en la imagen anterior —incluida su ausencia—: la corrección no declara otra transferencia. No acepta método, beneficiario, monto o propietario alternativos.

La ruta usa expresamente el middleware de JSON de hasta 8 MiB con CSRF y límite antes de cargar el cuerpo. Reutiliza imágenes de hasta 5 MiB, estáticas, veinte megapíxeles y 8192 píxeles por lado, con firma/MIME/base64 canónico, decodificación real y eliminación de metadatos. Normaliza nombre a NFC y conserva ceros iniciales del número.

Reserva en MySQL una versión nueva de `ComprobanteRecepcionCompra` y una operación `ADJUNTAR_COMPROBANTE` antes de escribir en disco. El hash comprende recepción, versión esperada, propietario, metadatos y SHA-256 de los bytes originales. Las versiones anteriores y la respuesta inicial de recepción no se sobrescriben.

Un lease de sesenta segundos controla la escritura exclusiva; solo un archivo con tamaño/hash verificados pasa a `DISPONIBLE`. Confirmar archivo, seleccionar la nueva versión, incrementar recepción y guardar resultado ocurre en una transacción. La fecha de recepción y el vencimiento invitado originales se conservan.

POST devuelve 201 al confirmar una versión nueva, 202 si el intento sigue pendiente y 200 al recuperar una confirmada; una confirmación con retorno perdido puede recuperarse con 200. Respuesta final: `{ recepcion, operacion, resultado: "ADJUNTAR_COMPROBANTE" }`. Mientras está pendiente, la proyección sigue mostrando el comprobante actual anterior y `operacion.estado: "PENDIENTE"`; esa nueva imagen todavía no puede servirse.

Una misma clave nunca crea dos versiones. Otra imagen o metadatos con esa clave devuelve conflicto. Si faltan bytes, reenviar la misma imagen con la misma clave; si ya se escribieron, GET de operaciones puede confirmar sin reenviar ni recodificar cuando corresponda su revisión. Las escrituras inciertas y los rollback conservan la evidencia. No hay aprobación de fondos ni creación automática de pedido al adjuntar.

Después de confirmar, se retira únicamente `COMPROBANTE_REQUIERE_CORRECCION`. Si quedan motivos comerciales, continúa en atención y requiere decisión ADMIN; si no quedan, vuelve a `RECIBIDA` para procesamiento explícito. Las respuestas de operaciones antiguas siguen recuperables, también después de varios ciclos de corrección. Todas las versiones disponibles pueden consultarse con propiedad/permiso verificados.

## Errores, límites y siguiente entrega

Usa 400 para contrato/filtros/imágenes inválidos, 401/403 para sesión/rol/origen/CSRF, 404 para recursos ajenos o inexistentes, 409 para claves, versiones, comprobante o estado incompatibles, 413 para JSON excesivo, 429 para límites y 503 para infraestructura o registros incompatibles. Los errores no exponen SQL, rutas o mensajes internos. Solicitar otra imagen o aceptar condiciones originales no reembolsa ni certifica un abono.

La [integración Angular administrativa de recepciones](../../soho-frontend/docs/integracion-recepciones.md) ya está terminada: bandeja/detalle, diagnóstico, imágenes privadas, confirmaciones, solicitudes y recuperación de decisiones inciertas. Sigue conectar Configuración → Pagos y después el checkout con sus instrucciones/recepción/correcciones. Mantener nuevas emisiones desactivadas hasta disponer del recorrido completo.

## Validación

`npm.cmd run test:atencion` exige `TEST_ATENCION_DATABASE_URL` local, exclusiva, migrada y vacía con sufijo `_test`; no usa `DATABASE_URL` como alternativa. Las imágenes se guardan en un directorio temporal propio y los proveedores reales están bloqueados en las pruebas.

Pasaron **1782 pruebas**: 857 unitarias, nueve HTTP generales, 545 de regresión MySQL, 64 nuevas de atención/correcciones con HTTP/disco/MySQL, 47 de procesamiento, 56 de recepción, 61 de instrucciones, 59 de Pagos/QR, 30 de fotografías y 54 de publicados. Incluyen propiedad y responsable, precio en líneas/unidades, siete distritos, cobertura pendiente, paginación/conteos, concurrencia, rollback, COMMIT/HTTP perdidos, cambio de rol/revocación durante IO, varios ciclos de corrección, recuperación de archivos y conservación de evidencia.

Pasaron compilación NestJS, TypeScript completo, lint sin avisos y formato. Prisma, trece migraciones, cliente generado y fuentes Angular conservan sus hashes; no se contactó `soho_db` ni proveedores reales. Evidencia: `.checkout-review/atencion-recepciones-api/validacion.json` desde la raíz SOHO.
