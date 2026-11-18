# API de métodos e instrucciones de pago

Continuidad al 16 de noviembre de 2026: la [atención administrativa y las correcciones](api-atencion-recepciones.md) ya están implementadas sobre el esquema vigente. Sigue su integración Angular, manteniendo nuevas emisiones desactivadas. Las referencias del cuerpo a atención futura describen la etapa original de esta guía.

Continuidad al 16 de noviembre de 2026: el [procesamiento de recepciones](api-procesamiento-recepciones.md) ya registra pedido/pago pendiente/reservas o conserva evidencia para atención. Siguen atención ADMIN y Angular; las nuevas emisiones permanecen desactivadas por defecto. Las referencias del cuerpo a procesamiento futuro describen la etapa original de esta guía.

Implementada el 15 de noviembre de 2026, America/Lima, sobre las trece migraciones existentes. No requiere otra migración ni regenerar Prisma. Las once piezas nuevas se generaron con Nest CLI. Posteriormente se implementó la [recepción privada recuperable](api-recepciones-compra.md). Siguen procesamiento, atención administrativa y Angular conforme al [diseño acordado](analisis-instrucciones-pago.md).

## Activación y compatibilidad

`PAGOS_CHECKOUT_ACTIVO` vale `false` por defecto. Solo el texto exacto `true` habilita nuevas instrucciones. La opción está documentada en `.env.example`; esta entrega no cambia el `.env` real ni publica cuentas receptoras. **Mantenerla desactivada hasta completar recepción, procesamiento, atención y Angular.**

Con la opción desactivada, el catálogo público devuelve `disponible: false` y `metodos: []`; emitir una instrucción nueva devuelve 503. La versión pública sigue siendo la de la publicación vigente, o cero si no existe. Recuperar o repetir una instrucción existente sigue permitido a su propietario durante una pausa, sin cambiar su destino o renovar el acceso invitado.

El contrato v1 de pedidos conserva normalización, orden de propiedades, SHA-256 y recuperación de compras confirmadas. Mientras la opción esté desactivada, su creación funciona como antes. Al activarla, una creación v1 nueva devuelve 409 `INSTRUCCION_PAGO_REQUERIDA`; recuperar/repetir pedidos anteriores sigue funcionando. No se inventan instrucciones para pagos anteriores.

## Rutas y seguridad

