# API administrativa de consulta de Clientes

Implementada el 15 de noviembre de 2026, conforme al [análisis de Clientes](analisis-clientes-administracion.md). No modifica Prisma ni requiere otra migración o regeneración del cliente. La [integración de las pantallas Angular](../../soho-frontend/docs/integracion-clientes.md) ya está terminada; conserva el contrato aquí descrito.

## Organización y autorización

`ClientesModule` está registrado en `AppModule`, con `PrismaModule` y `AutenticacionModule`. Las piezas nuevas se generaron desde `soho-backend` con el CLI local:

```powershell
npx.cmd --no-install nest generate module clientes
npx.cmd --no-install nest generate controller clientes/administracion-clientes --flat
npx.cmd --no-install nest generate service clientes/consulta-clientes --flat
npx.cmd --no-install nest generate class clientes/dto/consulta-clientes
npx.cmd --no-install nest generate class clientes/dto/respuesta-clientes
npx.cmd --no-install nest generate filter clientes/filtros/error-clientes
```

Los contratos y el filtro generados se reorganizaron en `clientes/dto/` y `clientes/filtros/`, junto con sus pruebas. Las importaciones ESM utilizan `.js`. Se reutilizan sesión, `Roles('ADMIN')`, límite administrativo `consultar-pedido` y auxiliares de paginación y búsqueda literal existentes.

Todas las rutas requieren sesión administrativa y devuelven `Cache-Control: no-store`. Sin sesión: 401. Con una cuenta sin rol `ADMIN`: 403. Los GET no necesitan CSRF adicional ni confirmación. La autorización se comprueba en cada petición; perder el rol o cerrar la sesión impide seguir consultando.

## Rutas y filtros

| Método y ruta                                        | Resultado                                         |
| ---------------------------------------------------- | ------------------------------------------------- |
| `GET /api/admin/clientes`                            | Fichas paginadas, conteos globales y capacidades. |
| `GET /api/admin/clientes/:identificador`             | Contacto, cuenta y agregados completos.           |
| `GET /api/admin/clientes/:identificador/pedidos`     | Historial paginado, con artículos históricos.     |
| `GET /api/admin/clientes/:identificador/direcciones` | Direcciones históricas agrupadas y paginadas.     |

El listado admite:

| Parámetro  | Regla                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `busqueda` | Hasta 120 caracteres, sin controles; recorta extremos. Nombre y correo de cabecera, identificador y celular de entrega del último pedido. |
| `tipo`     | `registrado` o `invitado`; omitido incluye ambos.                                                                                         |
| `orden`    | `recientes` —predeterminado—, `nombre` o `pedidos`.                                                                                       |
| `pagina`   | Entero de 1 a 100000; predeterminado 1.                                                                                                   |
| `limite`   | Entero de 1 a 50; predeterminado 20.                                                                                                      |

Historial y direcciones admiten únicamente `pagina` y `limite`. El detalle no admite parámetros. Para los valores predeterminados se omite el parámetro, sin enviar cadenas vacías para tipo, orden o paginación. Parámetros desconocidos, repetidos, arrays, objetos o valores inválidos producen 400.

Nombre y correo se buscan sin distinguir mayúsculas ni acentos. El teléfono admite espacios, guiones, paréntesis y puntos; solo se consulta el del último pedido. `%`, `_` y barra inversa son literales. Una búsqueda solo de signos no equivale a búsqueda vacía. Las consultas SQL son parametrizadas.

`recientes` ordena por creación del último pedido descendente, cuentas sin pedidos al final, nombre e identificador. `nombre` ordena por nombre e identificador. `pedidos` prioriza cantidad descendente y desempata con los criterios de `recientes`. La unión de registrados e invitados se filtra y ordena antes de paginar en MySQL.

## Identidad y respuestas

Registrados: UUID de `Usuario`; incluye cuentas `CLIENTE` aunque estén inactivas o sin pedidos, y cualquier cuenta compradora, incluso si fue promovida a `ADMIN`. Excluye administradores sin compras. El historial se relaciona exclusivamente por `Pedido.usuarioId`.

Invitados: `invitado:<UUID del pedido>`, para un pedido con `usuarioId IS NULL`. Se cuentan **por compra, no como personas únicas**. Compartir correo, nombre, celular o domicilio no fusiona compras; una cuenta posterior no las incorpora automáticamente. No se admite `invitado:<correo>` como alias.

Pedidos/Pagos ya proyectan ese mismo identificador en `clienteId`; los registrados conservan el UUID de cuenta. No cambia el código del pedido, sus credenciales privadas ni la autorización de propietario. Tratar el identificador de Clientes como un valor opaco al construir enlaces.

El listado devuelve `{ clientes, paginacion, resumen, capacidades }`:

