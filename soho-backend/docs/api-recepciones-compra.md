# API de recepción privada de comprobantes

Continuidad al 16 de noviembre de 2026: la [atención administrativa y las correcciones](api-atencion-recepciones.md) ya están implementadas sobre el esquema vigente. Sigue su integración Angular, manteniendo nuevas emisiones desactivadas. Las referencias del cuerpo a atención futura describen la etapa original de esta guía.

Implementada el 15 de noviembre de 2026, America/Lima, sobre el [esquema de la decimotercera migración](esquema-recepciones-compra.md). Reutiliza las [instrucciones de pago](api-instrucciones-pago.md), el acceso de cuenta/invitado y el almacenamiento privado de pedidos. Las seis piezas nuevas se generaron con Nest CLI. No requiere otra migración ni regenerar Prisma; conserva Angular y el `.env` real.

Esta etapa conserva evidencia antes de crear el pedido. Confirma la persistencia del comprobante declarado por el comprador; la revisión del pago y la reserva de inventario corresponden al procesamiento posterior. `PAGOS_CHECKOUT_ACTIVO` permanece desactivado por defecto hasta completar procesamiento, atención ADMIN y Angular. Pausar nuevas instrucciones permite seguir recibiendo evidencia de instrucciones existentes y autorizadas.

## Rutas

| Método y ruta                                                | Resultado                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `POST /api/pagos/recepciones`                                | Recibir o recuperar una carga de la misma compra.                        |
| `GET /api/pagos/recepciones/creacion/:clave`                 | Recuperar por la clave canónica de recepción.                            |
| `GET /api/pagos/recepciones/:id`                             | Consultar el estado actual y recuperar un archivo pendiente verificable. |
| `GET /api/pagos/recepciones/:id/comprobantes/:comprobanteId` | Obtener bytes privados de una versión confirmada de esa recepción.       |

Exigen sesión de la cuenta propietaria o credencial invitada de 32 bytes en `X-Pedido-Acceso`, con las mismas reglas de [pedidos](api-pedidos.md). ADMIN solo consulta aquí sus compras propias; la bandeja administrativa de recepciones queda para una entrega posterior. No se atribuye propiedad por correo, referencia visible o UUID. Una cookie inválida no convierte la petición en invitada.

No admiten filtros ni parámetros de consulta. Los identificadores UUID v4 se normalizan a minúsculas. Todas las respuestas, incluidos errores del parser y autorización, usan `no-store`, `nosniff` y `no-referrer`. El streaming tiene nombre fijo `comprobante.png`, `.jpg` o `.webp`, sin ruta del disco ni URL pública. Para invitados se solicita con su encabezado privado, nunca con un token en la URL.

## Recibir

POST exige origen permitido y `X-CSRF-Token`, también como invitado. El middleware reutilizado valida CSRF y el límite `crear-pedido` antes de leer el JSON de hasta 8 MiB. Las consultas usan `consultar-pedido`.

```text
{
  claveSolicitud: UUID v4,
  instruccionPagoId: UUID v4,
  comprobante: {
    nombreArchivo: texto sin rutas,
    tipoArchivo: "image/png" | "image/jpeg" | "image/webp",
    contenidoBase64: base64 canónico sin prefijo data:,
    numeroOperacion?: texto de uno a doce dígitos
  }
}
```

Conserva ceros iniciales del número de operación y normaliza el nombre a NFC. Rechaza propiedades desconocidas y no acepta otra preparación, dirección, precio, total o propietario. La instrucción congelada del servidor determina la compra.

Reutiliza la validación real de pedidos: original de hasta 5 MiB, formato/MIME coherentes, imagen estática de hasta veinte megapíxeles y 8192 píxeles por lado. Decodifica todos los píxeles, orienta la imagen y retira metadatos y contenido añadido. Registra SHA-256 de los bytes originales y de los preparados. El límite compartido de procesamiento de imágenes evita duplicar recursos entre pedidos y recepciones.

La recepción valida instrucción, propietario y acceso, pero conserva evidencia aunque el método se haya desactivado o hayan cambiado precio, stock, producto o cobertura. Los siete distritos y los importes originales permanecen en la instrucción. Esos cambios se atenderán al procesar la compra, sin pedir automáticamente otra transferencia.

