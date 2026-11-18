# Administración de Clientes: análisis y contrato propuesto

Análisis del 15 de noviembre de 2026, America/Lima. Revisa las pantallas existentes, sus fuentes de datos y el esquema de usuarios, pedidos y pagos. **Esta entrega documenta una propuesta: no implementa endpoints, modifica fuentes ni genera piezas.** La aplicación de las once migraciones procede de la confirmación del usuario; no se consultó ni modificó `soho_db` en este análisis.

## Conclusión y alcance

Actualización posterior: la [API administrativa de Clientes](api-clientes-administracion.md) y su [integración Angular](../../soho-frontend/docs/integracion-clientes.md) ya están implementadas y verificadas, incluyendo la proyección de identidad invitada de Pedidos/Pagos. Las descripciones de situación inicial y rutas propuestas de este análisis se conservan como antecedente.

El esquema actual **permite implementar una primera entrega de consulta administrativa sin otra migración**. Basta con `Usuario`, `Pedido`, `PedidoArticulo` y `PagoPedido`; las direcciones mostradas deben proceder de las copias históricas de pedidos. No hace falta crear una tabla `Cliente` para repetir los datos de una cuenta.

La condición es distinguir cuentas registradas de compras invitadas: los pedidos de una cuenta se relacionan por `Pedido.usuarioId`; una compra invitada se identifica por el UUID de su pedido. El esquema no ofrece una identidad persistente de persona invitada que permita reconocer compras recurrentes con certeza. Compartir correo, nombre, celular, domicilio o documento de facturación no autoriza a fusionarlas ni a incorporarlas a una cuenta creada posteriormente.

La primera implementación propuesta comprende listado, detalle, historial paginado y direcciones históricas paginadas, exclusivamente para `ADMIN`. Mantiene la consulta de pedidos y pagos existente y sus enlaces. Alta manual de clientes, edición de cuentas, bloqueo, cambios de rol, fusión, asociación de compras invitadas y reembolsos quedan para alcances propios.

## Funcionamiento actual y diferencias

| Elemento                          | Lo que existe                                                                                                                                                    | Adaptación necesaria                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Fuente de Clientes                | `ClientesAdministracion` recorre siempre `CLIENTES_ADMIN_DEMO`.                                                                                                  | Consultar un API específico; no tomar el padrón de datos ficticios.                                                      |
| Relación con compras              | `fichaClienteAdmin` relaciona pedidos por identificador explícito, sin fusionar por correo. En la aplicación real recibe el caché de Pedidos/Pagos.              | Conservar esa separación de identidad y obtener las compras y agregados completos desde MySQL.                           |
| Integración real de Pedidos       | `app.config.ts` sustituye `PagosAdministracion` por `PagosAdministracionApi`; su colección contiene pedidos consultados durante la sesión, no todo el historial. | No calcular Clientes desde ese caché: puede estar vacío, incompleto o contener páginas y detalles visitados previamente. |
| Identificador invitado de Pedidos | `respuestaAdmin` proyecta actualmente `invitado:${p.correo}`.                                                                                                    | Cambiar esa proyección administrativa a `invitado:<UUID del pedido>` y comprobar los enlaces desde Pedidos y Pagos.      |
| Listado                           | Búsqueda local por nombre, correo, identificador y teléfono; filtro de tipo y tres órdenes. Muestra todos los resultados locales, sin paginación.                | Resolver búsqueda, orden, totales y paginación en el servidor.                                                           |
| Estados de pantalla               | `vista` fuerza cargando, error o vacío; detalle solo distingue ficha presente o ausente.                                                                         | Obtener los estados de las peticiones, con reintento real y distinción entre error, falta de permiso y 404.              |
| Importes                          | La ficha suma pagos aprobados e incluye pedidos cancelados con pago conservado. El texto aclara que no descuenta reembolsos.                                     | Conservar esa regla; calcularla sobre el historial completo, con precisión decimal.                                      |
| Contacto y alta                   | La demostración aporta un celular por cliente y fechas de cuenta ficticias.                                                                                      | Usar datos reales de la cuenta o del pedido; la cuenta actual no tiene celular.                                          |
| Direcciones                       | Se deduplican las direcciones de los pedidos disponibles localmente.                                                                                             | Consultar todo el historial propio; conservar distrito, ubicación y referencia históricos.                               |
| Acciones                          | Las dos pantallas son de consulta y enlazan al pedido.                                                                                                           | No incorporar escrituras porque existan datos de contacto editables en otras áreas.                                      |

