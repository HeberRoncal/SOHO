# Retirada de PagoPedido y promociones locales del resumen

18 de noviembre de 2026, America/Lima.

## Cambios

Se retiraron el componente antiguo `PagoPedido`, su plantilla, los CSS `pago-pedido.css`/`pago-comprobante.css` y su prueba exclusiva de renderizado. No tenía consumidores de aplicación. El checkout actual sigue utilizando `InstruccionesCompra` e `ImagenComprobante`.

`ResumenCheckout` conserva sus productos, subtotal, envío pendiente/gratuito, resumen desplegable de móvil e importes históricos. Se retiraron el formulario de cupón, la aplicación y eliminación locales de promociones, el evento `cuponCambiado`, el indicador `editable` sin consumidores y sus estilos exclusivos. También se retiró el indicador `tarifaReal` del resumen y su aviso de tarifa ilustrativa, junto con las dos vinculaciones de los consumidores reales.

Un resumen de checkout no calcula descuentos a partir de un código. En un pedido confirmado, utiliza `descuentoConfirmado` y `totalConfirmado` recibidos de la API, incluido un total cero. El descuento se identifica sin deducir un porcentaje del nombre del cupón. El campo opcional del código permanece como texto histórico de solo lectura cuando el pedido ya está confirmado; no activa promociones.

La función ilustrativa que todavía usan las pruebas del servicio de pedidos antiguo pasó de `finalizar-compra/modelos/cupon-checkout.ts` a `pedidos/pruebas/descuento.fixture.ts`, con el nombre `descuentoPrueba`. No se importa desde la aplicación. Los ejemplos de posventa y la prueba que verifica el rechazo de cupones en la API conservan sus referencias ilustrativas.

## Conservación y verificación

- 1162 pruebas Angular en 151 archivos, tipos de aplicación y pruebas y compilación de producción. Se retiró una prueba del componente eliminado y se añadieron cuatro de importes y presentación del resumen; previamente pasaron 212 pruebas de checkout/pedidos.
- Las pruebas comprueban que un código ilustrativo no calcula descuentos, que un descuento histórico de S/ 7.25 no se presenta como 10 %, que el total de servidor prevalece, que cero se conserva y que el envío pendiente o gratuito mantiene su comportamiento.
- Las huellas SHA-256 confirman intactos 14 archivos del flujo vigente: lógica de CheckoutCompra, sus dos CSS compartidos, RecepcionCompra y los componentes DatosEntrega, InstruccionesCompra e ImagenComprobante con sus plantillas y estilos.
- El grafo de imports, incluidas rutas diferidas, alcanza 197 archivos desde `src/main.ts`, sin fixtures. El resumen no depende de promociones locales ni ejemplos y los archivos antiguos ya no existen.
- Chrome completó doce comprobaciones a 1440/390 px: datos de entrega y total pendiente, cotización gratuita, instrucciones verificadas y resumen móvil, recepción privada, descuento histórico de S/ 7.25 con total S/ 198.73, total histórico cero y error de consulta sin datos locales de reserva. No hubo excepciones JavaScript ni desbordamiento horizontal.
- Todas las solicitudes `/api/*` del navegador se interceptaron, incluidas dos emisiones de instrucciones. No se crearon pedidos o recepciones reales ni se enviaron imágenes a un proveedor externo.

Evidencia desde la raíz SOHO: `.checkout-review/limpieza-checkout-restos/dependencias.json`, `archivos-preservados.json`, `navegador.json`, scripts y capturas. No se modificaron backend ejecutable, Prisma, migraciones, seeds ni datos de MySQL. Cambios y devoluciones sigue oculto y pendiente de integración.
