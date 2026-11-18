# API de Mis direcciones

Fecha: 13 de noviembre de 2026 (America/Lima).

La agenda ya tiene persistencia en MySQL y está conectada al formulario Angular. El usuario confirmó aplicada la cuarta migración. Esta entrega utiliza ese esquema sin añadir migraciones ni datos iniciales a `soho_db`.

## Rutas

Todas las rutas requieren sesión activa. `ADMIN` y `CLIENTE` gestionan exclusivamente su propia agenda; el propietario se obtiene con `@UsuarioActual()`. Las respuestas llevan `Cache-Control: no-store`. Una dirección ajena y una inexistente reciben el mismo `404`.

| Método   | Ruta                                  | Respuesta correcta                |
| -------- | ------------------------------------- | --------------------------------- |
| `GET`    | `/api/direcciones`                    | `200`, `{ direcciones: [...] }`   |
| `GET`    | `/api/direcciones/:id`                | `200`, `{ direccion: {...} }`     |
| `POST`   | `/api/direcciones`                    | `201`, agenda completa confirmada |
| `PATCH`  | `/api/direcciones/:id`                | `200`, agenda completa confirmada |
| `PATCH`  | `/api/direcciones/:id/predeterminada` | `200`, agenda completa confirmada |
| `DELETE` | `/api/direcciones/:id`                | `200`, agenda completa confirmada |

Las escrituras requieren origen permitido, token CSRF y `application/json`, incluidos los borrados. Para seleccionar o borrar se envía `{}`. Los identificadores deben ser UUID v4.

## Datos y validación

Ejemplo de creación:

```json
{
  "etiqueta": "Casa",
  "destinatario": "Ana Pérez",
  "celular": "987654321",
  "distrito": "la-esperanza",
  "direccion": "Av. Perú 123",
  "referencia": "Puerta azul",
  "predeterminada": false
}
```

Son obligatorios etiqueta, destinatario, celular, distrito y dirección. La referencia omitida se guarda como cadena vacía y `predeterminada` omitida comienza en `false`; la primera dirección se marca automáticamente como predeterminada.

Los límites están en el [esquema](esquema-direcciones.md). El servidor recorta los extremos de los textos, cuenta caracteres Unicode, exige celular de nueve dígitos con `9` inicial y valida el formato del código de distrito. Rechaza controles y caracteres de formato; la referencia permite saltos de línea. No convierte números, nulos ni cadenas en booleanos. Rechaza campos ajenos al contrato, incluidos `id`, `usuarioId`, fechas y roles.

`PATCH /:id` admite un subconjunto no vacío de esos mismos campos. Omitir un campo conserva su valor. `referencia: ""` permite vaciarla. `predeterminada: false` conserva la dirección que ya es predeterminada: para cambiarla se selecciona otra de la agenda. La ruta `/:id/predeterminada` solo acepta un objeto vacío.

Las respuestas públicas contienen únicamente `id`, `etiqueta`, `destinatario`, `celular`, `distrito`, `direccion`, `referencia` y `predeterminada`. La lista coloca la predeterminada primero y ordena las demás por creación e ID.

## Transacciones y entrega

Todas las escrituras usan transacciones Prisma con aislamiento `ReadCommitted`. Antes de operar, el servicio bloquea la fila del usuario activo con `SELECT ... FOR UPDATE`, parametrizado mediante el tag de Prisma. Esto serializa las operaciones de la misma cuenta incluso con una agenda vacía.

- La primera creación queda predeterminada.
- Elegir otra desmarca la anterior y marca la nueva en una sola transacción.
- Borrar la predeterminada elige la restante más antigua, desempatada por ID.
- Borrar la última deja la agenda vacía.
- Los conflictos abortados `P2034` se reintentan hasta tres intentos en total. Un conflicto persistente o duplicado `P2002` devuelve `409` sin detalles SQL; el filtro global oculta otros errores Prisma con `503`.

El índice funcional de la cuarta migración protege además el máximo de una predeterminada por cuenta. El servicio conserva exactamente una cuando hay direcciones.

Guardar un código de distrito no garantiza existencia, cobertura ni tarifa. No se copian las reglas de entrega de demostración al backend. La conexión automática de la agenda al checkout y las reglas comerciales de entrega requieren otra entrega. La compra como invitado conserva su alcance actual de demostración.

## Generación y pruebas

Las piezas se generaron desde `soho-backend` con la CLI local:

```powershell
npx.cmd --no-install nest generate resource direcciones --type rest --crud
npx.cmd --no-install nest generate pipe direcciones/pipes/datos-direccion --no-spec
npx.cmd --no-install nest generate pipe direcciones/pipes/id-direccion --no-spec
```

Después se adaptaron DTO, selección pública, pipes, controlador, servicio y módulo a validación explícita, Prisma e importaciones ESM `.js`. No se incorporaron dependencias nuevas.

Pasaron **232 pruebas del backend**: 148 unitarias, nueve HTTP y 75 con MySQL temporal. Las diez nuevas pruebas con MySQL cubren CRUD, propiedad entre usuarios y administradores, CSRF, datos inválidos, desactivación y concurrencia. También pasaron compilación, TypeScript completo y lint.

Angular aprobó **423 pruebas** y compilación de producción. Diez recorridos en Chrome sin ventana comprobaron persistencia al recargar, bloqueo de doble envío, predeterminada, borrados, errores 503, recuperación de carga, cambio de cuenta y sesión vencida. La agenda se comprobó a 1440 y 390 px sin desbordamiento horizontal ni errores JavaScript. Toda escritura de prueba utilizó MySQL 8.0.46 temporal; no se escribió en `soho_db`.

Evidencia: `.checkout-review/direcciones-api/` desde la raíz SOHO. Las verificaciones anteriores del esquema permanecen en `.checkout-review/direcciones-esquema/`.

- [Integración Angular](../../soho-frontend/docs/integracion-direcciones.md).
- [MySQL: lecturas con bloqueo](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html).
