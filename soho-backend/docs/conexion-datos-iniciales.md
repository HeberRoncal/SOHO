# Conexión de NestJS y datos iniciales

Fecha: 13 de noviembre de 2026 (America/Lima).

NestJS utiliza `PrismaModule` y `PrismaService` para consultar MySQL. El catálogo de demostración ya se cargó en la base local `soho_db`; no se cambió el esquema ni se añadió otra migración en esta etapa.

## Conexión

`src/prisma/cliente-prisma.ts` valida `DATABASE_URL` y crea el adaptador oficial `@prisma/adapter-mariadb` 7.10.1. El adaptador acepta la conexión MySQL completa y conserva las opciones de su URL. Prisma y el cliente usan la misma versión.

`PrismaService` conecta al inicializar el módulo y libera la conexión al cerrar la aplicación. `main.ts` carga `.env` y habilita los eventos de cierre de NestJS. Los módulos que necesiten acceder a la base deben importar `PrismaModule` e inyectar `PrismaService`.

La aplicación requiere que MySQL esté disponible al arrancar. Los errores de configuración y los comandos de comprobación no imprimen la URL ni las credenciales. `.env` continúa excluido de Git; `.env.example` usa marcadores y el nombre `soho_db`.

```powershell
npm.cmd run build
npm.cmd run db:check
npm.cmd run start:dev
```

La compilación ejecuta `prisma generate` automáticamente. `db:check` crea un contexto NestJS, consulta las nueve tablas y un producto publicado, muestra el resultado y cierra el contexto. Es una lectura; no inicia un servidor HTTP permanente.

## Catálogo cargado

`prisma/datos/catalogo-demostracion.json` es una copia local del catálogo público migrado de Angular, con precios expresados como cadenas decimales. El backend puede ejecutar el seed sin depender del repositorio del frontend. Las rutas de imágenes y logotipos conservan sus destinos actuales en `/imagenes/`; esta entrega no añade almacenamiento ni un servidor de archivos.

| Tabla                     | Registros iniciales |
| ------------------------- | ------------------: |
| Marcas                    |                   6 |
| Categorías                |                   5 |
| Productos                 |                  11 |
| Colores de producto       |                  14 |
| Tallas EU                 |                  27 |
| Variantes                 |                 168 |
| Imágenes generales        |                  17 |
| Imágenes de color         |                  14 |
| Movimientos de inventario |                 144 |

Los 11 productos conservan sus slugs, precios, fotografías, estados de novedad, género, tallas, SKU y existencias ilustrativas del catálogo público. Se asignan códigos internos de `SHO-0001` a `SHO-0011`. El catálogo de tallas abarca EU 35 a 48 en pasos de 0,5; las variantes importadas conservan las tallas presentes en los datos originales.

Las reservas iniciales son cero. Cada variante con stock tiene una entrada `STOCK_INICIAL` desde saldo cero y referencia `seed-catalogo-v1`; las variantes agotadas no generan movimientos de cantidad cero. Los datos son de prueba, no inventario comercial confirmado.

## Repetir el seed

```powershell
npm.cmd run db:seed
```

Prisma ejecuta `prisma/seed.ts` mediante la configuración de `prisma.config.ts`. La carga nunca se ejecuta al arrancar la aplicación ni al compilar. Se rechaza cuando `NODE_ENV` es `production`.

La función `sembrarCatalogo` realiza toda la carga en una transacción:

1. Encuentra o crea marcas por código, categorías por slug y tallas por sistema y valor. Conserva los datos de los registros existentes.
2. Busca cada producto por slug, código interno o código de modelo. Si existe, conserva el producto completo, sin modificar precio, estado, inventario, reservas, imágenes, variantes ni fechas.
3. Si los identificadores apuntan a productos diferentes, detiene la carga y revierte la transacción para que el conflicto se resuelva explícitamente.
4. Crea los productos faltantes como borradores, con sus galerías, colores, variantes y movimientos. Después establece su estado publicado dentro de la misma transacción.

El seed crea datos faltantes, pero no actúa como herramienta de restauración: no vuelve a añadir fotografías o variantes retiradas de un producto existente ni restablece sus valores. Un fallo revierte todos los cambios de esa ejecución. Dos ejecuciones que compitan simultáneamente pueden provocar un conflicto de unicidad; la transacción fallida se revierte y puede repetirse.

## Validación

Se comprobó la conexión primero mediante consultas de lectura y se confirmó que `soho_db` estaba vacía. Se ejecutó el seed autorizado y luego `db:check` leyó los conteos anteriores desde NestJS. El producto de ejemplo fue `af1`, Nike Air Force 1 '07, con precio `529.90`.

También se compiló la aplicación y se verificó su arranque con el código generado: el endpoint inicial respondió HTTP 200 y `PrismaService` leyó el mismo producto desde MySQL. La aplicación de esa comprobación se cerró al terminar.

Pasaron 11 pruebas unitarias, una prueba HTTP e2e, cinco pruebas de integración con MySQL real aislado, la compilación, TypeScript y lint. Las pruebas de MySQL utilizaron otra instancia con directorio y puerto propios, sin usar `soho_db`:

- Carga completa, precisión de céntimos y entradas de stock sin reservas.
- Repetición sin duplicados ni cambios en identificadores, fechas o movimientos.
- Conservación de ediciones, archivado, ajustes de inventario, reservas y fotografías retiradas.
- Reversión de toda la transacción ante una talla inválida.
- Consulta mediante `PrismaModule` y cierre de la conexión.

Para repetir las pruebas de MySQL, preparar una base exclusiva, vacía y migrada cuyo nombre termine en `_test`. Usar las credenciales de pruebas en la terminal correspondiente:

```powershell
$env:TEST_DATABASE_URL = "mysql://USUARIO:CONTRASENA@127.0.0.1:3306/soho_prisma_test"
npm.cmd run test:db
```

Las pruebas no toman `DATABASE_URL` como alternativa, no vacían tablas para prepararse y rechazan una base que ya tenga datos. Sus filas se conservan en la base de pruebas para inspección; para repetirlas hace falta otra base de pruebas vacía. Las pruebas unitarias y HTTP habituales se ejecutan sin conexión:

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run lint
```

## Siguiente etapa

Los endpoints públicos y la integración con Angular se implementaron posteriormente y se documentan en [API del catálogo](api-catalogo.md). Las escrituras administrativas, autenticación, pedidos y reservas reales requieren sus módulos y validaciones.

## Referencias

- [Integración de Prisma con NestJS](https://docs.nestjs.com/recipes/prisma).
- [Adaptador MySQL de Prisma](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql).
- [Seeds de Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding).