| Método y ruta                                     | Acceso y resultado                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/configuracion/pagos`                    | Público: versión y códigos/nombres de métodos disponibles.                             |
| `POST /api/pagos/instrucciones`                   | Propietario: preparación verificada e instrucción histórica; 201 nueva o 200 repetida. |
| `GET /api/pagos/instrucciones/operaciones/:clave` | Propietario: recuperar la emisión por su clave de solicitud.                           |
| `GET /api/pagos/instrucciones/:id`                | Propietario: recuperar la misma respuesta por UUID.                                    |

No aceptan parámetros de consulta. Los identificadores son UUID v4; en el contrato nuevo se normalizan a minúsculas. Se rechazan propiedades desconocidas. Aplican límites existentes de consulta y creación de pedidos y cabeceras `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`, incluidos errores del parser o de autorización.

Las rutas privadas utilizan la sesión de cuenta o `X-Pedido-Acceso` para invitados: secreto aleatorio de 32 bytes representado por 64 caracteres hexadecimales en minúsculas. Solo se guarda su SHA-256. Una sesión válida prevalece sobre ese encabezado; una cookie de sesión inválida no convierte la petición en invitada. La propiedad procede de `Usuario.id` o del hash invitado, nunca del correo ni del cuerpo. Un ADMIN tampoco consulta instrucciones de otro comprador a través de estas rutas.

POST requiere origen permitido y `X-CSRF-Token`, también para invitados. Reutilizar el intercambio de cookies/CSRF de autenticación y el [acceso de pedidos](api-pedidos.md). JSON admite hasta 16 KiB; no contiene imágenes. La autorización de cuenta se comprueba de nuevo después de los bloqueos y antes de confirmar la inserción.

## Catálogo público

Ejemplo de respuesta cuando la capacidad esté habilitada y exista una publicación utilizable:

```json
{
  "version": 7,
  "disponible": true,
  "metodos": [
    { "metodo": "YAPE", "nombre": "Yape" },
    { "metodo": "PLIN", "nombre": "Plin" }
  ]
}
```

Solo presenta métodos activos con celular/titular completos y QR disponible si fue configurado. Sin publicación o sin métodos utilizables devuelve lista vacía. No publica número receptor, titular, URL de QR, auditoría ni contacto de Tienda. La configuración administrativa conserva su [API independiente](api-configuracion-pagos.md).

## Emitir una instrucción

Preparar y conservar ambas claves y, para invitado, la credencial **antes** del POST. Cuerpo:

```text
{
  claveSolicitud: UUID v4,
  claveCreacionPedido: UUID v4,
  metodo: "YAPE" | "PLIN",
  versionConfiguracionEsperada: entero de 1 a 4294967295,
  preparacion: {
    contacto: { nombres, apellidos, correo },
    entrega: { destinatario?, celular, distrito, direccion, referencia? },
    facturacion?: { tipo, tipoDocumento, numeroDocumento, razonSocial?, domicilioFiscal? },
    articulos: [{ sku, cantidad, precioUnitarioEsperado }],
    cotizacion: { costoEnvio, plazoEntrega, total }
  }
}
```

Contacto, entrega y facturación reutilizan las reglas de pedidos: boleta/factura opcional, documentos como texto para conservar ceros iniciales, celular nacional y destinatario completo. Los importes se envían como texto con dos decimales; `plazoEntrega` admite `null`. Máximo cincuenta SKU distintos y cien pares en total, sin líneas duplicadas ignorando mayúsculas. No se aceptan propietario, roles, comprobante, reservas, destino bancario ni total recalculado por el cliente como autoridad.

El contrato nuevo normaliza texto NFC, opcionales y espacios; ordena artículos por SKU y calcula huellas versionadas. Esta normalización pertenece a instrucciones y no cambia la huella histórica de pedidos v1.

El servidor verifica bajo transacción:

1. Publicación esperada, método activo, celular/titular y QR confirmado correspondiente al método.
2. Distrito habilitado, tarifa definida y coincidencia de tarifa/plazo cotizados.
3. Producto publicado, marca/categoría activas, identidad modelo/color/SKU, variante habilitada y fotografía vigente disponible. Admite productos anteriores y productos por modelo/color con tallas decimales.
4. Precio esperado, stock disponible, coherencia entre reservas activas y contador, subtotal y total calculados con Decimal.

Se conservan los siete códigos: `la-esperanza`, `trujillo`, `el-porvenir`, `florencia-de-mora`, `victor-larco`, `huanchaco` y `moche`. La Esperanza conserva envío gratuito; las otras tarifas y habilitaciones proceden de la configuración persistida. Una tarifa pendiente nunca se convierte a cero. Las pruebas habilitan tarifas sintéticas exclusivamente en MySQL temporal.

## Respuesta histórica

```text
{
  versionContrato: 1,
  instruccionId, claveCreacionPedido, metodo, versionConfiguracion, emitidaEn,
  moneda: "PEN", importeReferencia: "199.98",
  preparacion: { /* estructura normalizada completa */ },
  verificacion: {
    distritoNombre, subtotal, costoEnvio, plazoEntrega, total,
    articulos: [{
      varianteId, productoId, sku, nombreProducto, color, sistemaTalla,
      talla: "40.5", cantidad, precioUnitario, importe
    }]
  },
  destino: {
    celular, titular,
    qr: null | { id, url, formato, ancho, alto }
  },
  accesoExpiraEn: null | fechaISO
}
```

`preparacion` conserva los datos de compra y su huella; `verificacion` añade las identidades e importes comprobados por el servidor. El SKU decimal conserva `40P5` y la talla verificada se entrega como texto `40.5`. El destino incluye únicamente los datos publicados para ese método. QR conserva su UUID y URL HTTPS de Cloudinary, sin credenciales, firma, datos de carga ni consulta al proveedor durante emisión/recuperación.

La respuesta se guarda completa en `InstruccionPago.respuesta`. Al recuperarla se validan estructura, huella de preparación, importes, cantidades, sumas y metadatos contra la fila; no se reconstruye usando configuración o catálogo actuales. Un registro incompleto o incompatible devuelve 503 y exige revisión. No se añaden después estados de recepción a este JSON.

Para cuentas, `accesoExpiraEn` es nulo. Para invitados se calcula desde la emisión usando el plazo privado vigente de pedidos —treinta días—; después devuelve 404 sin borrar el registro ni renovar la fecha al consultar/repetir. Esa fecha limita el acceso invitado y no representa vencimiento de una reserva o de la instrucción.

La emisión no crea pedido, pago, recepción, reserva ni movimiento; no modifica stock físico o reservado. Los bloqueos terminan con la transacción. El stock y las condiciones pueden cambiar después de mostrar el destino. La instrucción no acredita una transferencia ni aprueba un pago. Las fotografías del catálogo no se congelan desde la emisión: al crear el pedido se elegirá una vigente según el diseño acordado.

## Repetición y concurrencia

La misma clave, cuerpo normalizado y propietario devuelve exactamente la respuesta guardada antes de comprobar versión, método o disponibilidad actuales. Otra solicitud con esa clave devuelve 409 `CLAVE_INSTRUCCION_EN_USO`; las consultas ajenas devuelven 404. Ante respuesta incierta, conservar solicitud y credencial y consultar `operaciones/:clave`; no emitir automáticamente otra instrucción.

Una clave de checkout puede tener varias emisiones del mismo propietario antes de recibir la compra, por ejemplo para cambiar explícitamente de método antes de transferir. No admite otro propietario. Si ya existe recepción o pedido para ese checkout, una emisión nueva devuelve 409 `CHECKOUT_YA_REGISTRADO`; la original sigue recuperable.

Se usa un bloqueo exclusivo de la fila de control de Pagos tanto para publicación como para emisión. Es más fuerte que el bloqueo compartido inicialmente propuesto: serializa también la primera atribución del checkout sin tabla adicional. Después se bloquean instrucciones de ese checkout, QR y condiciones comerciales. Los bloqueos de inventario/fotografías se comparten con la creación v1. La transacción autorizada reutiliza reintentos de conflictos; tras un error de retorno comprueba si la emisión quedó confirmada por clave y propietario. No hay llamadas externas dentro de esas transacciones.

## Errores y continuación

Además de 400/401/403/404/413/429/503, se emplea 409 para `CLAVE_INSTRUCCION_EN_USO`, `CHECKOUT_EN_USO`, `CHECKOUT_YA_REGISTRADO`, `CONFIGURACION_PAGOS_CAMBIADA`, `COTIZACION_CAMBIADA`, `PRECIO_CAMBIADO`, `STOCK_INSUFICIENTE`, `TOTAL_CAMBIADO` e `INVENTARIO_INCONSISTENTE`; 422 para método/artículo no disponible y cobertura deshabilitada o sin tarifa. La emisión desactivada devuelve 503 `CHECKOUT_PAGOS_NO_HABILITADO`. Un error comercial previo a emitir permite revisar la compra antes de mostrar un destino.

La [recepción privada recuperable del comprobante](api-recepciones-compra.md) ya conserva evidencia antes de intentar crear el pedido, sobre el esquema aplicado. La siguiente entrega es el procesamiento idempotente; seguirán atención ADMIN por cambios y Angular. No solicitar otra transferencia automáticamente si las condiciones cambian después de una instrucción utilizada.

## Validación

La suite específica se ejecuta con `npm.cmd run test:instrucciones` y exige `TEST_INSTRUCCIONES_DATABASE_URL` local, migrada y exclusiva con sufijo `_test`. No usa `DATABASE_URL` como alternativa. Cubre cuentas/invitados, privacidad, CSRF, contratos, siete distritos, Decimal, productos por color, idempotencia/concurrencia, pérdida de respuesta, rollback, sesión revocada, QR histórico y compatibilidad v1. Los contratos corruptos se comprueban también en pruebas unitarias.

Pasaron **1672 pruebas**: 846 unitarias —39 nuevas—, nueve HTTP generales, 545 de regresión MySQL, 61 de esta API, 59 de Pagos/QR, 30 de fotografías, 54 de publicados, 42 de archivo y 26 de publicación. También compilación NestJS, TypeScript completo, lint sin avisos y formato. La evidencia final está en `.checkout-review/instrucciones-pago-api/validacion.json` desde la raíz SOHO. Todas las bases de verificación son temporales; no se contactó `soho_db` ni proveedores reales. Prisma, las trece migraciones, el cliente generado y las fuentes Angular conservan sus hashes.