El identificador por correo encontrado es una proyección administrativa, no la comprobación de autorización del seguimiento privado. `PedidosService.puedeLeer` ya exige la cuenta propietaria, rol `ADMIN` o la credencial privada vigente del pedido invitado. Este análisis no identifica una autorización pública basada en correo; propone corregir la identidad antes de utilizarla para agrupar Clientes.

## Identidad y universo consultado

| Tipo       | Identificador propuesto                                                               | Datos e historial                                                                                         |
| ---------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Registrado | UUID de `Usuario`, conservando el identificador que ya devuelve Pedidos para cuentas. | Cuenta actual e historial de pedidos cuyo `usuarioId` coincide exactamente. Incluye cuentas sin pedidos.  |
| Invitado   | `invitado:<UUID de Pedido>`; nunca el correo en la ruta.                              | Solo ese pedido, siempre que `usuarioId IS NULL`, y su contacto histórico. Su cantidad de pedidos es uno. |

Para conservar los enlaces de compradores que también administran la tienda, el universo de registrados propuesto es: **cuentas con rol `CLIENTE`, más cualquier cuenta con al menos un pedido asociado**. Incluye cuentas inactivas y compradores promovidos a `ADMIN`; excluye administradores sin compras. Una cuenta inactiva sigue teniendo historial. Esta consulta no habilita ni cambia el acceso de ninguna cuenta.

Los conteos significan fichas registradas y compras invitadas, **no personas únicas**. En Angular debe aclararse `Invitados (por pedido)` y que pueden existir varias compras invitadas de una misma persona. El resumen devuelve explícitamente la unidad de conteo de invitados. No reproducir la agrupación recurrente ficticia de los tres invitados de la demostración si los datos reales no permiten acreditarla.

Ejemplo: dos pedidos invitados con el mismo correo producen dos fichas diferentes. Registrarse con ese correo añade una ficha de cuenta; sus pedidos anteriores no aparecen en ella. Un cambio de nombre de cuenta actualiza el contacto de esa ficha, conservando los nombres históricos de cada pedido.

Reconocer posteriormente a un invitado recurrente como una sola persona requerirá definir un mecanismo de identidad y asociación verificable, su consentimiento y reglas de vinculación. Solo entonces se evaluará otra entidad o migración. No introducir ahora esa vinculación mediante una agrupación SQL por correo.

## Procedencia de los datos

| Campo                                   | Registrado                                                    | Invitado                                          |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Nombre y correo de cabecera             | `Usuario.nombres`, `apellidos`, `correo` actuales.            | Copia de contacto del único `Pedido`.             |
| Cuenta desde                            | `Usuario.creadoEn`.                                           | `null`; no tiene fecha de registro.               |
| Cuenta activa y correo verificado       | Valores de `Usuario`, solo lectura.                           | `cuenta: null`; no inferir verificación del pago. |
| Teléfono visible                        | Celular de entrega del pedido más reciente, si existe.        | Celular de entrega de ese pedido.                 |
| Primer y último pedido                  | Mínimo/máximo de `Pedido.creadoEn` del historial relacionado. | Fecha del único pedido.                           |
| Artículos, fotos, talla, SKU e importes | Copias de `PedidoArticulo` y `Pedido`.                        | Las mismas copias históricas de su pedido.        |
| Direcciones                             | Copias de los pedidos relacionados.                           | Copia de su pedido.                               |

El celular de `Pedido` pertenece al **contacto de entrega** y puede corresponder a un destinatario distinto del titular. Proponer el campo `telefonoEntrega`, acompañado de destinatario, código y fecha del pedido fuente; en pantalla usar “Teléfono de entrega del último pedido”. Una cuenta sin pedidos devuelve `null` y muestra “Sin pedidos”; no se rellena con ceros ni con una dirección de su agenda. No añadir un teléfono de perfil ficticio para satisfacer la columna actual.

`DireccionUsuario` es la agenda privada y mutable del usuario; la ficha administrativa seguirá mostrando **Direcciones de pedidos**. No consultar ni permitir editar esa agenda en esta entrega. Tampoco tomar domicilio, destinatario o celular de facturación como identidad de la persona compradora.

