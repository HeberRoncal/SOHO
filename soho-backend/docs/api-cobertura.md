# API de cobertura y configuración de Envíos

Fecha: 13 de noviembre de 2026 (America/Lima).

La API utiliza las siete filas de `zonas_entrega` creadas por la quinta migración, que el usuario confirmó aplicada en su base local. Administración → Configuración → Envíos ya consulta y guarda tarifas, plazos y habilitación en MySQL. Esta entrega reutiliza el esquema existente, sin otra migración.

## Rutas

| Método  | Ruta                                | Acceso                                  | Respuesta correcta                                          |
| ------- | ----------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `GET`   | `/api/cobertura`                    | Público                                 | `200`, `{ zonas: [...] }`                                   |
| `GET`   | `/api/cobertura/:codigo/cotizacion` | Público                                 | `200`, `{ cotizacion: {...} }`                              |
| `GET`   | `/api/admin/cobertura`              | `ADMIN` activo                          | `200`, `{ zonas: [...], version: "..." }`                   |
| `PATCH` | `/api/admin/cobertura`              | `ADMIN` activo, CSRF y origen permitido | `200`, configuración completa confirmada y su nueva versión |

Las respuestas correctas llevan `Cache-Control: no-store`. Las escrituras requieren `application/json`, cookie de sesión y token CSRF. `CLIENTE` recibe `403` en las rutas administrativas; una petición sin sesión recibe `401`. El rol se comprueba con los guards existentes y no se acepta desde el cuerpo.

La API configura los siete distritos existentes. Sus nombres, códigos, IDs y orden permanecen estables. La deshabilitación se realiza mediante el campo `habilitada`, conservando la fila y las direcciones guardadas.

## Representación pública y cotización

Cada zona pública contiene `codigo`, `nombre`, `tarifa`, `plazo`, `habilitada`, `orden` y `cotizable`. `tarifa` se entrega como cadena decimal con dos posiciones o `null`; el plazo pendiente también es `null`. La lista conserva las zonas deshabilitadas o con tarifa pendiente para distinguir sus estados. No incluye UUID internos ni fechas.

Una zona es cotizable si está habilitada y su tarifa está definida. Cero significa envío gratuito confirmado; `null` nunca se transforma en cero. La Esperanza conserva la tarifa `"0.00"`, sin monto mínimo.

Ejemplo de respuesta para La Esperanza:

```json
{
  "cotizacion": {
    "distrito": "la-esperanza",
    "nombreDistrito": "La Esperanza",
    "costo": "0.00",
    "plazo": null,
    "moneda": "PEN"
  }
}
```

La cotización devuelve `422` con código `COBERTURA_DESHABILITADA` cuando la zona está deshabilitada y `COBERTURA_TARIFA_PENDIENTE` cuando falta su tarifa. Un distrito desconocido recibe `404`; un código mal formado recibe `400`. La cotización puede consultarse como invitado.

El checkout utiliza estas rutas públicas para cargar distritos y confirmar el costo al seleccionar, antes del pago y antes del registro local. Las tarifas guardadas en Administración se reflejan en esas consultas; una modificación exige revisar antes de confirmar. Consulta [Integración del checkout](../../soho-frontend/docs/integracion-checkout.md). Los pedidos y pagos continúan en demostración.

## Guardado administrativo

Desde el 17 de noviembre de 2026, una zona debe estar deshabilitada en la configuración vigente antes de cambiar su tarifa o plazo. Cambiar los datos y deshabilitarla en el mismo PATCH recibe `409`. Primero se guarda la deshabilitación conservando tarifa/plazo; posteriormente se editan y se puede volver a habilitar con los valores nuevos. Esta validación se realiza con las siete filas bloqueadas y antes de modificar ninguna. La Esperanza mantiene tarifa cero. No cambian el contrato ni las migraciones.

El `GET` administrativo devuelve una versión opaca de 64 caracteres hexadecimales. El guardado debe enviar esa versión y exactamente los siete distritos, sin repetirlos. Cada elemento admite únicamente:

```json
{
  "codigo": "trujillo",
  "tarifa": "7.25",
  "plazo": "Dos días hábiles",
  "habilitada": true
}
```

