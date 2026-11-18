# Revisión del plan de correspondencia del catálogo

Fecha de lectura: 2026-11-15 08:02:15, America/Lima. Fuente: base local `soho_db`, MySQL 8.0.46.

La lectura real está completada y el manifiesto no presenta conflictos de identidad. Se puede continuar preparando el ejecutor de conversión y la adaptación coordinada de la aplicación. El plan todavía no se ha aplicado: esta entrega no cambia productos, SKU, inventario, imágenes ni historial en MySQL.

## Estado comprobado

- Las nueve migraciones están completadas en `_prisma_migrations`. El checksum de `20261115000000_expansion_productos_color` coincide con el archivo local.
- Hay 31 tablas de negocio. Las cinco tablas de la ampliación siguen vacías y no hay una conversión parcial.
- Hay 11 productos publicados, 14 colores y 168 variantes. No hay borradores ni archivados en esta instantánea.
- La propuesta crea 11 grupos y 14 fichas por color, conservando los once códigos internos originales y todos los UUID/SKU de las 168 variantes.
- El stock físico suma 720 unidades y el reservado cero. No hay déficit ni diferencias entre contadores y suma de reservas activas en esta instantánea. Se conservan las referencias de 144 movimientos de inventario.
- No hay artículos de pedidos en esta lectura. Por ello, la preservación de pedidos e imágenes históricas deberá comprobarse con datos sintéticos al probar el futuro ejecutor; no se presenta esta lectura como prueba de una conversión de pedidos reales.

## Correspondencia propuesta

El color principal conserva UUID, código y slug del producto original. Los otros colores reciben un UUID determinista, código desde el máximo existente y slug independiente. Todas las tallas del mismo color se mantienen en esa ficha y con sus precios actuales.

| Producto destino            | Código de origen | Código destino | Slug destino    | Variantes |
| --------------------------- | ---------------- | -------------- | --------------- | --------- |
| Nike Air Force 1 '07 Blanco | SHO-0001         | SHO-0001       | `af1`           | 12        |
| adidas Samba OG Blanco      | SHO-0002         | SHO-0002       | `samba`         | 12        |
| adidas Samba OG Negro       | SHO-0002         | SHO-0012       | `samba-negro`   | 12        |
| Converse Chuck 70 Hi Crema  | SHO-0003         | SHO-0003       | `chuck70`       | 12        |
| Converse Chuck 70 Hi Negro  | SHO-0003         | SHO-0013       | `chuck70-negro` | 12        |
| New Balance 990v6 Negro     | SHO-0004         | SHO-0004       | `nb990v6`       | 12        |
| Vans Skate Old Skool Negro  | SHO-0005         | SHO-0005       | `oldskool`      | 12        |
| Vans Skate Old Skool Azul   | SHO-0005         | SHO-0014       | `oldskool-azul` | 12        |
| Puma Suede Classic Negro    | SHO-0006         | SHO-0006       | `suede`         | 12        |
| Nike Pegasus Premium Gris   | SHO-0007         | SHO-0007       | `peg`           | 12        |
| adidas Ultraboost 5X Blanco | SHO-0008         | SHO-0008       | `ub5`           | 12        |
| adidas Ultraboost 1.0 Negro | SHO-0009         | SHO-0009       | `ub1`           | 12        |
| New Balance 990v5 Gris      | SHO-0010         | SHO-0010       | `nb990v5`       | 12        |
| Puma Suede XL Beige         | SHO-0011         | SHO-0011       | `suedexl`       | 12        |

Los únicos códigos adicionales propuestos son `SHO-0012` para Samba Negro, `SHO-0013` para Chuck 70 Negro y `SHO-0014` para Old Skool Azul. Todavía no están asignados en la base. El contador sigue vacío; al convertir deberá reservarse hasta 14 con la comprobación de vigencia correspondiente.

Los ejemplos anteriores del usuario con Air Force 1 `SHO-0012` y `SHO-0013` eran ilustrativos. En la base actual Air Force 1 Blanco conserva `SHO-0001` y no existe un Air Force 1 Negro que deba crearse por esta conversión. No se renumeran las fichas para hacerlas coincidir con aquellos ejemplos.

## SKU, precios y enlaces