Las direcciones históricas se agrupan por la tupla exacta `direccion`, `distritoCodigo`, `distritoNombre`, `provincia`, `departamento`, `referencia`. No aplicar correcciones de cobertura ni sobrescribirlas con la zona vigente. Cada resultado indica usos y último pedido de referencia. No representa un identificador de dirección guardada.

Se conservan los siete códigos conocidos: `la-esperanza`, `trujillo`, `el-porvenir`, `florencia-de-mora`, `victor-larco`, `huanchaco` y `moche`. Un distrito actualmente deshabilitado sigue visible si aparece en un pedido histórico; consultar una ficha no vuelve a cotizar envíos ni cambia tarifas.

## Historial e importes

- `pedidosTotal`: todos los pedidos de la identidad, incluidos pendientes, observados, rechazados, incidencias y cancelados. No excluir registros por falta de aprobación ni por archivo del producto.
- `primerPedido` y `ultimoPedido`: fecha de creación, con desempate por UUID. La actualización de un pago o envío no convierte un pedido antiguo en la última compra.
- `pagosAprobados`: suma de `Pedido.total` donde su único `PagoPedido.estado` sea `APROBADO`, una vez por pedido. Incluye envío y descuento tal como quedaron guardados. Cancelar un pedido con pago aprobado conserva su contribución.
- Los estados `PENDIENTE`, `OBSERVADO`, `RECHAZADO` y `ANULADO`, o un pago ausente, no contribuyen. Las versiones de comprobantes no multiplican la suma ni el número de pedidos.
- La interfaz conserva la nota “Suma de pagos aprobados, incluidos pedidos cancelados con pago conservado. No descuenta reembolsos”. No llamar a este valor ingresos netos ni saldo disponible.
- Sumar con `Decimal`/SQL y emitir cadenas con dos decimales y moneda `PEN`, incluido `"0.00"`. No sumar flotantes en Angular ni recalcular precios desde el catálogo actual.
- Los agregados describen todo el historial propio y son independientes de la página de pedidos o direcciones. Las tablas de historial muestran estados de pago y entrega por separado.

## API propuesta

Estas rutas **todavía no existen**. Mantener la proyección de Clientes independiente de la respuesta administrativa completa del pedido: esta pantalla no necesita comprobantes, facturación, eventos internos ni datos de responsables.

