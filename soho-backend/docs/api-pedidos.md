# API de pedidos y comprobantes privados

Esta entrega implementa creación y consulta de pedidos con Prisma y MySQL. Requiere las seis migraciones, incluida `20261114000000_pedidos_iniciales`. No añade migraciones ni aplica cambios a `soho_db`. El checkout Angular y Mis pedidos ya están conectados; consultar [Integración de pedidos](../../soho-frontend/docs/integracion-pedidos.md).

La [revisión administrativa y corrección de comprobantes](api-pagos.md) amplía estos endpoints sin cambiar el esquema.

## Rutas

| Método | Ruta                                    | Acceso                                             | Resultado                                                  |
| ------ | --------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| POST   | `/api/pedidos`                          | Cuenta o invitado, con CSRF                        | 201 al crear; 200 al repetir la misma solicitud confirmada |
| GET    | `/api/pedidos/mios?pagina=1&limite=20`  | Cuenta                                             | Pedidos propios y paginación                               |
| GET    | `/api/pedidos/creacion/:clave`          | Propietario, invitado con credencial o ADMIN       | Recuperación privada de una creación confirmada            |
| GET    | `/api/pedidos/:codigo`                  | Propietario, invitado con credencial o ADMIN       | Detalle privado                                            |
| GET    | `/api/pedidos/:codigo/comprobantes/:id` | Mismo permiso, comprobante perteneciente al pedido | Imagen privada                                             |

El recurso y las piezas de configuración, DTO, validación, sesión, HTTP y archivos se generaron con Nest CLI y después se adaptaron a ESM y Prisma. Se retiraron las plantillas de actualización y entidad que no correspondían a esta entrega. No se ofrecen el PATCH ni el DELETE genéricos del generador.

La integración Angular añade `GET /api/pedidos/creacion/:clave` para recuperar una respuesta perdida sin reenviar contacto ni imagen. Requiere UUID v4 y los mismos permisos de propietario, invitado o ADMIN que el detalle; un 404 no autoriza a generar una clave nueva mientras un intento pueda seguir en proceso.

## Sesión e invitados

Una cuenta se obtiene exclusivamente de la cookie de sesión validada. El cuerpo no admite `usuarioId`, roles, estados ni propietarios. Una cookie presente pero inválida, duplicada, revocada o vencida responde 401: no se transforma la compra en invitado.

Un invitado genera antes de crear una compra una credencial aleatoria de 32 bytes representada como 64 caracteres hexadecimales en minúsculas. La envía en `X-Pedido-Acceso` al crear, reintentar, consultar y recuperar el archivo. Cada pedido requiere su propia credencial. El servidor conserva solamente SHA-256 y un vencimiento de treinta días; no devuelve el secreto ni lo utiliza en una URL. El código visible `SOHO-…` no concede acceso. No atribuye compras por coincidencia de correo ni crea cuentas artificiales.

Las solicitudes con sesión utilizan la identidad de esa sesión, incluso si incluyen el encabezado de invitado. ADMIN puede consultar pedidos y comprobantes ajenos, pero no reutilizar sus claves de creación. `/mios` siempre lista únicamente los de la cuenta actual.

La escritura conserva el contrato JSON y la protección existente: cookie CSRF HttpOnly, `X-CSRF-Token` obtenido desde `GET /api/auth/csrf` y `Origin` autorizado. El middleware comprueba CSRF y limita a diez intentos por IP y minuto **antes** de leer el JSON grande. Las lecturas tienen el límite existente de sesenta solicitudes por IP y minuto. Estos contadores están en memoria por proceso.

## Creación

Ejemplo de estructura; `contenidoBase64` debe reemplazarse por el contenido real de una imagen:

```json
{
  "claveCreacion": "0dad34aa-ec52-44c2-80cf-8352f52a565e",
  "contacto": {
    "nombres": "Ana María",
    "apellidos": "De la Cruz",
    "correo": "ana@example.test"
  },
  "entrega": {
    "destinatario": "María del Carmen De la Cruz",
    "celular": "987654321",
    "distrito": "la-esperanza",
    "direccion": "Av. Prueba 123",
    "referencia": "Puerta azul"
  },
  "facturacion": {
    "tipo": "BOLETA",
    "tipoDocumento": "DNI",
    "numeroDocumento": "00123456"
  },
  "articulos": [
    {
      "sku": "SKU-REAL-DEL-CATALOGO",
      "cantidad": 2,
      "precioUnitarioEsperado": "99.99"
    }
  ],
  "cotizacion": {
    "costoEnvio": "0.00",
    "plazoEntrega": null,
    "total": "199.98"
  },
  "metodoPago": "YAPE",
  "comprobante": {
    "nombreArchivo": "recibo.png",
    "tipoArchivo": "image/png",
    "contenidoBase64": "BASE64_REAL_SIN_PREFIJO_DATA",
    "numeroOperacion": "001234"
  }
}
```

