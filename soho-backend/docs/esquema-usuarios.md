# Esquema de usuarios: ADMIN y CLIENTE

Fecha: 13 de noviembre de 2026 (America/Lima).

El esquema de Prisma incorpora cuatro tablas de autenticación y una referencia opcional al responsable de los movimientos de inventario. Se utilizan únicamente los roles `ADMIN` y `CLIENTE`, en una sola tabla de usuarios. El catálogo y la autenticación reúnen trece tablas de negocio. La cuarta migración añade la agenda de [Mis direcciones](esquema-direcciones.md); el usuario confirmó su aplicación local y la [API](api-direcciones.md) ya está conectada a Angular. La quinta migración preparada añade [cobertura de entrega](esquema-cobertura.md), llevando el esquema completo a quince tablas.

La migración `prisma/migrations/20261113010000_usuarios_sesiones_tokens/migration.sql` incorpora usuarios, sesiones y tokens. La migración `prisma/migrations/20261113020000_identidades_externas_google/migration.sql` añade identidades externas y hace opcional la contraseña local. Las migraciones se comprobaron en MySQL aislado y el usuario ya las aplicó a su base local. El módulo de [Autenticación y RBAC](autenticacion.md) implementa acceso por contraseña o Google, vinculación y recuperación de contraseña.

## Tablas y relaciones