## Estados y respuesta

POST devuelve:

- **201:** recepción nueva confirmada con archivo disponible.
- **202:** intento persistido en `RECIBIENDO`; el archivo todavía no está confirmado. Incluye `Retry-After: 5`.
- **200:** recuperación o repetición de una recepción confirmada.

Las consultas devuelven 200 con el estado actual, incluido `RECIBIENDO`. Respuesta:

```text
{
  recepcion: {
    versionContrato: 1,
    id, referencia: "REC-…", claveSolicitud, claveCreacionPedido,
    estado: "RECIBIENDO" | "RECIBIDA" | "REQUIERE_ATENCION" | "PEDIDO_CREADO",
    version, creadoEn, recibidaEn, accesoExpiraEn,
    instruccion: { /* respuesta histórica completa, destino y preparación */ },
    comprobante: {
      id, version, nombreArchivo, formato, tamanoBytes, numeroOperacion,
      estadoArchivo: "PENDIENTE" | "DISPONIBLE", confirmadoEn
    },
    motivos: [],
    pedido: null | { codigo },
    capacidades: {
      reenviarMismaImagen, consultarComprobante,
      procesamientoDisponible: false
    }
  }
}
```

Esta API crea únicamente `RECIBIENDO` —versión 1— y confirma `RECIBIDA` —versión 2—. El esquema contempla los otros estados para el procesamiento posterior. Mientras está pendiente, `recibidaEn` y `confirmadoEn` son nulos y no se sirve el archivo. La fecha y los metadatos de una recepción confirmada no se borran si el disco queda temporalmente inaccesible; consultar sus bytes responde 503.

Al confirmar se guarda completa la respuesta inicial en `RecepcionCompra.respuesta`. Las repeticiones devuelven esa respuesta histórica; GET proyecta el estado actual. La lectura valida el snapshot inicial y sus campos contra metadatos persistidos y la instrucción, tolerando el orden de claves JSON de MySQL. Un registro incompatible devuelve 503, sin inventar una respuesta ni exponer propiedades adicionales. No entrega hashes, claves físicas, leases, incidencias internas o datos de sesión.

## Recuperación y concurrencia

1. Validar la instrucción y la autorización; comprobar una solicitud anterior antes de reprocesar la imagen.
2. Para una recepción nueva, preparar la imagen y reservar en una transacción la recepción y la identidad/metadatos de su archivo `PENDIENTE`.
3. Tomar un lease de sesenta segundos y cerrar la transacción antes del IO.
4. Escribir un temporal exclusivo, sincronizar sus bytes y publicar la identidad final con enlace duro sin sobrescribir archivos existentes. Ambos nombres están en el mismo directorio privado.
5. Verificar tamaño y SHA-256; revalidar acceso bajo bloqueo y confirmar conjuntamente archivo `DISPONIBLE`, recepción `RECIBIDA` y respuesta inicial.

El almacenamiento privado debe admitir enlaces duros dentro del mismo directorio; se comprobó en NTFS. Los temporales completos que quedaron tras una interrupción pueden verificarse y publicarse durante la recuperación. Un temporal parcial no se anuncia disponible: se puede reenviar la misma imagen con la misma clave. Los temporales incompletos de procesos interrumpidos se conservan para mantenimiento privado; no bloquean el reintento y no se sirven al comprador. No se implementa una limpieza general de comprobantes históricos.

Las consultas por UUID o clave intentan conciliar archivos pendientes cuando vence su lease y corresponde revisar; después de un fallo se programa revisión a cinco segundos. La recuperación es bajo demanda, sin un trabajador que procese compras en segundo plano. Si los bytes completos existen, se confirma sin volver a adjuntar. Si faltan, se mantiene la referencia y `reenviarMismaImagen: true`; la API no puede recuperar bytes que nunca quedaron completos en el servidor.

Una respuesta perdida después del COMMIT se recupera consultando `creacion/:clave` o repitiendo la solicitud exacta. Las escrituras inciertas nunca eliminan la fuente privada. Ante un 503 de infraestructura se conserva la clave y credencial y se consulta antes de iniciar otra acción.

