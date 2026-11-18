# Primer lote de retirada de simulación

18 de noviembre de 2026, America/Lima.

Se retiraron las implementaciones sustituidas por API reales:

- Cuenta: `cuenta-demostracion.ts`, `clave-demostracion.ts` y la suite exclusiva de la cuenta en memoria. El guard ahora se comprueba con `CuentaApi` y HTTP de pruebas: sesión válida, ausencia de sesión y fallo recuperable.
- Clientes: `clientes-administracion.ts`, `clientes-admin-demo.ts` y las pruebas exclusivas del servicio antiguo. Se conservan las suites de consultas API, contratos y pantallas remotas.
- Carrito: `carrito-demostracion.ts`. Sus importadores de pruebas apuntan directamente a `CarritoLocal`; su suite se llama `carrito-local.spec.ts`. La aplicación sigue proporcionando `CarritoPersistente`.
- Checkout: `finalizar-compra.ts`, su HTML, su CSS y la prueba de renderizado del componente antiguo. La ruta conserva `CheckoutCompra`.

Los estilos del flujo actual están en `checkout-estructura.css` y `checkout-compra.css`, compartidos por CheckoutCompra y RecepcionCompra. Conservan el contenido y orden de las reglas previas, sin aumentar los presupuestos de compilación ni depender de archivos del checkout retirado.

Las doce pruebas de `checkout-api.spec.ts` ahora ejercitan CheckoutCompra con CoberturaApi: compra invitada, total pendiente, dirección elegida, contacto y facturación, agenda tardía, pérdida de sesión, zona sin cobertura, cambio de tarifa, recuperación de errores y doble envío. Los casos del registro antiguo se sustituyeron por comprobaciones de la preparación enviada a CheckoutPagosApi.

El servicio de pedidos de demostración pertenece a otro lote; sus pruebas usan un perfil controlado localmente dentro del test, sin cargar ni recrear una implementación de cuenta de demostración.

Verificación: 1162 pruebas en 151 archivos, tipos de aplicación y pruebas, producción Angular y cuatro vistas Chrome (Datos/envío y Pago a 1440/390 px). Las medidas, distribución, padding y tipografía inspeccionadas coinciden con la referencia previa y no hay desbordes ni excepciones JavaScript. Evidencia: `.checkout-review/limpieza-simulacion-lote1/` desde la raíz SOHO. El navegador solo consultó las API y utilizó un carrito invitado; no registró compras.

No se modifican API, Prisma, migraciones ni datos de la base. Permanecen pendientes de separar las dependencias de demostración de Catálogo, Productos, Pagos, Pedidos, Cobertura y Configuración; Cambios y devoluciones sigue oculto y fuera de este lote. Los fixtures de pruebas se conservan.
