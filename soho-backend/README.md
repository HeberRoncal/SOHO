# SOHO Backend

La [integración Angular de Configuración Pagos](../soho-frontend/docs/integracion-configuracion-pagos.md) está terminada sobre la API existente, sin cambios de backend o Prisma: publicación conjunta, QR y recuperación. Pasaron 1015 pruebas Angular y la comprobación con API/MySQL aislados y Cloudinary simulado. Sigue el nuevo checkout; mantener `PAGOS_CHECKOUT_ACTIVO=false`.

La [API de atención administrativa de recepciones](docs/api-atencion-recepciones.md) ya permite bandeja, diagnóstico, consulta privada de evidencia, registro explícito con condiciones originales y solicitudes/cargas de corrección recuperables. Conserva comprador, importe, destino y todas las versiones de imagen; los pagos quedan pendientes. Sus seis piezas se generaron con Nest CLI, sin otra migración. La suite `npm.cmd run test:atencion` exige `TEST_ATENCION_DATABASE_URL` local, migrada y vacía con sufijo `_test`. La [integración Angular administrativa](../soho-frontend/docs/integracion-recepciones.md) ya está conectada; siguen Configuración → Pagos y checkout. Mantener `PAGOS_CHECKOUT_ACTIVO=false` hasta completar el recorrido.

El [procesamiento de recepciones](docs/api-procesamiento-recepciones.md) ya crea pedido, pago pendiente y reservas completas o conserva atención por cambios, con copia privada independiente, procedencia e idempotencia. Mantiene los pedidos v1 y las trece migraciones existentes. La suite específica usa `TEST_PROCESAMIENTO_DATABASE_URL` local, exclusiva, migrada y vacía con sufijo `_test`, mediante `npm.cmd run test:procesamiento`. Sigue la integración Angular; mantener `PAGOS_CHECKOUT_ACTIVO=false` hasta completar el circuito.

Backend de SOHO con NestJS, TypeScript ESM, Prisma y MySQL. `PrismaModule` exporta el servicio compartido de conexión; el catálogo de prueba está cargado en la base local `soho_db`. La API pública del catálogo ya se consulta desde Angular.

El estado vigente está en [Continuidad de integración](docs/estado-integracion.md). El esquema llega a 42 tablas con la decimotercera migración de recepción, aplicada según confirmación del usuario. El usuario confirmó aplicada la [duodécima comercial](docs/esquema-configuracion-comercial.md), además de las anteriores, incluida la [undécima de inventario](docs/esquema-movimientos-inventario.md). La creación, fotografías y publicación de productos ya están conectadas con Angular; la [API de movimientos manuales](docs/api-movimientos-inventario.md) también está integrada con el [diálogo Angular](../soho-frontend/docs/integracion-movimientos-inventario.md). Están implementadas Pagos/QR, métodos/instrucciones y recepción privada; sigue la integración Angular, Angular/checkout y el circuito de Tienda.

La [API administrativa de Pagos y QR](docs/api-configuracion-pagos.md) ya está implementada: publicación versionada de YAPE/PLIN, carga y conciliación de QR Cloudinary, limpieza de huérfanos y recuperación por clave con ADMIN/CSRF. Comparte el cliente Cloudinary con fotografías y conserva referencias históricas, sin otra migración. Su suite usa `TEST_CONFIGURACION_PAGOS_DATABASE_URL` exclusiva y local con sufijo `_test`, mediante `npm.cmd run test:configuracion-pagos`.

La [API de métodos/instrucciones y preparación compartida](docs/api-instrucciones-pago.md) ya ofrece catálogo público y emisión/recuperación privada con condiciones verificadas y destino histórico, sin crear pedidos ni reservas. Conserva compatibilidad v1, siete distritos y la regla SKU decimal. `PAGOS_CHECKOUT_ACTIVO=false` por defecto mantiene desactivadas nuevas emisiones hasta completar recepción/procesamiento/atención y Angular. No requiere otra migración ni regenerar Prisma. Su suite usa `TEST_INSTRUCCIONES_DATABASE_URL` local, exclusiva, migrada y vacía con sufijo `_test`, mediante `npm.cmd run test:instrucciones`.

La [API de recepción privada de comprobantes](docs/api-recepciones-compra.md) reserva identidad antes del IO, confirma y recupera archivos con leases y hashes, y permite consulta/streaming de propiedad. Conserva evidencia ante fallos o cambios comerciales, sin crear pedido ni reservas. Reutiliza almacenamiento privado compartido y seis piezas nuevas generadas con Nest CLI, sin otra migración. Su suite usa `TEST_RECEPCIONES_DATABASE_URL` local, exclusiva, migrada y vacía con sufijo `_test`, mediante `npm.cmd run test:recepciones`.

