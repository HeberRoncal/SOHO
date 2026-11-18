# API administrativa de Pagos y QR

La [integración Angular de Configuración Pagos](../../soho-frontend/docs/integracion-configuracion-pagos.md) ya está terminada: publicación, QR, versiones y recuperación. Sigue conectar el nuevo checkout; mantener nuevas emisiones desactivadas hasta verificar el recorrido completo. Los contratos de esta guía se conservan.

Continuidad al 16 de noviembre de 2026: la [atención administrativa y las correcciones](api-atencion-recepciones.md) ya están implementadas sobre el esquema vigente. Sigue su integración Angular, manteniendo nuevas emisiones desactivadas. Las referencias del cuerpo a atención futura describen la etapa original de esta guía.

Continuidad al 16 de noviembre de 2026: el [procesamiento de recepciones](api-procesamiento-recepciones.md) ya registra pedido/pago pendiente/reservas o conserva evidencia para atención. Siguen atención ADMIN y Angular; las nuevas emisiones permanecen desactivadas por defecto. Las referencias del cuerpo a procesamiento futuro describen la etapa original de esta guía.

Implementada el 15 de noviembre de 2026, America/Lima, sobre el [esquema comercial de la duodécima migración](esquema-configuracion-comercial.md), cuya aplicación confirmó el usuario. No añade otra migración ni modifica Angular. Las piezas nuevas se generaron con Nest CLI y se adaptaron a ESM, Prisma, validación y seguridad existentes.

## Rutas y seguridad

Todas las rutas requieren sesión activa y rol ADMIN, aplican límites de acceso y devuelven `Cache-Control: no-store`. PATCH y POST exigen origen permitido y CSRF. La carga multipart usa `X-CSRF-Token`; el token no se envía como campo del archivo.