Los 168 SKU actuales coinciden con los códigos de marca, modelo, color y talla de sus registros. Ninguno se regenera o corrige en el manifiesto. Las 168 variantes conservan talla, habilitación, existencias, reservas y fechas leídas; sus futuros productos se registran como destino separado, sin editar las FK actuales.

El precio y precio anterior de cada color se copian exactamente desde su producto de origen. El manifiesto distingue los alias explícitos del color y el alias sin selección. Por ejemplo, `samba?color=NG` deberá resolver a `samba-negro`, mientras `samba` conserva el Blanco. La adaptación futura deberá mantener talla y carrito por SKU.

## Fotografías y advertencia revisada

Las 17 asociaciones generales y 14 asociaciones por color contienen 17 rutas únicas. Todas existen bajo `soho-frontend/public`; no se consultaron servicios remotos. El reparto genera 18 asociaciones de galería, mantiene esas mismas 17 rutas y no supera ocho fotos en ninguna ficha.

Hay una advertencia: `/imagenes/campanas/hero-vans.jpg` es una foto de campaña que actualmente se muestra tanto en Old Skool Negro como en Azul. Se inspeccionó visualmente y se conserva en el plan como imagen de ambientación compartida, conforme al funcionamiento actual. Las vistas de cada color siguen siendo `vans_os.png` para Negro y `vans_navy.png` para Azul. No se atribuye la imagen de campaña exclusivamente a un código de color a partir de la fotografía.

Las galerías de ambos colores tendrán asociaciones y archivos heredados con UUID diferentes aunque compartan esa URL. La conversión deberá representarlos como `LEGADO`; esta revisión no ha subido imágenes a Cloudinary ni inventado sus identificadores externos. La advertencia queda visible para la edición posterior de galerías y no implica pérdida de fotos o colisión de identidades.

## Método y evidencia

Se utilizó una conexión independiente, sesión con transacciones de solo lectura y una instantánea consistente `REPEATABLE READ`. La sesión confirmó `@@transaction_read_only = 1`. Las consultas de datos fueron exclusivamente `SELECT`; se cerró la transacción con `ROLLBACK` y se cerró la conexión. No se arrancó NestJS, sus trabajadores o un seed, ni se leyeron clientes, contactos, sesiones o comprobantes privados.

Se ejecutó la clase de planificación existente, compilada desde su fuente mediante TypeScript en el directorio local de evidencia. Se verificaron identidades, cantidades, precios, aliases, unicidad de asociaciones de imágenes y conservación de todas las rutas. Las huellas de 711 archivos de esquema, migraciones y fuentes de backend/frontend permanecen iguales. No se creó una décima migración.

Evidencia local desde la raíz SOHO: `.checkout-review/productos-correspondencia-real/lectura-1794747735084/`. Incluye instantánea de catálogo, plan completo, resumen, consultas, metadatos de migraciones y controles de conservación. No contiene la conexión ni credenciales de `.env`.

Huella del origen: `1273816d5963668e333ed0c58eb846c9e5574d7a69a44e4875c8ce8e3020e072`.

Esta huella corresponde al catálogo leído en la fecha indicada. Antes de aplicar una futura conversión se debe obtener nuevamente una instantánea bajo el procedimiento de mantenimiento y comparar la vigencia; este informe no garantiza que no haya cambios posteriores de la aplicación.

## Implementación posterior

La [conversión y adaptación](conversion-productos-color.md) ya están preparadas y probadas en bases aisladas. Para ejecutar se utiliza el manifiesto de despliegue indicado en esa guía, generado con el lector Prisma compartido: mantiene esta correspondencia y normaliza la representación de fechas respecto de la lectura SQL directa. Los archivos y la huella de esta revisión se conservan como evidencia histórica.

## Alcance previsto desde esta revisión

Preparar y probar en MySQL aislado el ejecutor de conversión que utilice un manifiesto revisado. La implementación debe coordinar las nuevas lecturas del catálogo, consulta administrativa, checkout y Angular antes de retirar dependencias de las tablas anteriores. Debe incluir pedidos con reservas activas/aprobadas, imágenes históricas, reintentos, cambio de precios y conflicto de vigencia, además de una restauración probada.

La aplicación real del manifiesto será otro paso de despliegue. Crear/editar productos con Cloudinary, movimientos manuales y cambios de cobertura no se habilitan mediante esta lectura.
