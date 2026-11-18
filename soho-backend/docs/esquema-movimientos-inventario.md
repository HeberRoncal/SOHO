# Preparación del esquema de movimientos manuales

La undécima migración, `20261115020000_preparacion_movimientos_inventario`, prepara la versión del stock físico y la recuperación persistida de movimientos manuales definida en el [análisis funcional](analisis-movimientos-inventario.md). Conserva las 32 tablas existentes. No habilita nuevos endpoints ni el formulario de movimientos reales.

La migración se aplica después de las diez anteriores. El usuario confirmó aplicadas las once migraciones y la conversión del catálogo. Este agente no volvió a ejecutar la undécima en `soho_db`; su aplicación real consta por confirmación del usuario.

## Campos incorporados

| Modelo                 | Campo                | Tipo y valor inicial                                                                     |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `Variante`             | `versionExistencias` | Entero sin signo, obligatorio, predeterminado 1. Columna `version_existencias`.          |
| `MovimientoInventario` | `claveSolicitud`     | UUID opcional y único. Columna `clave_solicitud`.                                        |
| `MovimientoInventario` | `solicitudHash`      | SHA-256 opcional de 64 caracteres hexadecimales en minúsculas. Columna `solicitud_hash`. |
| `MovimientoInventario` | `respuesta`          | Objeto JSON opcional con la respuesta confirmada.                                        |

El [esquema Prisma](../prisma/schema.prisma) y la [migración SQL](../prisma/migrations/20261115020000_preparacion_movimientos_inventario/migration.sql) coinciden en columnas, valores predeterminados e índice único. La estructura base se obtuvo con `prisma migrate diff`; las restricciones `CHECK` se mantienen expresamente en SQL porque Prisma no representa todas sus reglas.

Las variantes anteriores reciben versión física 1. Este valor inicia el contador y no representa la cantidad de movimientos históricos. No se recalculan existencias, reservas, disponibilidad, SKU ni versiones comerciales.

Los movimientos anteriores conservan los tres campos de recuperación en SQL `NULL`, incluidos movimientos manuales sin responsable, stock inicial y salidas por despacho. No se les asignan claves ficticias ni respuestas reconstruidas. El índice único admite múltiples claves nulas y rechaza reutilizar una clave no nula en cualquier variante o responsable.

## Restricciones nuevas

1. `variantes_version_existencias_positiva`: la versión física es al menos 1; el tipo sin signo limita su rango superior.
2. `movimientos_recuperacion_completa`: clave, hash y respuesta están los tres vacíos o los tres completos.
3. `movimientos_recuperacion_manual`: un registro recuperable tiene origen `MANUAL` y responsable no nulo.
4. `movimientos_solicitud_uuid`: la clave tiene formato UUID hexadecimal con separadores. Se aceptan letras mayúsculas y minúsculas; la unicidad existente de la columna trata ambas representaciones como la misma clave.
5. `movimientos_solicitud_hash`: el hash completo es hexadecimal en minúsculas.
6. `movimientos_respuesta_objeto`: una respuesta presente es un objeto JSON. JSON `null`, arrays y valores escalares no sustituyen SQL `NULL`.

Se conservan las restricciones anteriores de saldo, delta no cero, límites, signo por tipo, motivo, claves foráneas y coherencia de envíos. También permanece la unicidad por envío/variante para los despachos.

No se añade una restricción global `existencias >= cantidadReservada`: hay déficits históricos que deben permanecer representados y una entrada debe poder reducirlos parcialmente. La futura API decidirá si una reducción compromete reservas, bajo bloqueo y conciliación.

La compatibilidad permite registros antiguos con los tres campos nulos. La futura API exigirá el conjunto completo para cada solicitud manual nueva; esta distinción es una regla del servicio y no se deduce de la fecha del registro.

## Implementación sobre el esquema

La columna de versión no se incrementa automáticamente por añadirla al esquema. La [API de movimientos manuales](api-movimientos-inventario.md) ya incrementa `versionExistencias` en la misma transacción que cambia el físico, tanto en el nuevo servicio como en el despacho existente. El [diálogo Angular ya está conectado](../../soho-frontend/docs/integracion-movimientos-inventario.md); ejecutarlo requiere tener aplicada esta migración.

El control propuesto compara también el reservado y la habilitación observados al confirmar. Las reservas no incrementan por sí solas la versión física. La versión comercial de `Producto` continúa independiente; esta entrega no modifica precios, publicación, pedidos, pagos, cancelaciones ni vencimientos.

El JSON prepara la recuperación de una respuesta histórica. Los endpoints de la API posterior ya autorizan por cuenta, comparan hash/cuerpo, impiden dobles aplicaciones del delta y gestionan carreras. El cliente deberá consultar el estado vigente después de recuperar una respuesta histórica. No se añadieron componentes NestJS durante esta preparación del esquema; las piezas de la API posterior se generaron con Nest CLI.

## Aplicación en la base configurada

Desde `soho-backend`, cuando se vaya a aplicar esta entrega:

```powershell
npm.cmd run db:migrate:deploy
```

El comando aplica las migraciones pendientes de la conexión del backend. No ejecutar seeds, conversión de catálogo ni `migrate reset` para esta ampliación. La migración se validó en una instancia temporal y no se ejecutó sobre `soho_db`.

El cliente Prisma ya fue regenerado en este workspace y se compiló el backend. Una copia del proyecto que todavía no tenga el cliente actualizado puede ejecutar `npm.cmd run db:generate`; generar el cliente no aplica SQL. Aplicar la migración antes de iniciar el backend con el cliente que consulta las nuevas columnas.

## Validación

La evidencia está en `.checkout-review/inventario-esquema/`, desde la raíz SOHO. El verificador crea una instancia MySQL en un puerto y directorio temporales, comprueba su ubicación y utiliza exclusivamente bases con sufijo `_test`.

La conservación se comprueba desplegando las diez migraciones anteriores, cargando datos sintéticos en las 32 tablas y comparando cada columna anterior antes y después de la undécima. Incluye sesión, identidades, direcciones, tarifas editadas, política histórica, reservas activas/consumidas, pago aprobado, despacho, cancelación, déficit deshabilitado, movimientos sin responsable, galería heredada, grupo, alias, operación y punto de conversión. Las otras 30 tablas conservan también su estructura exacta. Se comprueba un segundo despliegue sin cambios.

Las pruebas SQL verifican las restricciones nuevas y anteriores. Las pruebas con el cliente generado comprueban valores iniciales, relaciones, claves únicas, respuesta histórica, actualizaciones condicionadas por versión y rollback. La regresión cubre las API existentes con datos temporales y proveedores externos simulados. El verificador contrasta las diez migraciones anteriores y las fuentes de API/Angular con sus hashes previos, y compara el esquema representable de Prisma con la base migrada.

Pasaron **511 comprobaciones SQL**, 44 nuevas, y **1015 pruebas del backend**: 566 unitarias, nueve HTTP, 350 de regresión MySQL —incluidas 18 nuevas del esquema—, trece de conversión, 21 de borradores, 30 de fotografías y 26 de publicación. También pasaron validación/generación de Prisma, compilación, TypeScript completo, lint y formato del nuevo archivo de pruebas. La comparación del esquema migrado no encontró diferencias representables por Prisma.

Los resultados finales están en `resultado.json` y `validacion.json`. Las 705 fuentes anteriores de API y Angular y las diez migraciones previas conservaron sus hashes. La instancia MySQL y su directorio temporal fueron retirados. No se escribió en `soho_db`, no se ejecutó su seed o conversión y no hubo operaciones contra Cloudinary real.