El contrato rechaza campos desconocidos en todos los niveles. Nombres y apellidos admiten de dos a ochenta caracteres; correo, hasta 254. Destinatario admite de dos a 140; si se omite, se utiliza el nombre completo del contacto y se valida ese límite. Celular exige nueve dígitos empezando por 9. Dirección admite de seis a 180 y referencia hasta 200, conservando saltos de línea. Se rechazan caracteres de control y de formato invisibles, salvo CR/LF en la referencia. El distrito utiliza el código existente.

Facturación es opcional. BOLETA admite DNI de ocho dígitos, CE alfanumérico de nueve a doce o PAS de seis a doce. FACTURA exige RUC de once dígitos con prefijo 10, 15, 17 o 20, razón social de dos a 160 y domicilio fiscal de seis a 180. No se mezclan datos fiscales de factura en una boleta. Los documentos y la operación son texto para conservar ceros iniciales. Guardar esos datos no emite un documento fiscal.

Se admite de una a cincuenta variantes distintas y hasta cien pares en total; cada cantidad es un entero de uno a cien. Cada SKU aparece una sola vez. La identidad real de la variante, sus datos y su precio proceden de MySQL. Los importes esperados son texto decimal con dos posiciones y funcionan como confirmación de la cotización: nunca sustituyen los precios del catálogo. No se aceptan cupones ni se convierte `DEMO10` en una promoción real; el descuento de esta entrega es cero.

La cotización comprueba distrito habilitado, tarifa definida, importe y plazo actuales. Conserva los siete distritos y utiliza sus valores persistidos. La Esperanza sigue gratuita; una tarifa pendiente no se convierte en cero. La API no modifica cobertura.

## Idempotencia y transacción

`claveCreacion` es un UUID v4 generado antes del primer intento. Para un reintento se conservan clave, identidad o credencial de invitado y datos originales, incluida la imagen original. El servidor calcula un hash del contrato normalizado y del contenido original del comprobante.

Una solicitud confirmada se devuelve con 200 y `reutilizado: true`, aunque el catálogo o la cobertura hayan cambiado después. Una clave utilizada por otra identidad o con datos diferentes responde 409 sin exponer el pedido anterior. El primer registro devuelve 201 y `reutilizado: false`; ambos incluyen `pedido`.

Después de validar y procesar la imagen, una transacción con bloqueos:

1. Revalida sesión y cuenta activa, si corresponde.
2. Lee la política y la cobertura vigentes, impidiendo cambios concurrentes mientras confirma.
3. Bloquea variantes y sus datos comerciales, verifica publicación, marca y categoría activas, fotos, precio y disponibilidad `existencias - cantidadReservada`.
4. Calcula importes con `Prisma.Decimal`; compara precios, envío, plazo y total esperados.
5. Guarda pedido, contacto y domicilio históricos, artículos, importes por unidad, facturación opcional, pago pendiente, primera versión del comprobante, reservas e historial visible.
6. Incrementa `cantidadReservada` por la cantidad exacta de cada línea. No modifica existencias físicas ni registra una salida de inventario.

Todo cambio de base de datos se revierte si falla cualquier línea. Los bloqueos evitan sobreventa ante solicitudes simultáneas. Los deadlocks se reintentan hasta tres veces. Una colisión concurrente de clave recupera el pedido ya confirmado y retira el archivo duplicado.

Cloudinary y MySQL no comparten una transacción. El comprobante se carga con un identificador aleatorio, tipo `authenticated` y `overwrite: false` antes de la transacción SQL. El backend confirma su identidad, contexto, formato y tamaño mediante Admin API. Si se confirma que no hubo registro, elimina el objeto. Si se pierde la respuesta del COMMIT, consulta la clave antes de decidir: conserva el comprobante posiblemente confirmado y el cliente reintenta con la misma clave. Una caída del proceso puede dejar un objeto huérfano; la conciliación compara `comprobantes_pago.archivo_clave` con los objetos privados y nunca elimina ante dudas o durante una creación en curso.

## Archivos y privacidad

Solo se admite JSON UTF-8 sin compresión. El POST de creación tiene límite de ocho MiB; las otras rutas conservan dieciséis KiB. El comprobante debe contener base64 canónico, sin prefijo `data:`, de un archivo de hasta cinco MiB.