| Modelo Prisma      | Tabla MySQL            | Datos                                                                                                                                   |
| ------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Usuario`          | `usuarios`             | ID UUID, nombres, apellidos, correo único, hash de contraseña, rol, activo, verificación de correo y fechas de creación y actualización |
| `IdentidadExterna` | `identidades_externas` | ID UUID, usuario, proveedor `GOOGLE`, identificador `sub` y fecha de creación                                                           |
| `Sesion`           | `sesiones`             | ID UUID, usuario, hash del identificador de sesión, creación, última actividad, vencimiento y revocación                                |
| `TokenUsuario`     | `tokens_usuario`       | ID UUID, usuario, propósito, hash del token, creación, vencimiento, consumo y revocación                                                |

Un usuario puede tener varias identidades externas, sesiones, tokens, direcciones y movimientos de inventario asociados. `usuarioResponsableId` en `MovimientoInventario` referencia a `Usuario`. Las claves foráneas restringen borrado y cambio de identificadores para conservar las relaciones y el historial. Las cuentas se desactivarán mediante `activo`, sin borrar sus movimientos.

No se añaden tablas de roles o permisos ni el rol de propietario. Todos los `ADMIN` comparten los permisos administrativos; el guard RBAC ya está disponible. Los `CLIENTE` deben acceder únicamente a su cuenta y sus propios datos. Las opciones de propietario y permisos individuales de la pantalla administrativa de demostración deberán adaptarse a este modelo al conectar esa pantalla y sus servicios.

## Usuarios

- `rol` admite exclusivamente `ADMIN` y `CLIENTE`, y tiene `CLIENTE` como valor predeterminado.
- El endpoint público de registro fija siempre `CLIENTE` y rechaza campos ajenos a su contrato, incluido un rol enviado por el navegador. El valor predeterminado en la base no sustituye esa validación del servidor.
- Los administradores se crean mediante `npm.cmd run admin:crear`, documentado en [Autenticación y RBAC](autenticacion.md). No se crea automáticamente un administrador ni se guarda una contraseña de ejemplo.
- `nombres` y `apellidos` tienen hasta 80 caracteres y requieren al menos dos caracteres después de recortar espacios, en consonancia con los modelos actuales de registro.
- `correo` admite hasta 254 caracteres y se guarda recortado y en minúsculas. La restricción SQL comprueba esa forma y un formato básico de correo; el servicio completará la validación.
- La columna de correo usa `utf8mb4_bin`, para no confundir direcciones por eliminación de acentos. La normalización a minúsculas se exige antes de guardar. Esta colación se conserva en el SQL porque Prisma no dispone de un atributo de campo para expresarla.
- `claveHash` es opcional, de hasta 255 caracteres. `NULL` indica que no hay contraseña local; no se usan cadenas vacías ni contraseñas inventadas para cuentas Google. Cuando hay un valor, el formato externo esperado sigue siendo PHC de Argon2id. El `CHECK` exige el prefijo, ausencia de espacios y longitud mínima; no calcula el hash, comprueba su coste ni garantiza que una cadena sea un hash criptográfico válido. Esa labor corresponde al servicio de contraseñas.
- `activo` empieza en `true`. `correoVerificadoEn` puede estar vacío; actividad y verificación son conceptos diferentes. El flujo de autenticación deberá comprobarlos según su política de acceso.

## Identidades externas y acceso con Google

`IdentidadExterna` vincula un usuario local con una cuenta de Google. `proveedor` admite únicamente `GOOGLE`. `identificadorProveedor` guarda el `sub` de un ID token verificado, hasta 255 caracteres ASCII imprimibles sin espacios ni controles. La columna usa `ascii_bin` para distinguir mayúsculas; la colación y el `CHECK` deben conservarse en las migraciones SQL.

El par `(proveedor, identificadorProveedor)` es único: una identidad externa no puede pertenecer a dos usuarios. `usuarioId` tiene un índice y una clave foránea con borrado y actualización restringidos. La tabla no guarda contraseñas de Google, ID tokens, access tokens ni refresh tokens del proveedor.

Una cuenta puede tener contraseña, identidad Google o ambos métodos. El servicio de autenticación aplica estas reglas:

- Validar firma, emisor, destinatario, vencimiento y las protecciones del flujo antes de confiar en un ID token. Usar `sub` para resolver la identidad; el correo puede cambiar.
- Crear usuario e identidad en una transacción y exigir al menos un método de acceso al confirmar la operación. El `CHECK` de la contraseña no puede comprobar por sí solo una fila de otra tabla.
- Exigir autenticación de la cuenta local para vincular Google; no unir cuentas automáticamente porque coincida el correo.
- Crear los nuevos usuarios públicos como `CLIENTE`, sin aceptar roles del navegador o del proveedor. Vincular Google no modifica el rol local.
- Evitar desvincular el último método disponible. No permitir acceso por contraseña ni recuperación de una contraseña local inexistente; definir por separado el alta de una contraseña para una cuenta Google autenticada.
- Conservar la validación de nombres y apellidos. Si Google no aporta todos los datos requeridos, solicitar que se complete el perfil antes de crear la cuenta.
- Decidir la verificación del correo según la evidencia del proveedor; no asumir que cualquier correo de una cuenta Google sigue bajo su control.

Las cuentas Google reutilizan `sesiones` y la autorización RBAC de SOHO. El esquema no introduce JWT propios ni copias del rol en las identidades. El acceso y la vinculación están implementados y requieren configurar el ID público de cliente web; consultar [Autenticación](autenticacion.md).

## Sesiones

`tokenHash` es único y contiene 64 caracteres hexadecimales en minúsculas, preparado para almacenar el resumen SHA-256 de un identificador aleatorio. No se almacena el identificador que viajará en la cookie.

La base verifica que el vencimiento sea posterior a la creación, que la última actividad esté dentro de ese intervalo y que una revocación no preceda a la creación. Hay índices para buscar sesiones de un usuario y para limpiar registros por vencimiento.

El módulo de [Autenticación y RBAC](autenticacion.md) ya implementa cookie `HttpOnly`, `Secure` en producción, `SameSite`, CSRF con HMAC, vencimiento absoluto de 12 horas e inactividad de 30 minutos y cierre con revocación. El guard rechaza las cuentas desactivadas y marca como revocadas sus sesiones detectadas. No se guarda una copia del rol en la sesión: se consulta el estado y rol vigente del usuario. La futura edición administrativa y el cambio de contraseña deberán revocar las sesiones correspondientes en sus propias operaciones.

## Tokens de usuario

`tipo` tiene únicamente dos valores: `VERIFICACION_CORREO` y `RECUPERACION_CLAVE`. No se añaden invitaciones administrativas.

Cada token tiene hash único de 64 caracteres hexadecimales en minúsculas. Los `CHECK` verifican vencimiento posterior a creación, consumo entre creación y vencimiento y revocación no anterior a creación.

Los campos `usadoEn` y `revocadoEn` permiten invalidar el token y conservar el registro. Recuperación y verificación implementan consumo atómico, validación de propósito y vigencia e invalidación de enlaces anteriores. Los enlaces de [verificación de correo](verificacion-correo.md) vencen a las ocho horas; su hash liga el UUID y secreto al correo destinatario, sin añadir columnas. Guardar las fechas no sustituye esas comprobaciones del servicio.

## Inventario y datos existentes

La migración añade `usuario_responsable_id` nullable e indexado a `movimientos_inventario`. Los registros existentes conservan `NULL`; no se les atribuye una persona que no consta en el historial. Las cargas automáticas pueden seguir sin responsable humano.

Los nuevos movimientos manuales deberán obtener el usuario de la sesión autenticada y exigir rol `ADMIN` y cuenta activa. No se aceptará un responsable elegido desde el cuerpo de la solicitud. La clave foránea comprueba que el usuario exista; el rol se verificará en el servicio, ya que esa condición depende de otra tabla.

No se modifica la migración inicial ni se eliminan, renombran o reinician tablas del catálogo. El seed de productos tampoco añade usuarios ni cambia sus datos.

## Aplicación en la base local

Desde `soho-backend`, con `.env` apuntando a `soho_db`:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

El primer comando aplica todas las migraciones pendientes en orden; el segundo actualiza los tipos del cliente. Si las tres primeras ya están aplicadas, solo se añadirá la de direcciones. `npm.cmd run build` también genera el cliente antes de compilar. No hace falta volver a cargar el catálogo ni restablecer la base de datos.

Los `CHECK` y las colaciones del correo y del identificador externo son SQL manual que debe conservarse al preparar cambios posteriores. Usar las migraciones del proyecto para aplicar la estructura completa. Las dos primeras migraciones permanecen intactas; el cambio de contraseña obligatoria a opcional se realiza en una tercera migración.

## Validación

La revisión utilizó una instancia temporal independiente de MySQL 8.0.46, con puerto y directorio propios:

1. Se aplicó el esquema inicial y se cargó un grafo con datos en las nueve tablas del catálogo.
2. Se aplicó la migración de usuarios sobre esos registros existentes.
3. Se compararon todos los campos originales antes y después, incluidos UUID, fechas, precios, fotografías, stock, reservas e historial. Permanecieron idénticos y la nueva referencia al responsable quedó vacía.
4. `test/esquema-usuarios.sql` aprobó 37 comprobaciones: roles, valores predeterminados, correos, hashes, duplicados, claves foráneas, fechas de sesiones y tokens y conservación de responsables.
5. En otra base temporal vacía, se aplicaron ambas migraciones, pasaron las 28 comprobaciones SQL anteriores del catálogo y las nueve pruebas de integración de Prisma y API existentes.

También pasaron `db:validate`, generación del cliente, compilación de producción, TypeScript completo, lint, 29 pruebas unitarias y tres HTTP e2e. La comparación entre la estructura aplicada y el esquema Prisma no detectó diferencias; las restricciones y la colación se verificaron mediante los casos SQL, ya que no se representan completamente en Prisma.

La ampliación Google se comprobó en otra instancia temporal de MySQL 8.0.46:

1. Se aplicó la tercera migración sobre datos existentes de las doce tablas anteriores. Todas sus filas se conservaron exactamente, incluidos hashes, roles, sesiones, tokens, fechas, precios, stock y responsables.
2. Pasaron las 28 comprobaciones de `test/esquema-identidades-externas.sql`: contraseña opcional, formato de hashes presentes, unicidad y sensibilidad a mayúsculas de `sub`, formato ASCII, claves foráneas y reutilización de sesiones.
3. También pasaron las 28 comprobaciones SQL del catálogo y las 37 de usuarios con el esquema ampliado: 93 comprobaciones SQL en total. Los scripts revirtieron sus filas.
4. En otra base vacía, `prisma migrate deploy` aplicó las tres migraciones y `prisma migrate diff` no detectó diferencias con el esquema. Las nueve pruebas de integración de Prisma y API pasaron sobre esa base.
5. Pasaron generación del cliente, compilación, TypeScript, lint, 29 pruebas unitarias y tres HTTP e2e. La instancia temporal se apagó y sus datos se eliminaron; `soho_db` no se utilizó en estas comprobaciones.

Para repetir las comprobaciones en una base exclusivamente de pruebas con las tres migraciones aplicadas:

```powershell
mysql --host=127.0.0.1 --port=3306 --user=USUARIO --password --default-character-set=utf8mb4 --database=soho_usuarios_test --execute="source test/esquema-usuarios.sql"
mysql --host=127.0.0.1 --port=3306 --user=USUARIO --password --default-character-set=utf8mb4 --database=soho_usuarios_test --execute="source test/esquema-identidades-externas.sql"
```

Cada script crea dos procedimientos auxiliares, revierte sus filas y elimina los procedimientos al terminar. No usar `--force`; si se interrumpe, preparar otra base de pruebas aislada antes de repetirlo. Los hashes y `sub` sintéticos solo prueban la estructura y nunca se cargan en la base de trabajo.

## Próxima implementación

El servicio de contraseñas y recuperación, Google y su vinculación, verificación de correo, edición de nombres y apellidos, registro de clientes, comando para crear administradores, inicio/cierre de sesión, protección global de rutas y autorización RBAC están implementados en [Autenticación y RBAC](autenticacion.md) y conectados a Angular. Ambos propósitos de `TokenUsuario` tienen su flujo específico, sin otra migración. La [agenda de direcciones](api-direcciones.md) también está integrada. Quedan cambio de correo, celular del perfil y persistencia de operaciones comerciales del panel.

## Referencias

- [Prisma 7: migraciones con SQL adicional](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations).
- [MySQL: restricciones CHECK](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html).
- [Google: claims de OpenID Connect](https://developers.google.com/identity/openid-connect/reference).
- [Google: validación de ID tokens y autoridad sobre el correo](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