- Cada fila contiene `identificador`, `tipo`, `nombre`, `correo`, `telefonoEntrega` o `null`, `pedidosTotal` y `ultimoPedido` o `null`.
- `telefonoEntrega`: `{ celular, destinatario, pedidoCodigo, fecha }`, procedente del último pedido. Puede pertenecer a otra persona; no es un teléfono de perfil. `Usuario` todavía no guarda celular.
- Referencias de primer/último pedido: `{ codigo, fecha }`, o `null`.
- `paginacion`: `{ pagina, limite, total, paginas }`; el total corresponde al filtro completo. Una página fuera de rango devuelve lista vacía conservando los totales.
- `resumen`: `{ total, registrados, invitados, unidadInvitados: "pedido" }`, sobre el universo global, independiente de filtros y página.
- `capacidades`: `{ escrituraDisponible: false }`.

El detalle devuelve `{ cliente }`. Además de los campos de fila, `cliente` incluye `cuenta: { creadaEn, activa, correoVerificado }` o `null`, `capacidades` y `resumen: { pedidosTotal, direccionesTotal, primerPedido, ultimoPedido, pagosAprobados, moneda }`.

Nombre y correo de cabecera son actuales para una cuenta e históricos para una compra invitada. Los agregados abarcan todo el historial propio y no dependen del caché de Pedidos ni de la página abierta. Una cuenta sin compras devuelve fechas y teléfono `null`, listas vacías e importe `"0.00"`.

## Importes e históricos

`pagosAprobados` suma con precisión decimal el total histórico de cada pedido cuyo único pago agregado esté `APROBADO`, una vez por pedido. Incluye cancelados con pago conservado. No suma pendientes, observados, rechazados, anulados ni pagos ausentes; tampoco multiplica por artículos o versiones de comprobante. Se entrega como cadena de dos decimales y moneda `PEN`.

La etiqueta es **Pagos aprobados**, indicando que incluye cancelados con pago conservado y no descuenta reembolsos. No representa ingresos netos.

El historial devuelve `{ pedidos, paginacion }`, ordenado por creación e UUID descendentes. Cada pedido contiene `codigo`, `fecha`, `contacto` histórico, `direccion` histórica con destinatario/celular, `estadoPago` —o `null`—, `estadoEntrega`, `moneda`, `total` decimal y `articulos`. Los artículos contienen `sku`, `nombre`, `imagen`, `color`, `talla` y `cantidad` del momento de compra. Los estados conservan los enums del backend; pago y entrega son independientes. Las operaciones continúan en el detalle administrativo existente por código.

Direcciones devuelve `{ direcciones, paginacion }`. Agrupa exactamente por `direccion`, `distritoCodigo`, `distritoNombre`, `provincia`, `departamento` y `referencia`, distinguiendo mayúsculas, acentos y espacios. Cada resultado añade `pedidosTotal`, `ultimaUtilizacionEn` y `pedidoReferencia` —código del último pedido con desempate por UUID—. Orden por última utilización descendente y la tupla completa; el total paginado cuenta grupos de direcciones.

No se consulta la agenda `DireccionUsuario`, no se recalculan precios desde el catálogo ni se cotiza otra vez. Conserva los códigos `la-esperanza`, `trujillo`, `el-porvenir`, `florencia-de-mora`, `victor-larco`, `huanchaco` y `moche`, aunque su cobertura actual esté deshabilitada. Editar o archivar un producto no altera sus snapshots.

Cada respuesta usa una transacción de lectura `RepeatableRead` para conciliar filas y totales. Peticiones separadas pueden reflejar cambios entre lecturas; Angular deberá recargar al volver desde Pedidos. Consultar Clientes no bloquea ni modifica aprobaciones, cancelaciones, reservas o envíos.

## Errores, privacidad y validación

Identidad mal formada: 400. Identidad válida inexistente o fuera del universo: 404, incluido un pedido registrado presentado como invitado. Las subconsultas comprueban identidad antes de leer el historial. Persistencia no disponible: 503 recuperable, sin SQL ni credenciales.

Las proyecciones seleccionan campos explícitos y no entregan hashes, tokens, sesiones, secretos de invitado, facturación, comprobantes privados, eventos internos ni responsables de otras operaciones. La fuente Angular ya retira datos al perder sesión/rol, descarta respuestas antiguas y evita almacenamiento persistente de fichas.

La entrega aprobó **1160 pruebas**: 764 unitarias, nueve HTTP generales, 350 de regresión MySQL y 37 específicas de Clientes con HTTP/MySQL temporal. Comprueban permisos y revocación, identidades compartidas, cuentas sin compras/inactivas y compradores ADMIN, búsqueda literal, paginación conjunta, importes, cancelados aprobados e históricos de los siete distritos. Las cuatro consultas conservaron exactamente diez tablas de negocio. Pasaron compilación NestJS, TypeScript completo, lint sin avisos y formato.

Prisma, las once migraciones, el cliente generado y las fuentes Angular conservaron sus hashes durante la entrega de esta API. No se contactó `soho_db` ni proveedores externos. Evidencia: `.checkout-review/clientes-api/validacion.json`, en la raíz SOHO. Posteriormente se completó la [integración Angular](../../soho-frontend/docs/integracion-clientes.md) sin modificar estos contratos.
