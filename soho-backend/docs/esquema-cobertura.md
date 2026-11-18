# Esquema de cobertura y tarifas de entrega

Fecha: 13 de noviembre de 2026 (America/Lima).

El esquema incorpora `ZonaEntrega` y la quinta migración, `prisma/migrations/20261113040000_cobertura_entrega/migration.sql`, con quince tablas de negocio. El usuario confirmó aplicada la migración en `soho_db`. La [API de cobertura](api-cobertura.md) y Administración → Envíos ya utilizan este esquema, sin otra migración. La conexión de checkout a la API queda para la siguiente etapa.

## Distritos existentes

Se conservan los siete distritos que ya utilizan checkout y Administración → Envíos, sus códigos, nombres, orden y habilitación inicial. Los UUID v4 de las siete filas son estables entre instalaciones.

| Código              | Distrito             | Habilitada inicialmente | Tarifa inicial     |
| ------------------- | -------------------- | ----------------------- | ------------------ |
| `la-esperanza`      | La Esperanza         | Sí                      | S/ 0.00            |
| `trujillo`          | Trujillo             | Sí                      | Pendiente (`NULL`) |
| `el-porvenir`       | El Porvenir          | Sí                      | Pendiente (`NULL`) |
| `florencia-de-mora` | Florencia de Mora    | Sí                      | Pendiente (`NULL`) |
| `victor-larco`      | Víctor Larco Herrera | Sí                      | Pendiente (`NULL`) |
| `huanchaco`         | Huanchaco            | Sí                      | Pendiente (`NULL`) |
| `moche`             | Moche                | No                      | Pendiente (`NULL`) |

Los códigos no se recalculan a partir del nombre: `victor-larco` debe conservarse aunque el nombre completo sea Víctor Larco Herrera. La Esperanza mantiene envío gratuito sin monto mínimo. Las otras seis tarifas actuales del frontend son ilustrativas y no se copian como importes comerciales. Todos los plazos comienzan en `NULL`, sin inventar tiempos de entrega.

**Habilitada y tarifa definida son condiciones independientes.** Mantener una zona habilitada conserva la configuración de cobertura existente, pero no permite cotizar si su tarifa está pendiente. Con los datos iniciales, solo La Esperanza cumple ambas condiciones. El servicio de cotización ya aplica esta regla y los importes reales pueden configurarse desde Administración → Envíos.

## Modelo y reglas

| Campo Prisma    | Columna MySQL    | Regla                                                                               |
| --------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `id`            | `id`             | UUID generado por Prisma, `CHAR(36)`, clave primaria                                |
| `codigo`        | `codigo`         | `VARCHAR(80)` único, minúsculas ASCII y números, con guiones entre segmentos        |
| `nombre`        | `nombre`         | `VARCHAR(80)` único, mínimo dos caracteres al recortar espacios, sin controles      |
| `tarifa`        | `tarifa`         | `DECIMAL(8,2)` nullable, importe en soles de cero o más                             |
| `plazo`         | `plazo`          | `VARCHAR(80)` nullable; un valor presente requiere contenido y no admite controles  |
| `habilitada`    | `habilitada`     | Booleano obligatorio, `false` por defecto para nuevas filas                         |
| `orden`         | `orden`          | Entero sin signo, cero por defecto; los siete distritos comienzan en orden de 0 a 6 |
| `creadoEn`      | `creado_en`      | `DATETIME(3)`, fecha actual por defecto                                             |
| `actualizadoEn` | `actualizado_en` | `DATETIME(3)`, fecha actual y `@updatedAt` al escribir mediante Prisma              |

El índice `(habilitada, orden, codigo)` permite consultar zonas con un orden estable. `codigo` y `nombre` tienen índices únicos propios. La migración añade `CHECK` para formato de código, nombre, tarifa no negativa, plazo y booleano. La regla de La Esperanza exige explícitamente tarifa **no nula y cero**; ni un importe positivo ni `NULL` son válidos para ese código.

`NULL` representa una tarifa pendiente; cero representa una tarifa gratuita definida. No se debe usar `tarifa ?? 0`, convertir `NULL` a cero ni cotizar una zona solo porque está habilitada. El pipe de entrada de la API exige como máximo dos decimales antes de guardar: el almacenamiento `DECIMAL` no sustituye esa validación.

El plazo es un texto estimado opcional, conforme al campo actual de Administración. Se guarda `NULL` cuando no se ha definido, en lugar de una cadena vacía. No se incorporan mínimos de compra, puntos de recojo ni modalidades de entrega nuevas.

