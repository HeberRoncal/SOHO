# Procesamiento de recepciones de compra

Continuidad al 16 de noviembre de 2026: la [atención administrativa y las correcciones](api-atencion-recepciones.md) ya están implementadas sobre el esquema vigente. Sigue su integración Angular, manteniendo nuevas emisiones desactivadas. Las referencias del cuerpo a atención futura describen la etapa original de esta guía.

Implementado el 16 de noviembre de 2026, America/Lima, sobre las trece migraciones existentes. Continúa la [recepción privada](api-recepciones-compra.md) y el [diseño de instrucciones/recepción](analisis-instrucciones-pago.md). Las cuatro piezas nuevas se generaron con Nest CLI: constructor compartido de pedidos, servicio de procesamiento y clases de datos/respuesta. No cambia Prisma, migraciones, cliente generado, Angular o `.env` real.

Una recepción confirmada se procesa usando la preparación y destino históricos del servidor. Si coinciden las condiciones actuales y hay disponibilidad completa, crea un pedido con pago **pendiente de revisión**, evidencia de origen y reservas. Si detecta un cambio comercial, conserva la recepción en `REQUIERE_ATENCION`, sin crear pedido ni reservar parcialmente. El procesamiento no acredita fondos ni aprueba el pago.

## Rutas y autorización