El [esquema de recepción de compras y su decimotercera migración](docs/esquema-recepciones-compra.md) están preparados y validados, con 42 tablas de dominio y cliente Prisma regenerado. Añaden recepción previa al pedido, versiones de comprobantes privados y operaciones recuperables, con procedencia opcional para pagos anteriores. El usuario confirmó aplicada la decimotercera, además de las doce anteriores. La recepción privada ya está implementada; sigue la integración Angular y Angular conforme al [diseño](docs/analisis-instrucciones-pago.md).

Las rutas, filtros, respuestas y errores están documentados en [API del catálogo](docs/api-catalogo.md).

La [API administrativa de Clientes](docs/api-clientes-administracion.md) ya permite listado, detalle, historial y direcciones históricas paginadas con sesión ADMIN. Mantiene cuentas sin compras y separa las compras invitadas por UUID de pedido, sin fusionarlas por correo. Sus agregados abarcan todo el historial y distinguen teléfono de entrega de datos de cuenta. Se generó con Nest CLI, sin otra migración ni regeneración Prisma, y ya está [conectada con Angular](../soho-frontend/docs/integracion-clientes.md). La suite específica usa una base local, migrada y vacía con sufijo `_test`, indicada mediante `TEST_CLIENTES_DATABASE_URL`, y se ejecuta con `npm.cmd run test:clientes`; no utiliza `DATABASE_URL` como alternativa.

La [API de archivo y restauración de productos](docs/api-archivo-productos.md) está implementada, sin otra migración: archiva borradores/publicados y restaura como borrador con versión, auditoría y recuperación por clave. Conserva inventario, reservas, fotografías y pedidos. La [edición comercial y fotografías de publicados](docs/api-edicion-publicados.md) también está implementada con validación completa e identidad protegida. Estas acciones ya están [conectadas con Angular](../soho-frontend/docs/integracion-publicados-archivo.md).

El módulo `catalogo` agrupa los contratos en `dto/` y el manejo de errores en `filtros/`. El filtro se generó con Nest CLI y reutiliza el manejo de errores existente; módulo, controlador y servicio permanecen en la raíz de la carpeta.

El módulo de [Autenticación y RBAC](docs/autenticacion.md) incorpora registro de clientes, contraseña o Google, vinculación explícita, sesiones con cookie, consulta de cuenta, logout y autorización por rol. Angular utiliza estos flujos y protege su navegación. Configurar el ID público del cliente web en `GOOGLE_CLIENT_ID`; no se utiliza secreto de cliente. Para crear un administrador desde una terminal interactiva: `npm.cmd run admin:crear`.

Su [organización de carpetas](docs/estructura-autenticacion.md) agrupa acceso, seguridad, sesiones, correo, Google, recuperación y verificación. `autenticacion.module.ts` centraliza el registro de estos componentes.

El diseño del catálogo está en [Esquema del catálogo](docs/esquema-catalogo.md). Sus nueve tablas se complementan con `usuarios`, `identidades_externas`, `sesiones` y `tokens_usuario`, descritas en [Esquema de usuarios ADMIN y CLIENTE](docs/esquema-usuarios.md). El esquema admite contraseña local opcional y vinculación de Google. La cuarta migración añade `direcciones_usuario`; la [API de Mis direcciones](docs/api-direcciones.md) está conectada al formulario Angular. La quinta añade `zonas_entrega`, con quince tablas y los siete distritos existentes. La [API de cobertura](docs/api-cobertura.md) ofrece consulta y cotización públicas y gestión `ADMIN` conectada a Configuración → Envíos. La Esperanza conserva su tarifa gratuita; los importes pendientes pueden definirse desde esa pantalla.

La conexión, el seed y sus verificaciones están en [Conexión y datos iniciales](docs/conexion-datos-iniciales.md).

La [sexta migración de pedidos](docs/esquema-pedidos.md) añadió nueve modelos para pedidos, artículos y unidades, facturación, pagos manuales, versiones de comprobante, reservas, configuración e historial. La [séptima de envíos](docs/esquema-envios.md) añadió el registro de preparación, despacho y entrega. El usuario confirmó aplicadas las siete. La [API de pedidos](docs/api-pedidos.md), la [revisión de pagos](docs/api-pagos.md) y la [gestión de envíos](docs/api-envios.md) están conectadas con Angular; consultar [Integración de pedidos](../soho-frontend/docs/integracion-pedidos.md) e [Integración de preparación y envíos](../soho-frontend/docs/integracion-preparacion-envios.md).