Se valida firma, MIME y decodificación completa con [sharp](https://sharp.pixelplumbing.com/api-constructor/). Solo PNG, JPEG y WebP estáticos, hasta veinte megapíxeles y 8192 px por dimensión. Se vuelve a codificar el archivo, se aplica la orientación y se eliminan metadatos y contenido añadido. También se limita el resultado a cinco MiB, el procesamiento a cinco segundos y a dos imágenes simultáneas por proceso.

Los comprobantes nuevos se guardan en Cloudinary como imágenes `authenticated` bajo `SOHO/comprobantes`; sus claves internas son aleatorias y nunca se convierten en URL para el cliente. Se requieren `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` únicamente en el backend. Las rutas autorizan primero al propietario, invitado vigente o ADMIN y después el servidor solicita a Cloudinary una transformación firmada WebP, limitada a 1600 × 1600 y calidad automática. El backend transmite esos bytes optimizados con `no-store`; no entrega ni registra la URL firmada. Los originales permanecen privados en Cloudinary.

Las claves históricas `comprobantes/<uuid>.<extensión>` siguen leyéndose desde el directorio privado configurado con `PEDIDOS_DIRECTORIO_PRIVADO` o `.privado`. No se trasladan automáticamente: para conservarlas, ese almacenamiento debe seguir disponible. Las nuevas cargas no tienen una copia local de respaldo ni cambian de proveedor silenciosamente si Cloudinary no está configurado.

Las respuestas no contienen claves de almacenamiento, hashes, ID de propietario, credenciales, URL firmadas, responsables de revisión ni eventos internos. La imagen se devuelve solo después de autorizar el pedido y comprobar su pertenencia e integridad. Usa nombre de descarga generado, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.

## Errores

| Estado | Casos                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------- |
| 400    | Contrato, documento, cantidad, imagen o JSON inválidos                                         |
| 401    | Falta identidad o credencial; sesión inválida o vencida                                        |
| 403    | CSRF u origen no permitido                                                                     |
| 404    | Pedido o comprobante inexistente, ajeno o acceso de invitado vencido                           |
| 409    | Clave utilizada, precio/cotización/total cambiados, stock insuficiente o conflicto concurrente |
| 413    | JSON mayor de ocho MiB en creación; límite habitual en otras rutas                             |
| 415    | Tipo, codificación o compresión del cuerpo no admitidos                                        |
| 422    | Artículo retirado o cobertura deshabilitada/pendiente                                          |
| 429    | Límite de solicitudes; incluye `Retry-After`                                                   |
| 503    | Base, archivo o procesamiento temporalmente no disponibles; resultado de creación incierto     |

Los conflictos comerciales incluyen `codigo`: `CLAVE_CREACION_EN_USO`, `COTIZACION_CAMBIADA`, `PRECIO_CAMBIADO`, `TOTAL_CAMBIADO`, `STOCK_INSUFICIENTE`, `ARTICULO_NO_DISPONIBLE`, `COBERTURA_DESHABILITADA` o `COBERTURA_TARIFA_PENDIENTE` según corresponda.

## Validación y alcance siguiente

Pasaron 356 pruebas del backend: 230 unitarias, nueve HTTP previas y 117 con MySQL temporal, incluidas treinta y una de pedidos y recuperación privada por clave. Se mantuvieron las 293 comprobaciones SQL del esquema. Se verificaron contratos estrictos, validación real de imágenes, propiedad e invitados, notas internas, importes y facturación, cotización, reintentos, bloqueos, rollback, últimas unidades, sesión revocada durante el procesamiento, recuperación tras COMMIT y limpieza de archivos. También pasaron compilación, TypeScript completo, lint y formato. Un proceso real de la API compilada comprobó por HTTP creación, reintento, detalle, privacidad, recuperación de imagen, CSRF y reserva sin salida física. Evidencia en `.checkout-review/pedidos-api/` desde la raíz SOHO, con resultados separados en `resultado.json` y `resultado-smoke.json`. No se utilizó `soho_db` para pruebas.

La integración Angular ya utiliza esta API en checkout y Mi cuenta. La [revisión y corrección de pagos](api-pagos.md), la [preparación y envíos](api-envios.md), la [cancelación y liberación de reservas retenidas](api-cancelaciones.md) están integradas con Angular. Las respuestas incorporan el objeto seguro `envio` con transportista, referencia y fechas; las notas internas y empleados no se publican. El [trabajador de vencimientos](vencimientos-reservas.md) atiende la política histórica de reservas temporales pendientes u observadas y conserva pagos aprobados y reservas retenidas al cancelar. La [recuperación administrativa de reservas](api-recuperacion-reservas.md) resuelve incidencias por vencimiento sin cambiar el pago ni los importes. Sus alertas, metadatos de recuperación e historial interno solo se publican en administración. Incidencias generales de stock y posventa siguen pendientes. Aprobar pagos conserva el stock físico; el descuento ocurre una sola vez al registrar el envío.
