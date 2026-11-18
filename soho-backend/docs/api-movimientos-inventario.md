# API de movimientos manuales de inventario

Implementada sobre la [undécima migración](esquema-movimientos-inventario.md), sin modificar el esquema ni añadir otra migración. La API y el incremento de versión física en despachos están implementados. El [diálogo Angular ya está conectado](../../soho-frontend/docs/integracion-movimientos-inventario.md), con confirmación, conflictos y recuperación por clave.

Todas las rutas requieren sesión `ADMIN`, utilizan el límite administrativo existente y responden con `Cache-Control: no-store`. El POST exige JSON, origen permitido y CSRF. La sesión y el rol se verifican otra vez dentro de la transacción; una clave conocida no permite saltarse esa autorización.

## Rutas

| Método y ruta                                              | Operación                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/admin/inventario/variantes`                      | Buscar y paginar variantes del catálogo administrativo completo. |
| `GET /api/admin/inventario/variantes/:id`                  | Consultar una variante vigente por UUID.                         |
| `POST /api/admin/inventario/variantes/:id/movimientos`     | Registrar una entrada, salida o ajuste manual.                   |
| `GET /api/admin/inventario/movimientos/operaciones/:clave` | Recuperar una operación confirmada del mismo administrador.      |

Permanecen los GET existentes de historial y resumen de inventario. El UUID de variante es independiente del SKU y del código interno `SHO-…`; no se regeneran esos identificadores.

## Búsqueda y consulta

Filtros admitidos: `sku` exacto, `busqueda` de hasta 120 caracteres, `producto` UUID, `pagina` desde 1 y `limite` de 1 a 50, predeterminado 20. La búsqueda incluye SKU, nombre/código de producto y nombre del color; los comodines se tratan como texto literal. Los filtros se combinan. Parámetros desconocidos, repetidos o de tipo incorrecto devuelven 400.

No depende de los productos cargados en la página actual de Angular. Incluye borradores, publicados, archivados y variantes deshabilitadas. Un filtro exacto inexistente devuelve una lista vacía; consultar un UUID de variante inexistente devuelve 404.

Cada variante contiene `id`, `sku`, `producto` con UUID/nombre/código/estado, `color`, `talla`, `sistemaTallas`, `habilitada`, `existencias`, `cantidadReservada`, `versionExistencias`, `disponible` y `faltante`. Las tallas conservan su punto decimal, por ejemplo `40.5`; el SKU conserva `40P5`. La lista devuelve `variantes` y `paginacion` con página, límite, total y páginas. El detalle devuelve `{ variante }`.

Disponible administrativo: habilitada → `max(0, físico − reservado)`; deshabilitada → cero. Faltante: `max(0, reservado − físico)`. Mostrar disponibilidad administrativa no publica una ficha ni modifica su estado comercial. Las relaciones anteriores se admiten en consulta; una escritura nueva requiere conversión confirmada e identidad directa de producto/color coherente.

## Registrar un movimiento

Ejemplo de entrada, con la versión y los valores consultados previamente:

```json
{
  "claveSolicitud": "12345678-1234-1234-1234-123456789abc",
  "versionExistencias": 1,
  "reservadoEsperado": 2,
  "habilitadaEsperada": true,
  "tipo": "ENTRADA",
  "cantidad": 3,
  "motivo": "Reposición de proveedor",
  "referencia": "00123"
}
```

Tipos: `ENTRADA`, `SALIDA` y `AJUSTE`. La cantidad es un **delta con signo**: entrada positiva, salida negativa y ajuste positivo o negativo. Debe ser un entero distinto de cero, con valor absoluto entre 1 y 99999. El diálogo Angular utiliza cantidad positiva y sentido, y convierte esa selección al delta del contrato.

`versionExistencias` es un entero positivo; `reservadoEsperado`, un entero entre 0 y 99999; `habilitadaEsperada`, un booleano. Los tres se comparan con el inventario bloqueado. La clave es UUID. El motivo es obligatorio, máximo 160 caracteres; referencia opcional, máximo 80. Los textos se recortan y normalizan a NFC; se rechazan controles. Una referencia con ceros iniciales sigue siendo texto. Referencia omitida, nula o vacía se normaliza a null.

Se rechazan campos desconocidos, incluidos saldos finales, responsable, fecha, origen, SKU o datos de envío elegidos por el cliente. El servidor calcula el resultado y fija origen `MANUAL`, fecha y administrador autenticado.

La respuesta 201 contiene:

- `movimiento`: UUID, fecha, responsable —UUID y nombre—, producto/variante/SKU/color/talla, tipo, delta, físico anterior/final, reservado e habilitación históricos, disponible, motivo y referencia. Origen `manual`; pedido null.
- `variante`: la proyección administrativa al confirmar el movimiento.
- `operacion`: clave, versión física anterior y posterior.

No se exponen correos ni credenciales. El historial de consulta conserva sus filtros por producto, SKU, tipo, origen, fecha y paginación.

## Reglas de stock y reservas

- El físico final queda entre 0 y 99999. Una reducción que deje físico menor que reservado se rechaza con 409. No libera ni reasigna reservas, cancela pedidos o modifica pagos.
- Un déficit anterior admite una entrada o ajuste positivo, incluso parcial: físico 5, reservado 7 y entrada 1 dejan físico 6 y faltante 1. La alerta permanece y no se aprueban o recuperan pedidos automáticamente.
- Se puede contabilizar una variante deshabilitada o un producto archivado. Conserva su habilitación y estado; no aumenta su disponibilidad para venta por publicar o restaurar la ficha.
- El primer ingreso de una talla creada en cero es una entrada manual. `STOCK_INICIAL` queda para el historial anterior; `ENVIO_PEDIDO` pertenece al despacho automático desde Pedidos.
- Un ajuste representa unidades a sumar/restar, no un saldo objetivo. Con físico 8 y conteo 6, corresponde delta −2.
- No hay edición o eliminación de movimientos confirmados. Una corrección posterior genera otro registro con su motivo.

## Transacción y recuperación

`InventarioReservadoService` se reorganizó en `inventario/reservas/` y se exporta desde `InventarioModule`. Pedidos, cancelaciones, vencimientos, recuperación y movimientos reutilizan el mismo componente; no se duplicó la conciliación.

La escritura busca primero una operación ya confirmada, bloquea la variante, concilia el reservado con todas las reservas `ACTIVA` y vuelve a comprobar la clave después de esperar. Autoriza la sesión dentro de esa transacción y valida conversión, identidad, expectativas, límites y política de reducción. Actualiza físico y versión e inserta historial, hash y respuesta original en el mismo COMMIT. Un error de historial revierte también físico y versión.

El índice único resuelve solicitudes simultáneas con la misma clave, incluso si apuntan a otra variante. El hash incluye variante y cuerpo normalizado. Misma clave, datos y administrador: devolver la respuesta original sin repetir el delta. Otra variante, cuerpo o administrador: 409. La consulta de una clave inexistente o ajena responde 404. Las respuestas originales permanecen recuperables aunque después cambien el saldo, la habilitación o el estado comercial.

Ante un timeout, 503 o pérdida de respuesta, el cliente debe conservar la clave y el cuerpo exactos. Consultar la operación o reenviar la misma solicitud. Un 404 mientras puede seguir en curso el POST no demuestra que no haya COMMIT y no habilita otra clave. La respuesta recuperada es histórica; después consultar la variante vigente antes de confirmar otro movimiento. Un fallo en esa consulta posterior tampoco debe generar otra aplicación del delta.

Se reutilizan los tres intentos máximos y el reconocimiento preciso de conflictos transaccionales existentes. No se repiten automáticamente errores ambiguos de transporte.

## Versión física y despachos

`versionExistencias` aumenta una vez con cada movimiento manual confirmado y con cada variante descontada al despachar. El despacho comprueba su versión dentro del bloqueo, conserva la salida única por envío/variante y revierte la transacción si el contador alcanzó su límite. Una repetición del despacho no lo incrementa de nuevo. Entregar no modifica físico ni su versión.

Checkout, aprobación/rechazo de pagos, cancelaciones, vencimientos y recuperación mantienen sus reglas: reservar o liberar no cambia por sí solo la versión física. Las expectativas de reservado/habilitación evitan confirmar con una vista obsoleta aunque la versión física sea la misma. La versión comercial del producto continúa independiente.

## Errores

| Estado    | Significado                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400       | Cuerpo, UUID, tipos, signo, límites de entrada o filtros inválidos.                                                                                                           |
| 401 / 403 | Falta de sesión, sesión revocada, rol o CSRF no autorizado.                                                                                                                   |
| 404       | Variante inexistente u operación inexistente/ajena.                                                                                                                           |
| 409       | Expectativas cambiadas, clave reutilizada, saldo fuera de rango, reducción que compromete reservas, contador desajustado, identidad/conversión pendiente o límite de versión. |
| 503       | Persistencia no confirmable; conservar clave y consultar el resultado.                                                                                                        |

Los conflictos incluyen código y mensaje: `INVENTARIO_CAMBIADO`, `CLAVE_MOVIMIENTO_EN_USO`, `SALDO_FISICO_INVALIDO`, `RESERVAS_COMPROMETIDAS`, `INVENTARIO_INCONSISTENTE` o `CATALOGO_NO_CONVERTIDO`.

## Entrega y comprobación

Módulo, controlador, dos servicios y tres clases DTO se generaron con el Nest CLI local y se adaptaron a ESM `.js`, Prisma y los componentes existentes. No se modificaron el esquema, las once migraciones o las fuentes Angular. Hace falta tener aplicada la undécima migración para ejecutar este backend; esta entrega no la aplicó en `soho_db`.

Las pruebas usan NestJS por HTTP y MySQL temporal, con datos sintéticos. Comprueban búsqueda, contratos, permisos, CSRF, historial, claves compartidas, respuesta perdida tras COMMIT, rollback de historial, revocación durante espera, déficit parcial, límite de versión y carreras con checkout y despacho. La evidencia y el resultado de regresión se conservan en `.checkout-review/inventario-api/`.

Pasaron **1137 pruebas del backend**: 642 unitarias —76 nuevas—, nueve HTTP generales, 350 de regresión MySQL, trece de conversión, 21 de borradores, 30 de fotografías, 26 de publicación y 46 nuevas de movimientos con HTTP/MySQL. También pasaron compilación, tipos completos, lint y formato. El esquema, las once migraciones y las fuentes Angular conservaron sus hashes. Las pruebas no escribieron en `soho_db` ni en proveedores reales y retiraron el servidor/directorio temporal.

La suite de movimientos se ejecuta con `npm.cmd run test:movimientos` y exige `TEST_MOVIMIENTOS_DATABASE_URL`, con sufijo `_test`, once migraciones y base exclusiva inicialmente vacía. El verificador de `.checkout-review/inventario-api/verificar.mjs` prepara y retira su propia instancia temporal para la regresión completa.
