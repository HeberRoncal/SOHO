# Integración de Mis direcciones

Fecha: 13 de noviembre de 2026 (America/Lima).

`/mi-cuenta/direcciones` utiliza la [API de direcciones](../../soho-backend/docs/api-direcciones.md) y guarda en MySQL. Permite añadir, editar, eliminar y elegir una predeterminada; el resumen de Mi cuenta consulta también la agenda. Se requieren las cuatro migraciones del backend, que el usuario confirmó aplicadas localmente.

## Comportamiento

`DireccionesApi` utiliza `HttpClient` y el interceptor existente para cookies y CSRF. Envía exclusivamente los campos del formulario, sin propietario ni IDs en el cuerpo. Incluso `DELETE` lleva un cuerpo JSON vacío por el contrato de seguridad del backend. Después de cada escritura adopta la agenda completa confirmada por el servidor.

La pantalla distingue carga, agenda vacía y fallo de consulta. Incluye actualización manual, mensajes accesibles y bloqueo de acciones durante las escrituras. Un error de guardado conserva los campos; uno de borrado conserva el diálogo. Las escrituras no se repiten automáticamente, porque una respuesta perdida puede corresponder a una operación ya confirmada en la base.

El estado vive en memoria y se limpia al cerrar sesión, vencer la sesión o cambiar de usuario. Las respuestas anteriores a un cambio de cuenta no pueden restaurar direcciones; una lectura anterior tampoco sobrescribe una escritura más reciente. No se guardan direcciones en almacenamiento web.

La selección de distritos reutiliza las etiquetas del listado público de cobertura. Guardar una dirección no cotiza entrega ni confirma cobertura. El backend valida el formato del código, sin adoptar precios ni zonas de demostración como reglas comerciales. Desde el 14 de noviembre el [checkout permite seleccionar la agenda y cotiza el distrito](integracion-checkout.md), conservando la compra como invitado. Una carga tardía nunca aplica automáticamente una dirección sobre los datos escritos.

`CuentaDemostracion` conserva sus operaciones en memoria para las pruebas y el modo de demostración. La fachada `Cuenta` admite resultados asíncronos y espera las confirmaciones de la API real.

## Comprobaciones

Pasaron 423 pruebas de Angular, incluidas catorce nuevas de `DireccionesApi`, y la compilación de producción. Las nuevas pruebas comprueban contratos HTTP, CSRF, respuesta confirmada, errores sin repetición automática, respuestas malformadas y aislamiento ante cambios de sesión y lecturas tardías.

Diez recorridos con el frontend compilado, NestJS y MySQL 8.0.46 temporales comprobaron el formulario real, persistencia al recargar, doble envío, predeterminada, borrado hasta agenda vacía, conservación ante 503, cambio de cuenta, recuperación de carga y sesión vencida. Se comprobó la agenda a 1440 y 390 px sin errores JavaScript ni desbordamiento horizontal.

Evidencia: `.checkout-review/direcciones-api/` desde la raíz SOHO. La base local `soho_db` no se utilizó para las pruebas.