| Método y ruta                                           | Resultado                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/admin/configuracion/pagos`                    | Configuración vigente y capacidades de carga.                     |
| `PATCH /api/admin/configuracion/pagos`                  | Publicación conjunta de YAPE y PLIN.                              |
| `GET /api/admin/configuracion/pagos/operaciones/:clave` | Respuesta histórica de un guardado propio.                        |
| `POST /api/admin/configuracion/pagos/qr`                | Reserva y carga de un QR propio.                                  |
| `GET /api/admin/configuracion/pagos/qr/cargas/:clave`   | Consulta y, cuando corresponde, conciliación de una carga propia. |

No admiten filtros ni parámetros de consulta adicionales. Las operaciones y cargas de otro administrador devuelven 404. La API rechaza propiedades desconocidas, identificadores inválidos y tipos incorrectos. La autorización se vuelve a comprobar en la transacción después de adquirir los bloqueos; conocer una clave no autoriza recuperar su resultado.

## Consultar y publicar

Actualización del 17 de noviembre de 2026: antes de cambiar celular, titular o QR, el método debe estar desactivado en la configuración vigente. Cambiar los datos y desactivar en el mismo PATCH se rechaza con 409; primero se guarda la desactivación conservando los receptores. El reintento de una solicitud ya confirmada conserva su respuesta histórica. Angular usa Guardar cambios y aplica el QR al subirlo, manteniendo internamente estas rutas, versiones e historial. No se añaden migraciones.

Sin publicaciones, GET devuelve `configuracion.version: 0`, fecha y responsable nulos y exactamente dos métodos desactivados con celular, titular y QR nulos. No copia la activación de demostración. `capacidades` informa `cargarQr`, máximo 2097152 bytes, formatos PNG/JPEG/WebP y máximo 4096 píxeles por lado. Consultar la configuración no contacta Cloudinary.

PATCH recibe:

```json
{
  "claveSolicitud": "11111111-1111-4111-8111-111111111111",
  "versionEsperada": 0,
  "confirmado": true,
  "metodos": [
    {
      "metodo": "YAPE",
      "activo": true,
      "celular": "987654321",
      "titular": "Titular confirmado por SOHO",
      "qrId": null
    },
    {
      "metodo": "PLIN",
      "activo": false,
      "celular": null,
      "titular": null,
      "qrId": null
    }
  ]
}
```

Los datos del ejemplo describen el formato; esta entrega no los publica. Cada método activo exige un celular nacional de nueve dígitos que empiece por 9 y titular válido de hasta 120 caracteres. QR es opcional. Ambos desactivados es válido. Se normalizan UUID, texto NFC, espacios externos y orden YAPE/PLIN; los controles invisibles se rechazan. Los campos pendientes se convierten a `null`.

La respuesta 200 contiene `configuracion` —versión, fecha, responsable y métodos con su QR— y `modificada: true`. Una clave nueva crea una publicación auditable, incluso si sus valores coinciden con los actuales. El primer guardado publica la versión 1. Los siguientes comparan `versionEsperada`; un conflicto no modifica ninguna fila de la publicación.

La fila única de Pagos serializa publicaciones. Los QR se bloquean en orden y deben estar confirmados, disponibles y corresponder a su billetera. Puede seleccionarse una carga propia o conservarse un QR que ya pertenece a una publicación histórica; un administrador no puede publicar una carga ajena todavía no publicada. Cambiar de QR crea una nueva referencia sin actualizar el método ni el recurso de versiones anteriores.

La versión guarda responsable, fecha, solicitud normalizada, hash y respuesta recuperable en una sola transacción. La solicitud se representa mediante su hash; no se almacena otro cuerpo de solicitud JSON. Misma clave y mismo contenido normalizado del mismo responsable devuelven la respuesta original, aunque la versión vigente haya cambiado después. Otro contenido o responsable producen 409.

Si se pierde la respuesta, consultar `operaciones/:clave`. Devuelve el resultado histórico sin repetir la escritura. Un 404 significa que no hay una operación propia confirmada con esa clave; conservar la petición original al decidir el reintento.

## Subir y recuperar QR

POST recibe un único archivo `archivo` y un campo textual `datos` con este JSON:

```json
{
  "claveCarga": "22222222-2222-4222-8222-222222222222",
  "metodo": "YAPE"
}
```

El servidor comprueba firma del archivo, MIME, decodificación completa, tamaño y dimensiones; rechaza SVG, archivos corruptos y PNG/WebP animados. Prepara un PNG sin pérdida, aplica orientación y retira metadatos, conservando dimensiones, proporción, margen y píxeles sin recortar ni reducir. El PNG resultante también debe caber en 2 MiB. No genera un código desde el celular ni certifica que su contenido corresponda al titular.

Antes del POST externo reserva un UUID, clave/hash, propietario e identidad Cloudinary en MySQL. La carpeta es `SOHO/pagos/yape/<uuid>` o `SOHO/pagos/plin/<uuid>`. El modo dinámico usa `asset_folder`; el fijo usa `folder`. Cada carga emplea un recurso nuevo con `overwrite: false`, contexto específico de pagos y hash de contenido. Fotografías y QR comparten el cliente, configuración y firma de Cloudinary mediante `CloudinaryModule`; sus modelos, referencias y mantenimiento siguen separados.

La respuesta contiene `{ archivo }`: UUID, método, estado, proveedor, nombre, URL disponible, identidad pública del recurso, versión Cloudinary como cadena, formato, dimensiones, bytes y fechas. No devuelve credenciales, hash de solicitud ni tokens de bloqueo. Una carga disponible devuelve 201; una pendiente, 202. La carga no cambia la configuración: su UUID debe incorporarse después como `qrId` en un PATCH confirmado.

La confirmación consulta Admin API y comprueba cuenta, contexto de pagos, carpeta, identificadores, versión y metadatos. También descarga la URL versionada de `res.cloudinary.com` y verifica sus bytes y SHA-256. No acepta una URL enviada por el cliente ni una respuesta de otro dominio como confirmación.

Repetir el POST con la misma clave y archivo normalizado del mismo administrador devuelve el registro existente, sin otro POST a Cloudinary. Otro archivo, método o responsable producen 409. Un resultado incierto queda pendiente, con próxima revisión; no se interpreta la ausencia externa como prueba definitiva de fallo. Consultar `qr/cargas/:clave` permite recuperar el estado sin reenviar el archivo. Si hay una carga activa o todavía no corresponde revisar, devuelve su estado actual.

La conciliación reclama un bloqueo con token y vencimiento; una confirmación con un token antiguo no sobrescribe otra reclamación. Revisa el recurso reservado, nunca repite el POST externo. Recuperar una carga ya confirmada no depende de una nueva consulta de configuración del proveedor. Si el administrador perdió permisos mientras se subía, el recurso puede quedar confirmado para conciliación/limpieza, pero la petición no devuelve sus datos al usuario revocado.

## Mantenimiento y conservación

`ProcesadorQrService` ejecuta lotes de hasta diez registros, cada minuto, con cierre ordenado. Usa las variables Cloudinary existentes: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` y el interruptor compartido `CLOUDINARY_PROCESADOR_ACTIVO=false`. No se inicia automáticamente en `NODE_ENV=test` ni sin configuración completa. No hace falta añadir credenciales al frontend.