La huella incluye propietario, instrucción, nombre/MIME/número de operación normalizados y SHA-256 original. Dos imágenes originales diferentes producen conflicto aunque su saneamiento diera los mismos píxeles. La misma clave con otra solicitud devuelve 409 `RECEPCION_EN_USO`; una petición de otro propietario devuelve 404.

Otra clave con idéntica instrucción, metadatos e imagen recupera la recepción existente sin registrar alias ni otra versión. La respuesta contiene su **clave canónica**: GET por una clave alternativa no registrada devuelve 404. Preparar y conservar una sola clave antes del primer POST evita esa ambigüedad.

Una instrucción y un checkout admiten una sola recepción. Dos instrucciones del mismo checkout que compiten por recibir evidencia no crean dos recepciones: una gana y la otra devuelve conflicto. La consulta estática `creacion/:clave` se declara antes de `:id`.

Se bloquean recepción, instrucción y versiones de archivo en ese orden. La inserción inicial bloquea la instrucción y comprueba de nuevo el checkout; si apareció una recepción durante la espera, reinicia por la recepción. Las restricciones únicas y los reintentos transaccionales resuelven carreras entre instrucciones diferentes. El token del lease impide que un escritor anterior confirme encima de otro. Se revalida la sesión después de preparación y escritura y antes de devolver los bytes privados; una revocación conserva la evidencia ya persistida para recuperación con una nueva sesión propia.

## Acceso y continuación

Las cuentas usan su sesión actual y `accesoExpiraEn: null`. Para invitados se guardan treinta días desde el **registro de recepción**, independientemente de los treinta días de acceso directo a la instrucción. Consultar o repetir no renueva la fecha. La recepción autorizada incluye el destino histórico aunque ya haya vencido el acceso directo a la instrucción. Después de su propio plazo devuelve 404, conservando filas y archivos. Una instrucción invitada vencida sin recepción no permite iniciar una nueva carga.

Se emplean 400 para contratos/imágenes inválidos, 401/403 para acceso/origen/CSRF, 404 para recursos propios inexistentes/no accesibles, 409 para recepción incompatible o `COMPRA_YA_REGISTRADA`, 413 para JSON excesivo, 429 para límites y 503 para infraestructura o registros que requieren revisión. Un 202 confirma exclusivamente el intento persistido, no una imagen aceptada.

El [procesamiento de una recepción `RECIBIDA`](api-procesamiento-recepciones.md) ya está implementado como acción posterior independiente: operación idempotente, copia privada y comprobación completa antes de crear pedido, pago pendiente y reservas, o conservar atención por cambios. Siguen atención ADMIN y Angular conforme al [diseño](analisis-instrucciones-pago.md). El POST inicial de recepción conserva su contrato y respuesta histórica y sigue sin crear pedidos o reservas; `procesamientoDisponible` permanece en `false` mientras se completa la activación del recorrido.

## Validación

`npm.cmd run test:recepciones` exige `TEST_RECEPCIONES_DATABASE_URL` explícita, local, exclusiva y migrada con sufijo `_test`; no toma `DATABASE_URL` como alternativa. Los archivos de las pruebas se guardan en un directorio temporal propio.

Pasaron **1669 pruebas**: 855 unitarias —nueve nuevas de almacenamiento—, nueve HTTP generales, 545 de regresión MySQL, 56 nuevas de recepción con HTTP/disco/MySQL, 61 de instrucciones, 59 de Pagos/QR, 30 de fotografías y 54 de publicados. Cubren propiedad, plazos separados, siete distritos, privacidad, validación, saneamiento, archivo temporal completo/parcial, leases, concurrencia, rollback, COMMIT y respuesta HTTP perdidos y revocación durante preparación/escritura/lectura.

Pasaron compilación NestJS, TypeScript completo, lint sin avisos y formato. Esquema, trece migraciones, cliente generado y fuentes Angular conservan sus hashes. No se contactó `soho_db` ni proveedores reales; las bases y los directorios de verificación son temporales. Evidencia final: `.checkout-review/recepciones-api/validacion.json` desde la raíz SOHO.