Prisma contiene veintiséis tablas con la [octava migración de cancelaciones](docs/esquema-cancelaciones.md), `20261114020000_cancelaciones_pedido`, validada en MySQL temporal y aplicada localmente según confirmación del usuario. Añade un registro único por pedido con motivo interno, responsable, fecha, estados anteriores, versión y decisión sobre reservas consultadas. La [API de cancelación y liberación posterior de reservas retenidas](docs/api-cancelaciones.md) ya está implementada; su [integración Angular](../soho-frontend/docs/integracion-cancelaciones.md) ya está implementada. El esquema por sí solo no cancela pedidos ni modifica pagos o inventario. La [API de configuración de reservas](docs/api-configuracion-reservas.md) ya consulta y guarda la política para nuevas reservas con ADMIN, confirmación, CSRF y versión; su [formulario Angular](../soho-frontend/docs/integracion-configuracion-reservas.md) ya está integrado. No añade migraciones. El modo temporal no admite nuevos cambios hasta implementar su procesamiento. Consultar [Estado de integración](docs/estado-integracion.md).

## Preparación

Desde esta carpeta:

```powershell
npm.cmd ci
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run build
```

La validación y generación no requieren MySQL ni un archivo `.env`. La compilación también genera el cliente mediante `prebuild`. El cliente queda en `src/generated/prisma` y no se guarda en Git. Prisma, su cliente y el adaptador MySQL usan la misma versión fija, 7.10.1.

## Desarrollo y comprobaciones

```powershell
npm.cmd run start:dev
npm.cmd run db:check
npm.cmd test
npm.cmd run test:e2e
npm.cmd run lint
```

## Base de datos

`prisma/schema.prisma` contiene los modelos y `prisma/migrations` la migración inicial y sus restricciones SQL. MySQL debe ser 8.0.16 o posterior para aplicar los `CHECK`.

Para preparar otra instalación, copiar `.env.example` a `.env` y reemplazar sus marcadores con la conexión elegida. `.env` está excluido de Git. En el entorno local actual se usa `soho_db` y el usuario confirmó aplicadas once migraciones y la conversión del catálogo. El siguiente comando aplica únicamente las migraciones pendientes a la base configurada; no hace falta repetirlo por la undécima ya aplicada. No repetir el seed ni la conversión para esta ampliación:

```powershell
npm.cmd run db:migrate:deploy
```

La carga de datos de demostración es explícita y se ejecuta únicamente en desarrollo o pruebas:

```powershell
npm.cmd run db:seed
npm.cmd run db:check
```

El seed conserva los registros existentes y sus ediciones. No restablece inventario ni vuelve a crear imágenes o variantes retiradas de productos existentes. Toda la carga se realiza en una transacción. Los datos se leen de una copia local del catálogo migrado; no es necesario tener el proyecto Angular para repetirla.

Herramientas para trabajar con el esquema sin modificar una base de datos:

```powershell
npm.cmd run db:format
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:diff
```

La salida de `db:diff` compara una base vacía con el esquema; no reemplaza el SQL de migración, que incluye `CHECK` manuales. Las pruebas SQL y sus requisitos están documentados en [Validación del esquema](docs/esquema-catalogo.md#validación).

Las pruebas de integración de Prisma y el seed requieren otra base migrada, vacía y exclusiva de pruebas, cuyo nombre termine en `_test`. Se indica mediante `TEST_DATABASE_URL` y se ejecutan con `npm.cmd run test:db`; el procedimiento está en la documentación de conexión. No utilizan `DATABASE_URL` como alternativa ni borran datos para preparar la prueba.

El catálogo, detalle, acceso por contraseña o Google, edición de nombres y apellidos, recuperación de contraseña, verificación de correo, agenda y cobertura están integrados con la API y RBAC de NestJS. El [checkout](../soho-frontend/docs/integracion-checkout.md) consulta las tarifas reales y permite elegir direcciones, manteniendo la compra como invitado. El envío de enlaces requiere configurar SMTP según [Recuperación de contraseña](docs/recuperacion-contrasena.md); [Verificación de correo](docs/verificacion-correo.md) utiliza el mismo transporte y origen. La creación y consulta de pedidos con comprobante privado y reservas ya está implementada en el backend. Angular crea y consulta pedidos reales y recupera resultados inciertos sin duplicarlos. Revisión de pagos y envíos también están integrados. Cancelaciones y liberación posterior de reservas retenidas también están integradas con Angular. La API de configuración de reservas también está implementada; el procesamiento de vencimientos, posventa, cambio de correo y las demás escrituras administrativas siguen pendientes.

Los comprobantes requieren almacenamiento privado persistente. Se utiliza `.privado` desde el directorio de ejecución o `PEDIDOS_DIRECTORIO_PRIVADO`; esa carpeta no debe servirse públicamente. La validación y recodificación de imágenes utilizan `sharp`, instalado mediante el lockfile. Consultar el contrato y los límites en [API de pedidos](docs/api-pedidos.md).
