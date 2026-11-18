# Integración administrativa de recepciones

Implementada el 16 de noviembre de 2026, America/Lima. Continúa la [API de atención y correcciones](../../soho-backend/docs/api-atencion-recepciones.md) sin modificar su contrato, backend, Prisma, migraciones o cliente generado. Mantener `PAGOS_CHECKOUT_ACTIVO=false`: todavía faltan Configuración → Pagos y el recorrido de instrucciones/recepción/correcciones del checkout.

## Pantallas y navegación

- `/admin/recepciones`: bandeja real, búsqueda por referencia/pedido/cuenta/correo, cuatro estados, conteos globales, paginación y tamaño de página 20/50.
- `/admin/recepciones/:id`: condiciones originales, contacto/destinatario/dirección, siete distritos del backend, facturación, destino del pago mostrado, artículos, SKU, tallas, importes y plazo originales, comprobantes privados, diagnóstico e historial.
- Nuevo enlace **Recepciones** en el menú administrativo, con permiso ADMIN y señalización de datos reales. La cabecera utiliza el título de la nueva ruta.
- Búsqueda, estado, página y límite viven en la URL. Ir al detalle y volver conserva la consulta. Los pedidos creados enlazan a su detalle administrativo existente.

Se conserva la estructura, tipografía, paleta, iconos, controles y diálogos del panel SOHO. La bandeja pasa a tarjetas de datos en móvil. El detalle coloca el diagnóstico antes de los bloques largos en tableta/móvil; las imágenes históricas y pendientes se distinguen de la actual. No se agregan escenarios de demostración ni se usan sus datos como alternativa a la API.

## Lecturas y comprobantes

`RecepcionesAdministracionApi` consulta las seis rutas ADMIN existentes. Las lecturas se cancelan al cambiar de búsqueda, recepción, sesión o al salir. Un turno y la identidad vigente impiden incorporar respuestas antiguas. Ante 401/403 retira datos, conteos, imágenes y operaciones visibles; ninguna cuenta adquiere la recuperación de otra por tener rol ADMIN.

Los adaptadores validan UUID, estados, fechas, paginación, capacidades, versiones de comprobantes, totales y precios por línea. Mantienen dinero como texto decimal, las tallas/SKU y ceros iniciales del número de operación. Admiten hasta cien unidades del contrato compartido. Envío `0.00` se muestra como gratuito en importe, sin confundirlo con ausencia; plazo nulo se muestra como **No informado**. Los conteos proceden del resumen global del servidor, no de sumar la página cargada.

Las imágenes se solicitan como `Blob` a la ruta privada de la recepción y de su versión. Solo se admiten PNG/JPEG/WebP de hasta 5 MiB. El visor crea una URL local temporal y la revoca al cambiar de imagen, salir o perder acceso. No usa enlaces públicos ni persiste bytes en el navegador. Un fallo de imagen tiene su propio reintento. Una imagen histórica nunca habilita decisiones sobre el comprobante vigente.

Carga, vacío global, filtros sin resultados, página fuera de rango, 404, infraestructura, permisos y errores de imagen tienen estados explícitos. El fallo de una lectura posterior al éxito no convierte una decisión confirmada en fallida ni repite su escritura.

## Decisiones

**Registrar con condiciones originales** requiere la capacidad vigente, la imagen actual disponible, motivo interno y dos confirmaciones: conservar importes/plazo originales y registrar sin aprobar el pago. El cuerpo conserva versión/comprobante y no admite un carrito, destino o total alternativos. El servidor vuelve a comprobar cobertura y disponibilidad completa; un impedimento puede mantener atención sin crear pedido ni reservas parciales.

**Solicitar otra imagen** exige capacidad vigente, motivo interno, mensaje público y confirmación. Explica que corresponde a la misma transferencia y conserva importe, destino y número de operación. No crea pedido ni reserva unidades. El detalle separa el motivo administrativo del mensaje al comprador. La carga de la corrección por su propietario pertenece a la siguiente integración de checkout/seguimiento.

Un formulario sin enviar solicita confirmación al navegar fuera y protege la recarga. Una vez enviado, la solicitud es inmutable y se conserva por cuenta; navegar no cancela una decisión que el servidor podría estar confirmando. No hay nuevas decisiones sobre esa recepción mientras se desconoce el resultado.

## Recuperación

Antes del POST se guarda en `sessionStorage`, bajo la cuenta responsable, únicamente recepción, acción y cuerpo exacto con su UUID de solicitud. Incluye motivo/mensaje, sin imágenes, cookies, tokens, contacto o totales. Si no se puede guardar, no se envía. Un registro ilegible se conserva y bloquea nuevas decisiones, evitando reemplazarlo silenciosamente por otra clave.

Los intentos sobreviven a navegación y recarga de **esa pestaña** y se presentan como inciertos al restaurar. No se reenvían automáticamente. La bandeja enlaza los casos pendientes. El detalle permite:

1. **Consultar resultado**, mediante GET exclusivo del administrador responsable.
2. **Reenviar el mismo intento**, conservando exactamente acción, motivo/mensaje, versión, comprobante y clave.

Un 202 conserva el intento y respeta `Retry-After`. Un fallo de red/5xx, una respuesta incompatible o un GET 404 mantienen la incertidumbre. Un 400/404/409/413/422 definitivo del POST bloquea el reenvío de esa decisión y exige una lectura vigente antes de continuar. Los datos recuperados son históricos: nunca sustituyen directamente el detalle actual.

La confirmación permanece visible aunque falle la nueva consulta; se reintenta la lectura. Solo después de disponer de un detalle vigente puede cerrarse el intento para otra decisión. Cerrar o borrar el almacenamiento de la pestaña elimina esta copia local; la operación, sus evidencias y las protecciones contra duplicados permanecen en el servidor. Conviene conservar la clave mientras el resultado sea incierto.

## Validación

- **964 pruebas aprobadas en 143 archivos**, incluidas **41 nuevas** de adaptadores y servicio: permisos, cancelaciones, datos inválidos, cien unidades, identidad, versiones, escritura única, almacenamiento previo, 202, conflictos, 503/404, respuestas incompatibles, recarga y recuperación.
- TypeScript de aplicación/pruebas, compilación de producción y formato correctos. El análisis de los once archivos nuevos no detectó patrones de interfaz prohibidos.
- Chrome con Angular compilado, NestJS real y MySQL temporal exclusivo: ocho recorridos, treinta capturas y seis capturas finales a 1440/768/390 px, sin desbordamiento. Se revisaron visualmente bandeja, detalle y confirmación móvil.
- Se perdió deliberadamente la respuesta de un registro ya confirmado: tras navegar y recargar se recuperó por la misma clave. Resultado conjunto de las dos altas: dos pedidos, dos reservas completas y cero pagos aprobados. Se comprobaron solicitud/corrección, número `001234`, versiones históricas, filtros, fallos y separación entre dos ADMIN y un CLIENTE.
- Esquema con trece migraciones y 42 tablas en MySQL aislado; sin consultar `soho_db`, modificar `.env` real ni contactar proveedores reales. Backend y Prisma conservan sus hashes. Evidencia desde SOHO: `.checkout-review/recepciones-frontend/validacion.json`.

## Continuidad

La [integración de Configuración → Pagos](integracion-configuracion-pagos.md) ya está terminada: publicaciones versionadas, QR y recuperación. Sigue completar el nuevo checkout con métodos, instrucciones, recepción, procesamiento y correcciones, y verificar todo el recorrido antes de habilitar nuevas emisiones. Configuración → Tienda mantiene su circuito independiente.
