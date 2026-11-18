# Configuración e Inicio sin estado antiguo de demostración

18 de noviembre de 2026, America/Lima.

## Configuración

Se eliminaron `configuracion-estado.ts` y el servicio `ConfiguracionEstado`, incluidos valores ilustrativos, borrador conjunto, validación duplicada, guardado en memoria y registro ficticio de acciones. Ninguna de las cuatro secciones operativas utilizaba ese servicio para sus consultas o escrituras reales.

El contenedor `Configuracion` mantiene las cuatro pestañas visibles, el outlet y el desplazamiento de la pestaña activa. Se retiraron sus avisos, mensaje y barra global de guardado de demostración. Pagos, Envíos, Inventario y Tienda conservan sus barras, mensajes, descartes y servicios propios. Los estilos compartidos `config-savebar`, `config-status` y `config-mensaje` siguen disponibles porque los utilizan esos formularios; solo se retiró la regla del aviso obsoleto.

La guarda `canDeactivate` del contenedor y su listener global de recarga se retiraron junto con el borrador que protegían. Se conservaron las cuatro guardas de los formularios reales y sus listeners de `beforeunload`. Cada sección sigue decidiendo si permite salir durante una operación o con cambios pendientes. Administradores conserva su ruta informativa y permanece fuera de las pestañas; esta entrega no implementa gestión de otras cuentas.

## Panel compartido de la tienda

`PanelDemostracion` ya contenía el menú móvil y las ventanas informativas. Se trasladó a `estructuras/componentes/panel-tienda/` y se renombraron clase, selector, plantilla, CSS, prueba e import del contenedor público como `PanelTienda`. Conserva `PresentacionTienda`, categorías, enlaces a Cuenta/Favoritos/Carrito y cierre del diálogo y al navegar. Se retiraron dos reglas de CSS que ya no tenían elementos en su plantilla.

La ayuda del footer dejó de presentar los pagos y las tallas como una demostración. Describe las instrucciones de compra, la revisión manual del abono y el sistema EU de las fichas. El texto sobre cambios y devoluciones remite al equipo SOHO para consultar sus condiciones; no inventa una política ni integra el módulo pendiente de posventa.

## Pruebas y evidencia

- 1159 pruebas Angular en 151 archivos, tipos de aplicación/pruebas y compilación de producción. Se eliminaron nueve pruebas exclusivas del simulador retirado y se añadieron dos comprobaciones de integración de navegación y paneles; las restantes pruebas reales se conservan.
- Las tres comprobaciones de Inventario que antes creaban un borrador del simulador ahora cargan `ConfiguracionPagosApi` con HTTP de pruebas. Verifican que guardar reservas conserva el borrador real de Pagos.
- La prueba de rutas utiliza la configuración vigente y los componentes reales de Tienda e Inventario: cancelar una salida conserva los campos, aceptar permite cambiar de sección, solo se pide una confirmación por intento y la recarga se protege únicamente mientras existe un formulario pendiente.
- Chrome completó 21 comprobaciones a 1440/390 px: carga y guardado de los cuatro apartados, protección de cambios y recarga, una sola barra por formulario, siete distritos, gratuidad de La Esperanza, confirmación/versiones de reservas, recarga del contacto guardado, error/reintento, menú móvil con Escape y navegación, y tres paneles de ayuda. No hubo excepciones JavaScript ni desbordamiento horizontal.
- Todas las solicitudes `/api/*` del navegador se interceptaron, incluidas ocho escrituras. No se realizaron consultas ni escrituras reales como alternativa. Las capturas y respuestas son datos controlados de prueba.
- El grafo de imports, incluidas rutas diferidas, alcanza 198 archivos desde `src/main.ts`, sin fixtures. Configuración y el panel compartido no dependen de ejemplos. Las cuatro guardas de formularios permanecen y el estado antiguo y los archivos del panel anterior ya no existen.

Evidencia desde la raíz SOHO: `.checkout-review/limpieza-configuracion-inicio/dependencias.json`, `navegador.json`, scripts y capturas. La compilación y la prueba del footer se repitieron tras actualizar los textos de ayuda.

No se modificaron backend ejecutable, Prisma, migraciones, seeds, datos de MySQL ni archivos externos. Los componentes antiguos del checkout fuera del arranque quedan para revisión posterior. Cambios y devoluciones continúa oculto y pendiente de integración; sus ejemplos no forman parte de la fuente de estos formularios.
