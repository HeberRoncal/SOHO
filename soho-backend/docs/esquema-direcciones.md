# Esquema de Mis direcciones

Fecha: 13 de noviembre de 2026 (America/Lima).

El esquema de la agenda incluye `DireccionUsuario`, la relación `Usuario.direcciones` y la cuarta migración, `prisma/migrations/20261113030000_direcciones_usuario/migration.sql`. El usuario confirmó aplicada esa migración en `soho_db`. La [API de direcciones](api-direcciones.md) y el formulario Angular ya utilizan este esquema. La quinta migración preparada incorpora [cobertura de entrega](esquema-cobertura.md) sin modificar la agenda.

## Campos y relación

| Campo Prisma     | Columna MySQL    | Tipo y regla                                                                                                        |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`             | `id`             | UUID generado por Prisma, `CHAR(36)`, clave primaria                                                                |
| `usuarioId`      | `usuario_id`     | `CHAR(36)` obligatorio, referencia a `usuarios.id`                                                                  |
| `etiqueta`       | `etiqueta`       | `VARCHAR(40)`, mínimo dos caracteres al recortar espacios                                                           |
| `destinatario`   | `destinatario`   | `VARCHAR(140)`, mínimo dos caracteres al recortar espacios                                                          |
| `celular`        | `celular`        | `VARCHAR(9)`, nueve dígitos ASCII con `9` inicial                                                                   |
| `distrito`       | `distrito`       | `VARCHAR(80)`, código en minúsculas con letras ASCII, números y guiones entre segmentos, por ejemplo `la-esperanza` |
| `direccion`      | `direccion`      | `VARCHAR(180)`, mínimo seis caracteres al recortar espacios                                                         |
| `referencia`     | `referencia`     | `VARCHAR(200)`, cadena vacía por defecto cuando no hay referencia                                                   |
| `predeterminada` | `predeterminada` | Booleano obligatorio, `false` por defecto                                                                           |
| `creadoEn`       | `creado_en`      | `DATETIME(3)`, fecha actual por defecto                                                                             |
| `actualizadoEn`  | `actualizado_en` | `DATETIME(3)`, fecha actual por defecto y `@updatedAt` al escribir mediante Prisma                                  |

Los límites de etiqueta, destinatario, celular, dirección y referencia corresponden al formulario Angular existente. El límite de 80 caracteres para el código de distrito es una decisión del esquema. Las etiquetas y las direcciones no son únicas: una persona puede guardar varios destinos con la misma etiqueta. El celular pertenece a quien recibe en ese destino y no modifica el perfil del usuario.

La clave foránea restringe el borrado del usuario y el cambio de su identificador mientras existan direcciones, siguiendo las relaciones actuales de autenticación. No hay borrados en cascada. Las direcciones pueden eliminarse individualmente.

El índice `(usuario_id, predeterminada, creado_en, id)` permite consultar la agenda del usuario, localizar su predeterminada y ordenar de forma estable. El futuro servicio obtendrá `usuarioId` de la sesión y lo incluirá en todas las consultas de lectura, edición, borrado y selección; la clave foránea no autoriza las peticiones por sí sola.

## Dirección predeterminada

MySQL garantiza **como máximo una** dirección predeterminada por usuario mediante el índice único funcional `direcciones_usuario_una_predeterminada_key`. Su expresión devuelve `usuario_id` para las predeterminadas y `NULL` para las demás. Así permite varias direcciones secundarias y rechaza dos predeterminadas de la misma cuenta, incluso con escrituras concurrentes.

No usar `@@unique([usuarioId, predeterminada])`: impediría guardar más de una dirección secundaria. El índice funcional y los `CHECK` se conservan en SQL manual, porque Prisma no los representa en el modelo. Una comparación de Prisma sin diferencias no comprueba estas reglas; las pruebas SQL y la comprobación concurrente las verifican sobre MySQL.

El esquema permite temporalmente que ninguna dirección sea predeterminada. El servicio implementado mantiene **exactamente una cuando la agenda no esté vacía**, con transacciones que serializan los cambios por usuario:

1. Al crear la primera dirección, marcarla como predeterminada.
2. Al cambiarla, desmarcar primero la anterior y marcar después la nueva dentro de la misma transacción.
3. Al borrar la predeterminada, seleccionar otra de la misma cuenta con orden estable; al borrar la última, dejar la agenda vacía.
4. Evitar que una edición deje la agenda sin predeterminada y tratar los conflictos de concurrencia sin confirmar estados parciales.

Estas operaciones están implementadas en `DireccionesService` y sus endpoints protegidos. Las pruebas del esquema comprueban los límites de la base; las pruebas de la [API](api-direcciones.md) verifican además propiedad, sesión y transacciones HTTP.

## Distrito, cobertura y compras

`distrito` conserva el código que utiliza el formulario actual. No se fija una lista mediante un enum o un `CHECK IN (...)`, ni se copian las tarifas de demostración. El formato del código no garantiza que exista el distrito o haya cobertura. Esas comprobaciones corresponderán al servidor al definir las zonas de entrega; se deberá volver a cotizar al comprar aunque la dirección esté guardada.

La agenda requiere usuario. El checkout como invitado continúa siendo un flujo independiente. No se crean pedidos ni relaciones de pedidos en esta entrega: sus datos de entrega deberán conservar una copia histórica para que editar o borrar una dirección de la agenda no cambie una compra anterior.

## Migración y cliente

La migración se generó con `prisma migrate diff --from-schema <copia-anterior> --to-schema prisma/schema.prisma --script --output prisma/migrations/20261113030000_direcciones_usuario/migration.sql`, sin conectarse a la base local. Después se añadieron los `CHECK` y el índice funcional al SQL. Solo crea `direcciones_usuario`, sus índices y su clave foránea; no modifica las tres migraciones anteriores, no altera filas existentes ni carga direcciones de ejemplo.

Prisma administra `src/generated/prisma`; el cliente se regenera con el generador del proyecto. La etapa inicial del esquema no creó componentes Nest. Posteriormente el recurso REST se generó con `npx.cmd --no-install nest generate resource direcciones --type rest --crud` y se adaptó a sesión, propiedad, CSRF, Prisma e importaciones ESM `.js`, según `AGENTS.md`.

Para aplicar migraciones pendientes y regenerar el cliente en otra instalación, desde `soho-backend`:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

Son operaciones distintas. El usuario ya confirmó su ejecución local; las pruebas del agente no las repiten contra `soho_db`. No hace falta volver a cargar el seed ni restablecer la base. Se requiere MySQL 8.0.16 o posterior, igual que las migraciones existentes, para que los `CHECK` se apliquen.

## Validación

Las comprobaciones usan una instancia temporal independiente de MySQL 8.0.46, con puerto y directorio propios. La evidencia se guarda en `.checkout-review/direcciones-esquema/` desde la raíz SOHO.

Resultados de esta entrega:

- Las trece tablas anteriores conservaron todos los campos de sus filas sintéticas al aplicar la cuarta migración. La nueva tabla quedó vacía y las tres migraciones previas mantuvieron sus hashes.
- Las cuatro migraciones se aplicaron también mediante `prisma migrate deploy` sobre otra base temporal vacía. El diff con el esquema Prisma no detectó diferencias representables.
- Pasaron las 45 comprobaciones de `test/esquema-direcciones.sql`, además de las 93 existentes de catálogo, usuarios e identidades externas: 138 comprobaciones SQL en total.
- Con el cliente Prisma regenerado se verificaron UUID, persistencia, relación con el usuario, valores predeterminados y actualización de `actualizadoEn`. De dos creaciones simultáneas como predeterminadas para el mismo usuario, solo una se confirmó y la otra devolvió `P2002`.
- Pasaron las 196 pruebas existentes del backend: 122 unitarias, nueve HTTP y 65 con MySQL aislado. También pasaron validación del esquema, generación, compilación, TypeScript completo, lint y formato de la documentación modificada.

Para repetir las comprobaciones de direcciones en una base exclusivamente de pruebas con las cuatro migraciones aplicadas:

```powershell
mysql --host=127.0.0.1 --port=3306 --user=USUARIO --password --default-character-set=utf8mb4 --database=soho_direcciones_test --execute="source test/esquema-direcciones.sql"
```

El script revierte sus filas y elimina sus dos procedimientos auxiliares al terminar. No usar `--force`; si se interrumpe, preparar otra base aislada antes de repetirlo.

## Referencias

- [Prisma 7: personalizar migraciones SQL](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations).
- [MySQL 8.0: índices funcionales y unicidad](https://dev.mysql.com/doc/refman/8.0/en/create-index.html#functional-key-parts).
- [Estado de integración](estado-integracion.md).