El importe anterior es un ejemplo de contrato, no una tarifa comercial cargada. El cuerpo completo tiene la forma `{ "version": "<versión del GET>", "zonas": [<las siete configuraciones>] }`.

- `tarifa` exige una cadena decimal entre cero y `999999.99`, con hasta dos decimales, o `null` para dejarla pendiente. No admite números JSON, exponentes, signos negativos ni redondeo implícito de decimales adicionales.
- La Esperanza solo admite `"0.00"` y equivalentes decimales de cero; no admite `null`.
- `plazo` admite texto de hasta 80 caracteres Unicode, sin controles ni caracteres de formato, o `null`. El servidor recorta extremos y convierte un texto vacío en `null`.
- `habilitada` exige un booleano real. Puede permanecer en `true` con tarifa pendiente; esa zona todavía no puede cotizarse.
- Se rechazan atributos ajenos al contrato, nombres, identificadores internos, fechas, roles, códigos desconocidos, duplicados o listas incompletas.

El servicio bloquea las siete filas dentro de una transacción Prisma `ReadCommitted`, compara la versión y guarda únicamente las filas modificadas. Los cambios se confirman juntos. La versión se calcula sobre los campos públicos y las fechas de actualización; un guardado con una versión anterior recibe `409` y conserva la configuración vigente. Dos guardados simultáneos distintos con la misma versión no pueden sobrescribirse silenciosamente. Los conflictos abortados `P2034` también responden `409`, y el filtro global oculta los demás errores Prisma con `503`.

## Generación

Las nuevas piezas se generaron desde `soho-backend` con la CLI local, antes de adaptar Prisma, validación, RBAC e importaciones ESM `.js`:

```powershell
npx.cmd --no-install nest generate module cobertura
npx.cmd --no-install nest generate controller cobertura --no-spec
npx.cmd --no-install nest generate controller cobertura/administracion --flat --no-spec
npx.cmd --no-install nest generate service cobertura
npx.cmd --no-install nest generate class cobertura/dto/actualizar-cobertura.dto --no-spec
npx.cmd --no-install nest generate pipe cobertura/pipes/datos-cobertura --flat --no-spec
npx.cmd --no-install nest generate pipe cobertura/pipes/codigo-zona --flat --no-spec
```

Se eligieron generadores de módulo, controladores y servicio para el alcance de consulta y actualización de configuración existente. No se añadieron dependencias ni se alteró el cliente Prisma manualmente.

## Validación

La evidencia está en `.checkout-review/cobertura-api/` desde la raíz SOHO. Las pruebas utilizan MySQL 8.0.46 temporal, con sus cinco migraciones. No escriben en `soho_db`, no envían correo externo y no modifican la configuración SMTP real.

- Pasaron 179 pruebas unitarias, nueve HTTP y 86 con MySQL: **274 pruebas del backend**.
- Las once nuevas pruebas con MySQL cubren listado y cotización como invitado, `ADMIN`, propiedad del contrato, CSRF y JSON, zonas pendientes o deshabilitadas, importes exactos, guardado conjunto, versiones antiguas, concurrencia y ocultación de errores.
- También pasaron compilación de producción, TypeScript completo y lint. El esquema y las cinco migraciones se conservan.
- Angular aprobó 443 pruebas, incluidas veinte nuevas de Envíos, compilación de producción y TypeScript de pruebas.
- Doce recorridos de navegador comprobaron guardado real y recarga, error en campos y foco, doble envío, conflictos, 503, cambios sin guardar y sesión vencida. Las capturas se revisaron a 1440, 768 y 390 px, sin desbordamiento horizontal ni errores JavaScript. El detector estático de la pantalla no encontró incidencias.

Las 180 comprobaciones SQL del esquema pertenecen a la etapa anterior y no se repitieron como parte de esta integración. Su evidencia permanece en `.checkout-review/cobertura-esquema/`.

- [Esquema de cobertura](esquema-cobertura.md).
- [Integración Angular de Envíos](../../soho-frontend/docs/integracion-envios.md).
- [MySQL: lecturas con bloqueo](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html).