| Método y ruta                                        | Respuesta propuesta                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/clientes`                            | `clientes`, `paginacion`, `resumen` global y `capacidades: { escrituraDisponible: false }`.                            |
| `GET /api/admin/clientes/:identificador`             | `cliente`: contacto con procedencia, cuenta o `null`, agregados completos y capacidades. No incluye arrays ilimitados. |
| `GET /api/admin/clientes/:identificador/pedidos`     | `pedidos` históricos paginados y `paginacion`.                                                                         |
| `GET /api/admin/clientes/:identificador/direcciones` | `direcciones` históricas agrupadas y paginadas, con `paginacion`.                                                      |

### Listado y paginación

| Parámetro  | Regla propuesta                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `busqueda` | Texto de hasta 120 caracteres; recortar extremos. Busca nombre y correo de cabecera, identificador y celular del último pedido de entrega. |
| `tipo`     | `registrado` o `invitado`; omitido incluye ambos.                                                                                          |
| `orden`    | `recientes`, `nombre` o `pedidos`; predeterminado `recientes`.                                                                             |
| `pagina`   | Entero entre 1 y 100000; predeterminado 1.                                                                                                 |
| `limite`   | Entero entre 1 y 50; predeterminado 20.                                                                                                    |

La búsqueda ignora mayúsculas y acentos; para números de teléfono permite espacios, guiones, puntos y paréntesis. `%`, `_` y barra inversa se tratan literalmente. Una búsqueda solo de signos no equivale a búsqueda vacía. No se busca en los correos históricos de otras fichas ni se utiliza el resultado para asociar identidades. Si el teléfono buscado pertenece a una entrega anterior a la última, no forma parte de este filtro inicial.

`recientes` ordena por último pedido descendente, cuentas sin pedidos al final, nombre ascendente e identificador estable como desempate. `nombre` ordena por nombre e identificador. `pedidos` ordena por cantidad descendente y después por los criterios de `recientes`. Resolver el orden sobre ambos tipos antes de paginar; no concatenar dos páginas obtenidas por separado.

`paginacion` contiene `pagina`, `limite`, `total` filtrado y `paginas`. Una página fuera del rango devuelve lista vacía y conserva los totales. `resumen` contiene `total`, `registrados`, `invitados` y `unidadInvitados: "pedido"`, sobre el universo global, sin depender de búsqueda, tipo o página. Los conteos no se calculan desde las filas visibles.

Cada fila devuelve `identificador`, `tipo`, `nombre`, `correo`, `telefonoEntrega` o `null`, `pedidosTotal` y `ultimoPedido` o `null`. `telefonoEntrega` tiene `celular`, `destinatario`, `pedidoCodigo` y `fecha`. `ultimoPedido` tiene `codigo` y `fecha`. No enviar todos los artículos de cada cuenta en el listado.

### Detalle, pedidos y direcciones

El detalle repite la identidad y contacto de la fila, añade `cuenta: { creadaEn, activa, correoVerificado }` o `null`, y `resumen: { pedidosTotal, direccionesTotal, primerPedido, ultimoPedido, pagosAprobados, moneda }`. Primer y último pedido usan `{ codigo, fecha }` o `null`. `pagosAprobados` es una cadena decimal. Los campos de cuenta expresan únicamente su estado actual; no son acciones administrativas.

Historial y direcciones admiten únicamente `pagina` y `limite`, con los mismos límites del listado. El detalle sin subruta no admite parámetros. No es necesario añadir filtros de pago o entrega al historial en esta primera entrega: las pantallas actuales no los tienen.

Cada pedido devuelve `codigo`, `fecha`, contacto y dirección históricos, `estadoPago` o `null`, `estadoEntrega`, `moneda`, `total` decimal y artículos con `sku`, nombre, imagen, color, talla y cantidad históricos. Los estados conservan los valores de los enums del backend; Angular adapta sus etiquetas. Orden por `creadoEn DESC, id DESC`. Enlazar al detalle administrativo existente por código, donde continúan las operaciones de pago y envío.

Cada dirección devuelve los seis campos de su agrupación, `pedidosTotal`, `ultimaUtilizacionEn` y `pedidoReferencia`. Orden por última utilización descendente y la tupla completa como desempate estable. El total paginado cuenta grupos de direcciones, no pedidos.

Las consultas de una misma respuesta deben compartir una transacción de lectura `RepeatableRead` para conciliar filas y totales. Las peticiones separadas pueden reflejar cambios legítimos entre lecturas; al volver desde Pedidos se recargan detalle, historial y direcciones. No se requiere bloquear aprobaciones, cancelaciones o despacho para consultar Clientes.

### Permisos y errores

Reutilizar sesión, rol `ADMIN`, límite de consultas administrativas y cabeceras privadas existentes, incluido `Cache-Control: no-store`. Invitado sin sesión recibe 401; cuenta sin rol administrativo recibe 403. Los GET no realizan escrituras ni necesitan confirmación o CSRF adicional. El código de pedido o el identificador de ficha nunca sustituyen la autorización.

Rechazar con 400 parámetros desconocidos, repetidos, arrays/objetos, enums, enteros o identificadores inválidos. Aceptar únicamente UUID de cuenta o `invitado:<UUID de pedido>`; rechazar `invitado:<correo>`. Una identidad bien formada inexistente o fuera del universo devuelve 404. Un UUID de pedido registrado bajo prefijo invitado también devuelve 404. Una cuenta válida sin pedidos devuelve 200 y sus subconsultas listas vacías. Los errores de persistencia deben producir 503 recuperable sin SQL ni credenciales.

Proyectar campos explícitamente: no enviar hashes, tokens, sesiones, proveedores de acceso, secretos de invitado, documentos de facturación ni imágenes privadas de comprobantes. No persistir las fichas en `localStorage`. Limpiar datos y descartar respuestas antiguas al cerrar sesión, cambiar de cuenta o perder el rol administrativo.

## Trabajo necesario después del análisis

1. **Backend de consulta**: generar módulo, controlador, servicio y contratos con Nest CLI; implementar las cuatro rutas y sus consultas sobre el esquema actual. Reutilizar autorización y manejo de errores. Ajustar la proyección `clienteId` de Pedidos para invitados sin alterar su credencial privada ni sus permisos.
2. **Verificación backend**: contratos, HTTP y MySQL temporal. Comprobar identidad, agregados, paginación, precisión y permisos, además de los enlaces y respuestas existentes de Pedidos/Pagos. No ejecutar seeds ni migraciones en `soho_db`.
3. **Angular**: fuente remota propia, modelos de resumen sin arrays completos, paginación de las tres listas, estados reales y enlaces de ida/vuelta. Conservar búsqueda/tipo/orden/página al navegar; reiniciar página al cambiar filtros. Retirar distintivos, datos y selectores de escenarios de demostración de las rutas reales.
4. **Verificación de integración**: ingreso directo y recarga de fichas, cambios de sesión, errores/reintentos y visualización a 1440, 768 y 390 px. Evitar mostrar una ficha anterior mientras carga otra o después de un 404.

Generadores previstos, todavía no ejecutados:

```powershell
npx.cmd --no-install nest generate module clientes
npx.cmd --no-install nest generate controller clientes/administracion-clientes --flat
npx.cmd --no-install nest generate service clientes/consulta-clientes --flat
npx.cmd --no-install nest generate class clientes/dto/consulta-clientes
npx.cmd --no-install nest generate class clientes/dto/respuesta-clientes
```

Adaptar importaciones ESM con `.js` y organizar por responsabilidad. Reorganizar componentes existentes cuando se compartan; no generar duplicados ni modificar manualmente el cliente Prisma. Para este alcance no se necesita `db:migrate` ni `db:generate`.

## Criterios de aceptación de la implementación futura

- Cuenta sin pedidos, inactiva y cuenta compradora promovida a administrador conservan el comportamiento definido; un administrador sin compras no aparece.
- Dos invitados con el mismo correo/celular y una cuenta posterior con ese correo permanecen separados. La ficha invitada no encuentra otros pedidos; el identificador administrativo no contiene el correo.
- Cambiar nombre de cuenta, agenda, catálogo, fotografía o cobertura no reescribe snapshots del pedido. Moche u otro distrito deshabilitado sigue visible históricamente.
- Aprobar un pago aumenta el agregado una vez; cancelar con pago aprobado lo conserva. Observar, rechazar, anular o añadir versiones de comprobante no produce pagos aprobados ficticios. `0.10 + 0.20` resulta en `"0.30"`.
- Primer/último pedido, cantidad, direcciones e importe abarcan más de una página y no cambian según el caché visitado de Pedidos. Los empates dan orden estable y no duplican filas por artículos, comprobantes o direcciones.
- Registrado y destinatario distintos no comparten una etiqueta de teléfono de perfil. Sin pedidos, fechas y teléfono quedan ausentes; el importe es `"0.00"`.
- Búsqueda con tildes, mayúsculas, celular formateado y comodines literales; tipos, límites y páginas vacías; 400/401/403/404/503; ausencia de datos sensibles y descarte de respuestas de otra sesión.
- Los enlaces desde Pedidos y desde el historial, incluido `clienteOrigen`, resuelven la misma identidad nueva. No se acepta el correo antiguo como alias que agrupe compras invitadas.

## Fuentes y comprobación de esta entrega

Se revisaron [modelo y reglas actuales](../../soho-frontend/src/app/administracion/clientes/modelos/cliente-admin.ts), [servicio de Clientes](../../soho-frontend/src/app/administracion/clientes/servicios/clientes-administracion.ts), [listado](../../soho-frontend/src/app/administracion/clientes/paginas/listado-clientes/listado-clientes.ts), [detalle](../../soho-frontend/src/app/administracion/clientes/paginas/detalle-cliente/detalle-cliente.html), [pruebas existentes](../../soho-frontend/src/app/administracion/clientes/servicios/clientes-administracion.spec.ts), [caché remoto de Pedidos/Pagos](../../soho-frontend/src/app/administracion/pagos/servicios/pagos-administracion-api.ts), [proyección administrativa](../src/pedidos/dto/respuesta-administracion.ts), [autorización de Pedidos](../src/pedidos/pedidos.service.ts) y [esquema Prisma](../prisma/schema.prisma).

La comprobación de esta entrega es documental y de integridad de archivos; no se ejecutaron pruebas funcionales ni se verificaron los endpoints propuestos, que siguen pendientes. Evidencia de hashes de las fuentes y Prisma: `.checkout-review/analisis-clientes/validacion.json`, en la raíz SOHO. No se contactó MySQL ni a proveedores externos.