Un QR confirmado y huérfano puede limpiarse después de 24 horas. La reclamación exige ausencia de referencias de **todas** las versiones, incluidas las históricas; una instrucción referencia el método histórico y queda protegida por ese mismo vínculo. Publicación y limpieza bloquean la misma fila: si se publica primero, no se elimina; si la limpieza lo reclama primero, no se permite publicarlo.

El borrado externo verifica la identidad y versión confirmadas y usa `asset_id`. Si su resultado se pierde, queda `ELIMINANDO` y se reintenta su consulta/borrado tras el bloqueo y la espera progresiva. La fila no se borra de MySQL. Las cargas sin confirmación siguen conciliándose y no entran en limpieza física. Los errores de proveedor no se exponen al usuario ni a los logs.

## Errores y alcance

Se utilizan 400 para contratos o imágenes inválidos, 401/403 para sesión/permisos/CSRF, 404 para resultados propios inexistentes, 409 para versiones o claves en conflicto, 413 para exceso de archivo, 422 para QR no publicables, 429 para límites y 503 para persistencia/proveedor no disponibles. Un fallo externo después de reservar puede representarse como carga pendiente con 202. Los errores de Prisma se traducen con el filtro existente sin devolver SQL.

Esta API administra los receptores de pagos. El [catálogo público y las instrucciones privadas](api-instrucciones-pago.md) y la [recepción privada recuperable](api-recepciones-compra.md) se implementaron posteriormente sin cambiar este contrato; nuevas emisiones permanecen desactivadas hasta completar procesamiento/atención y Angular. Tienda sigue pendiente. Cambiar configuración no aprueba/cancela pagos, altera reservas, precios, SKU, distritos o tarifas, ni modifica instrucciones existentes.

## Pruebas y continuidad

Pasaron **1503 pruebas**: 807 unitarias —43 nuevas—, nueve HTTP generales, 442 de regresión MySQL, 59 nuevas de Pagos/QR con HTTP/MySQL, 30 de fotografías, 54 de publicados, 42 de archivo/restauración, 21 de borradores, 26 de publicación y trece de conversión. Incluyen dos administradores concurrentes, repetición y pérdida de respuestas tras COMMIT, rollback, revocación durante espera/carga, métodos y archivos cruzados, proveedor incierto, hash manipulado, conservación de instrucciones y QR históricos, limpieza concurrente y contenido sin pérdida.

Se ajustaron las comprobaciones de base vacía de seis suites de productos para reconocer las dos filas de control añadidas por la duodécima migración. Sus datos de negocio siguen exigiéndose vacíos. Pasaron compilación, TypeScript completo, lint sin avisos y formato. Prisma, las doce migraciones, su cliente generado y las fuentes Angular conservaron sus hashes.

La suite específica exige `TEST_CONFIGURACION_PAGOS_DATABASE_URL` local, exclusiva y migrada con sufijo `_test`; nunca usa `DATABASE_URL` como alternativa. Se ejecuta con `npm.cmd run test:configuracion-pagos`. Las pruebas usan proveedor simulado y MySQL independiente; no se contactó `soho_db` ni Cloudinary real. La verificación de imágenes demuestra decodificación y conservación de píxeles; SOHO debe verificar el QR con su billetera antes de publicarlo. Evidencia: `.checkout-review/pagos-configuracion-api/validacion.json`.

El [diseño posterior de instrucciones y recepción](analisis-instrucciones-pago.md) ya define la preparación y el tratamiento de cambios de cotización/stock después de transferir. Su [decimotercera migración de recepción/procedencia](esquema-recepciones-compra.md) está preparada y validada, y el usuario confirmó su aplicación local; siguen esas API y Angular, conservando solicitudes antiguas. Tienda mantiene su circuito independiente. Esta ampliación no cambia los contratos administrativos descritos aquí.