## Direcciones y compatibilidad

`DireccionUsuario.distrito` conserva su código actual. No se añade una clave foránea obligatoria desde la agenda a cobertura: guardar una dirección no confirma que haya entrega disponible y pueden existir códigos anteriores o fuera de cobertura. La quinta migración no modifica esas filas ni las restricciones existentes.

El servicio resuelve la zona por su código y exige `habilitada` y `tarifa IS NOT NULL` antes de cotizar. Deshabilitar una zona conserva las direcciones guardadas. El checkout como invitado seguirá siendo independiente de tener una agenda de usuario; los pedidos futuros deberán conservar su propia copia de los datos de entrega y el importe aplicado.

## Migración y cliente

La estructura se generó mediante `prisma migrate diff --from-schema <copia-anterior> --to-schema prisma/schema.prisma --script --output prisma/migrations/20261113040000_cobertura_entrega/migration.sql`, sin conectarse a la base local. Después se añadieron las restricciones SQL y los siete registros de configuración inicial.

La migración crea únicamente `zonas_entrega`, sus índices, sus `CHECK` y sus siete filas. No altera las cuatro migraciones anteriores ni utiliza el seed del catálogo. El cliente Prisma se regeneró mediante el generador del proyecto; `src/generated/prisma` no se edita manualmente.

La etapa inicial de esquema no creó componentes Nest. Posteriormente el módulo, controladores, servicio, DTO y pipes de la [API](api-cobertura.md) se generaron con la CLI local según `AGENTS.md` y se adaptaron a Prisma, validación, sesión, RBAC e importaciones ESM `.js`.

Para aplicar las migraciones pendientes y generar el cliente en otra instalación, desde `soho-backend`:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

El usuario ya confirmó aplicada la quinta migración en su base local; las pruebas del agente no repiten estos comandos contra `soho_db`. No hace falta volver a cargar el catálogo ni restablecer la base. Al repetir `migrate deploy`, una migración ya aplicada no vuelve a insertar los registros ni sobrescribe la configuración.

## Validación

Se utilizó una instancia temporal independiente de MySQL 8.0.46, con puerto y directorio propios:

- Se aplicó la quinta migración sobre datos sintéticos de las catorce tablas anteriores. Todas las filas y campos se conservaron, incluidas dos direcciones, una con código fuera de cobertura. Las cuatro migraciones anteriores mantuvieron sus hashes.
- En otra base vacía se desplegaron las cinco migraciones. El diff con Prisma no detectó diferencias representables; las restricciones SQL se comprobaron con casos específicos.
- Pasaron 42 comprobaciones de `test/esquema-cobertura.sql` y las 138 previas de catálogo, usuarios, identidades y direcciones: **180 comprobaciones SQL** en total.
- El cliente Prisma verificó los siete códigos, UUID v4, tarifa cero y pendientes nulos, importes exactos, persistencia y actualización de fechas. Un segundo `migrate deploy` conservó íntegramente una configuración modificada en la base temporal.
- Pasaron las **232 pruebas existentes del backend**: 148 unitarias, nueve HTTP y 75 con MySQL temporal. También pasaron validación del esquema, generación, compilación, TypeScript completo, lint y formato de la documentación modificada.

Angular no se modificó ni se volvió a probar durante la etapa inicial del esquema descrita arriba. La integración posterior de Administración → Envíos tiene sus propias [pruebas](api-cobertura.md); el checkout conserva su fuente de demostración hasta conectar la API pública. El tipo de tarifa nullable deberá tratarse explícitamente al integrar esa fuente.

Para repetir las pruebas SQL en una base exclusivamente de pruebas con las cinco migraciones y sus siete zonas iniciales:

```powershell
mysql --host=127.0.0.1 --port=3306 --user=USUARIO --password --default-character-set=utf8mb4 --database=soho_cobertura_test --execute="source test/esquema-cobertura.sql"
```

El script revierte sus cambios y elimina sus dos procedimientos auxiliares al terminar. No usar `--force`; si se interrumpe, preparar otra base aislada antes de repetirlo. La evidencia de esta entrega está en `.checkout-review/cobertura-esquema/` desde la raíz SOHO.

## Referencias

- [Prisma 7: personalizar migraciones](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations).
- [MySQL 8.0: restricciones CHECK y tratamiento de NULL](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html).
- [Estado de integración](estado-integracion.md).