| Método y ruta                                       | Resultado                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /api/pagos/recepciones/:id/procesamiento`     | Inicia, repite o recupera una operación propia.                                          |
| `GET /api/pagos/recepciones/:id/operaciones/:clave` | Recupera el resultado histórico; puede reanudar un intento pendiente cuando corresponda. |

Reutiliza la propiedad de la recepción: sesión actual de la cuenta o secreto invitado en `X-Pedido-Acceso`. ADMIN solo procesa aquí sus compras propias; la atención administrativa usa un circuito posterior. No atribuye compras por correo ni admite escoger propietario, método o preparación desde el cuerpo. Una cookie inválida no convierte una petición en invitada.

POST exige origen permitido y `X-CSRF-Token`, además del límite de creación de pedidos. GET aplica el límite de consulta. Ambas rutas rechazan filtros adicionales y normalizan UUID v4 a minúsculas. Utilizan JSON pequeño de hasta 16 KiB, sin imágenes, con `no-store`, `nosniff` y `no-referrer`, incluidos errores.

```json
{
  "claveSolicitud": "00000000-0000-4000-8000-000000000001",
  "versionEsperada": 2
}
```

La versión debe ser un entero positivo de hasta 4294967295. Una recepción recién confirmada tiene versión 2. La sesión y la propiedad se comprueban bajo bloqueo al iniciar y después de la copia privada, antes de registrar el pedido o la atención.

## Resultados y recuperación

Un resultado comercial confirmado devuelve HTTP 200:

```text
{
  recepcion: { /* proyección privada de la recepción al confirmar */ },
  operacion: { claveSolicitud, estado: "CONFIRMADA" },
  resultado: "PEDIDO_CREADO" | "REQUIERE_ATENCION",
  pedido: null | { codigo: "SOHO-…" }
}
```

`pedido` es una referencia; el detalle actualizado utiliza la API privada de pedidos existente. La atención es un resultado persistido, no un error que invite a descartar el comprobante. Incrementa la versión de recepción una vez y conserva sus motivos conocidos. El diagnóstico registra el primer impedimento detectado; no promete enumerar todos los cambios simultáneos.

Mientras otro escritor conserva un lease activo, POST/GET devuelve HTTP 202 y `Retry-After: 5`:

```text
{
  recepcion: { /* estado actual */ },
  operacion: { claveSolicitud, estado: "PENDIENTE" },
  resultado: null,
  pedido: null
}
```

Si falla infraestructura o archivo privado, devuelve 503 y conserva el intento pendiente con su referencia. Consultar GET permite recuperarlo cuando vence el lease y corresponde su revisión; repetir el mismo POST también reintenta. Se programa revisión a cinco segundos después de un fallo y el lease dura sesenta segundos. La conciliación es bajo demanda; no se añade un trabajador automático.

La misma clave, versión original, recepción y propietario recupera la respuesta final **antes** de exigir la versión actual o revisar nuevamente el catálogo. Otra solicitud con esa clave produce 409. Una clave diferente no evita una operación pendiente ni una recepción en atención. Si ya se creó el pedido, una clave nueva recupera la operación confirmada canónica sin otra escritura: la respuesta devuelve esa clave original y no registra un alias para la nueva.

Las respuestas y los snapshots de operación son inmutables. Se valida estructura, versión resultante, comprobante seleccionado, estado, motivos, pedido y respuesta histórica sin exponer propiedades adicionales. La recuperación no vuelve a reservar ni cambia el resultado cuando posteriormente se revisa el pago. GET de recepción muestra su estado vigente y la repetición del POST de recepción conserva su respuesta inicial.

## Registro y copia privada

1. Bloquear recepción, instrucción y comprobantes; autorizar y comprobar primero la operación repetida. Para una operación nueva, exigir `RECIBIDA` y versión vigente.
2. Reservar una operación `PROCESAR`, snapshot anterior y una identidad de copia privada con hash/formato/bytes iguales al origen. No escribir todavía el archivo ni crear reservas de stock.
3. Tomar el lease y terminar la transacción. Leer y verificar el comprobante fuente y escribir/verificar la copia independiente mediante el almacenamiento compartido, sin recodificar la imagen.
4. Abrir la transacción final, bloquear y revalidar recepción, propietario, comprobante y token. Confirmar los metadatos de copia y leer la política de reservas vigente.
5. Comprobar compra e inventario completo. Registrar atención o crear todos los vínculos del pedido y guardar la respuesta de operación en el mismo COMMIT.

La copia usa otra clave y conserva exactamente los bytes saneados del origen. Una caída o rollback conserva ambos archivos y la identidad de copia reservada para recuperación. No sobrescribe el origen ni elimina evidencia porque falle el registro. Las copias pertenecientes a intentos o atención se mantienen referenciadas por la operación; esta entrega no añade limpieza automática de esas copias.

La transacción final respeta las FK inmediatas: pedido → vínculo de instrucción → pago → vínculo de recepción → destino del comprobante fuente → comprobante del pago con procedencia. `ComprobantePago.comprobanteRecepcionId` identifica la versión fuente. Su hash/formato/bytes coinciden con la copia y el mismo pago. Se registran los eventos existentes de creación, comprobante adjuntado y reserva, sin movimientos de salida física.

El constructor `RegistroPedidoService` comparte con pedidos v1 contacto, entrega, facturación, líneas, unidades, reservas y eventos. La huella v1 y sus respuestas/reintentos se conservan. Los pedidos de recepción usan una huella propia que distingue el origen; su recuperación se hace por recepción/operación y por las consultas de pedido existentes.

## Condiciones comerciales e inventario

Se reutiliza la preparación de pedidos: distrito habilitado, tarifa definida y plazo coincidentes; producto publicado, marca/categoría activas, variante habilitada, identidad modelo/color/SKU y fotografía disponible; precios, cantidades y total exactos con Decimal. Además, concilia reservas activas con su contador y compara los UUID de variante/producto con la verificación de la instrucción. Un nombre o fotografía de presentación puede cambiar; el pedido selecciona una imagen vigente y conserva su referencia histórica.

Se mantienen los siete distritos y la gratuidad de La Esperanza. La política de reserva se lee **al crear el pedido**, no al emitir la instrucción: copia versión, modo, duración y acciones vigentes y calcula el vencimiento desde la creación. Se conserva físico, aumenta solo el contador reservado y se crean todas las unidades/reservas o ninguna. Una compra concurrente puede recibir las últimas unidades y la otra pasar a atención, conservando evidencia.

Los motivos comerciales son `PRECIO_CAMBIADO`, `STOCK_INSUFICIENTE`, `ARTICULO_NO_DISPONIBLE`, `COBERTURA_DESHABILITADA`, `COBERTURA_TARIFA_PENDIENTE`, `COTIZACION_CAMBIADA`, `TOTAL_CAMBIADO`, `INVENTARIO_INCONSISTENTE` y `PREPARACION_INCONSISTENTE`. Errores desconocidos de infraestructura y snapshots dañados no se presentan como decisiones comerciales: revierten el registro y conservan el intento recuperable.

Cambiar o desactivar el receptor después de emitir no altera su destino ni impide procesar la evidencia recibida. Las autorizaciones invitadas conservan sus treinta días desde registro de recepción; el pedido invitado obtiene su plazo propio desde creación, usando el mismo hash privado. No se renueva la recepción al consultar/reintentar.

## Activación, límites y continuación

Mantener `PAGOS_CHECKOUT_ACTIVO=false` hasta completar atención ADMIN y Angular. La pausa controla nuevas emisiones; los endpoints de recepción/procesamiento pueden recuperar evidencia existente. La capacidad pública `procesamientoDisponible` de las respuestas de recepción mantiene `false` durante esta etapa para conservar su contrato e historial y evitar habilitar el flujo Angular incompleto.

Además de 400/401/403/404/413/429/503 se usa 409 para claves incompatibles, `RECEPCION_CAMBIADA`, `PROCESAMIENTO_EN_CURSO` y `RECEPCION_REQUIERE_ATENCION`. Se conserva `REQUIERE_ATENCION` aunque luego vuelva a haber stock: otra clave no permite saltar la decisión administrativa. No se registran rechazos definitivos por errores 5xx.

La siguiente entrega es **atención administrativa de recepciones**, con bandeja/detalle y diagnóstico, decisiones autorizadas y recuperables, confirmación explícita de condiciones originales y tratamiento controlado de correcciones. Después se conectará Angular y se comprobará el recorrido completo antes de activar nuevas emisiones.

## Validación

`npm.cmd run test:procesamiento` exige `TEST_PROCESAMIENTO_DATABASE_URL` local, exclusiva, migrada y vacía con sufijo `_test`. No usa `DATABASE_URL` como alternativa. Prueba registro completo y sus FK, políticas vigentes, siete distritos, producto por color y talla `40P5`, fotografía histórica, atención, copias, rollback, revocación y concurrencia sobre últimas unidades y leases. Incluye COMMIT y respuesta HTTP perdidos sin duplicar reservas.

Los resultados y hashes finales quedan en `.checkout-review/procesamiento-recepciones-api/validacion.json` desde la raíz SOHO. Se comprueban regresiones de pedidos, recepción, instrucciones, Pagos/QR y productos, además de compilación, tipos completos, lint y formato. Las verificaciones usan MySQL y archivos temporales propios; no se contacta `soho_db` ni proveedores reales.

Pasaron **1718 pruebas**: 857 unitarias —dos nuevas—, nueve HTTP generales, 545 de regresión MySQL, 47 de procesamiento, 56 de recepción, 61 de instrucciones, 59 de Pagos/QR, 30 de fotografías y 54 de publicados. Pasaron compilación NestJS, TypeScript completo, lint sin avisos y formato. Prisma, trece migraciones, cliente generado y fuentes Angular conservaron sus hashes.
