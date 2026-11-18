# API pública del catálogo

La API consulta MySQL mediante `CatalogoModule`, `CatalogoService` y `PrismaService`. Estas rutas son de lectura; no realizan escrituras ni reservan inventario. El esquema y la migración existentes se conservan.

## Organización

```text
src/catalogo/
├── catalogo.module.ts
├── catalogo.controller.ts
├── catalogo.service.ts
├── dto/
│   ├── consulta-catalogo.dto.ts
│   ├── consulta-catalogo.dto.spec.ts
│   └── producto-publico.dto.ts
└── filtros/
    ├── error-catalogo.filter.ts
    └── error-catalogo.filter.spec.ts
```

Los DTO reúnen la validación de consultas y la selección y transformación de productos públicos. `ErrorCatalogoFilter` convierte errores de persistencia en respuestas 503 sin exponer SQL ni credenciales. El controlador lo aplica mediante `@UseFilters`; los errores de validación y de producto inexistente conservan sus respuestas 400 y 404.

El filtro y su prueba se crearon desde `soho-backend` con el generador local de NestJS:

```powershell
npx.cmd --no-install nest generate filter catalogo/filtros/error-catalogo --flat
```

Después se trasladó la implementación que estaba dentro del controlador y se adaptó la prueba generada para comprobar los errores de Prisma y la protección de detalles internos. Los DTO existentes se reubicaron con sus pruebas e importaciones. Esta organización conserva las rutas, respuestas y consultas de Prisma y no requiere otra migración.

## Rutas

| Método y ruta               | Respuesta                                                                       |
| --------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/productos`        | Productos y paginación                                                          |
| `GET /api/productos/:slug`  | Detalle de un producto publicado                                                |
| `GET /api/marcas`           | Marcas activas con productos públicos                                           |
| `GET /api/categorias`       | Categorías activas con productos públicos                                       |
| `GET /api/catalogo/filtros` | Marcas, categorías, colores, tallas, límites de precio y categorías por sección |

El endpoint inicial `GET /` continúa disponible. No se añade un prefijo global que cambie esa ruta.

## Consulta de productos

```http
GET /api/productos?marca=Nike&genero=Hombre&talla=40&orden=precio-ascendente&pagina=1&limite=12
```

| Parámetro              | Valores y límites                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `busqueda`             | Texto de hasta 120 caracteres; busca nombre, modelo, marca o categoría                         |
| `marca`                | Nombre, slug o código; puede repetirse                                                         |
| `categoria`            | Nombre o slug; puede repetirse                                                                 |
| `genero`               | `Hombre`, `Mujer`, `Unisex`; puede repetirse                                                   |
| `color`                | Código de dos letras mayúsculas, por ejemplo `BL`; puede repetirse                             |
| `talla`                | EU 35 a 48, en pasos de 0.5; puede repetirse                                                   |
| `desde`, `hasta`       | Soles entre 0 y 999999.99, hasta dos decimales                                                 |
| `novedades`, `ofertas` | `0` o `1`                                                                                      |
| `orden`                | `relevancia`, `precio-ascendente`, `precio-descendente`, `novedades`                           |
| `pagina`               | Entero de 1 a 10000; predeterminado 1                                                          |
| `limite`               | Entero de 1 a 100; predeterminado 12                                                           |
| `slug`, `sku`          | Identificadores repetidos, hasta 100, para recuperar favoritos o productos de un carrito local |

Los filtros de una misma lista se combinan con OR; las distintas dimensiones se combinan con AND. Los filtros ordinarios admiten hasta 20 valores por dimensión, sin duplicados después de recortar espacios. Se rechazan objetos anidados, repeticiones en campos escalares, parámetros desconocidos y rangos invertidos. La consulta usa parámetros Prisma; el texto de búsqueda se trata como texto literal, incluidos `%` y `_`.

Hombre y Mujer incluyen los productos Unisex. Unisex por sí solo devuelve únicamente Unisex. Un producto y sus variantes no se duplican al combinar géneros.

Color y talla deben coincidir dentro de una misma variante habilitada cuyo stock físico sea mayor que sus reservas. Esto también se exige cuando se filtra solo por color o solo por talla. El listado general puede mostrar productos agotados que conserven variantes habilitadas.

Las ofertas se calculan comparando `precioAnterior > precio` en MySQL. El orden de novedades prioriza el indicador existente `esNovedad`; no inventa una fecha comercial de lanzamiento. Relevancia usa `ordenCatalogo`. Todos los órdenes terminan en `id` para resolver empates y mantener una paginación estable.

## Respuestas

El listado tiene esta estructura:

```json
{
  "productos": [],
  "paginacion": {
    "pagina": 1,
    "limite": 12,
    "total": 0,
    "paginas": 0
  }
}
```

`total` y los productos de una página se consultan dentro de la misma transacción con aislamiento `RepeatableRead`. Una página posterior a la última devuelve una lista vacía y conserva el total y el número de páginas; Angular corrige esa situación hacia la última página válida. Sin coincidencias, `paginas` es cero.

Cada producto incluye `id`, `slug`, `nombre`, `marca`, `categoria`, `modelo`, `codigoModelo`, `descripcion`, `genero`, `precio`, `precioAnterior`, `esNovedad`, `imagenes`, `colores` y `variantes`. El detalle usa el mismo formato que cada producto del listado. Las galerías y colores conservan su orden administrativo.

Los precios se envían como cadenas con dos decimales, por ejemplo `"529.90"`. El precio anterior puede ser `null`. Cada variante incluye `id`, `sku`, `codigoColor`, `talla` como cadena, `sistemaTallas`, `habilitada` y `disponible`.

`disponible` se calcula en el servidor como `max(0, existencias − reservas)` y es cero cuando la variante está deshabilitada. La respuesta no expone existencias físicas, contadores de reservas, códigos internos administrativos ni movimientos. La disponibilidad devuelta es informativa; la creación futura de pedidos deberá volver a validarla.

Solo se consultan productos publicados con precio, modelo y código de modelo, marca y categoría activas, al menos una imagen general y alguna variante habilitada. Un producto que no cumpla esos requisitos queda fuera del listado y tampoco se publica por su URL directa.

`/api/catalogo/filtros` incluye las categorías de cada sección: `zapatillas`, `zapatillas-hombre`, `zapatillas-mujer`, `zapatillas-unisex`, `zapatillas-novedades` y `zapatillas-ofertas`. Estas opciones se obtienen de todo el catálogo público y no de la página de resultados actual.

## Errores

- `400`: parámetros no admitidos o inválidos, con mensaje de validación.
- `404`: slug desconocido, inválido o producto fuera del catálogo público.
- `503`: error de Prisma al consultar la base de datos, con mensaje de reintento y sin detalles SQL.

## Integración con Angular

Angular utiliza `CatalogoApi` mediante `FUENTE_CATALOGO`. El listado solicita al servidor los filtros y la página de la URL; el detalle solicita su slug. Las consultas anteriores se cancelan con `switchMap` y no hay respaldo automático con los datos de demostración si falla la red.

El adaptador de respuesta conserva el slug como identificador de navegación, los SKU existentes y los modelos de presentación. Convierte el precio a número para los componentes actuales y representa el disponible recibido como existencias locales con reservas cero, evitando descontarlas dos veces.

Menú, filtros, escaparates, favoritos y carrito local comparten el almacén reactivo del catálogo público. Hay una precarga inicial limitada a 100 productos para los escaparates; no se recorren todas las páginas para descargar el catálogo. La búsqueda del catálogo y su paginación siempre se resuelven en el servidor. Favoritos y carrito pueden recuperar productos que no estén en la precarga por slug o SKU en lotes de hasta 100. Los relacionados se componen del catálogo ya cargado en memoria.

En desarrollo, `soho-frontend/proxy.conf.json` envía `/api/**` a `http://127.0.0.1:3000`. En producción, servir las rutas `/api` desde NestJS bajo el mismo origen antes de aplicar la redirección SPA hacia `index.html`. El navegador no recibe `DATABASE_URL` ni credenciales MySQL.

## Verificación de la entrega

La reorganización en `dto/` y `filtros/` pasó compilación, TypeScript, lint, formato y 196 pruebas del backend: 122 unitarias, nueve HTTP y 65 con MySQL temporal. Las tres pruebas del filtro generado comprueban que errores conocidos, desconocidos y de inicialización de Prisma producen una respuesta 503 sin revelar detalles internos. También se comprobaron las rutas públicas del servidor compilado y las respuestas 400 y 404. La evidencia y la salida de Nest CLI están en `.checkout-review/catalogo-carpetas/`, desde la raíz SOHO. No se modificó `soho_db`.

La integración original del catálogo registró estas comprobaciones:

- Backend: 29 pruebas unitarias, tres HTTP e2e sin base de datos y nueve pruebas con MySQL real aislado.
- Frontend: 325 pruebas en 94 archivos, incluyendo cancelación HTTP, parámetros, estados de carga/error/vacío, reintento, paginación y disponibilidad compartida con el carrito.
- Compilaciones de producción de ambos proyectos, TypeScript, lint del backend y formato de los archivos modificados.
- Chrome sin interfaz visible a 1440 y 390 px: catálogo, filtros y orden, URL, detalle por SKU, carrito después de recargar, producto inexistente, vacío, carga lenta y recuperación de un 503 controlado. La paginación se recorrió con datos reales y límite cuatro mediante interceptación de la solicitud, sin modificar la base de trabajo.

La revisión renderizada no registró excepciones JavaScript, imágenes rotas ni desbordamiento horizontal. El detector estático de diseño emitió una advertencia de imagen por el binding Angular `[src]` de Marcas; la imagen tiene origen dinámico y se renderiza solo cuando existe logotipo. No acredita lector de pantalla ni dispositivo físico.

Las evidencias locales se conservan en `../.checkout-review/api-catalogo/`, fuera de los repositorios. La revisión utilizó la base de trabajo únicamente para lecturas; las pruebas que alteran publicación, stock o reservas se ejecutaron en otra instancia MySQL con puerto y directorio propios.

La administración y el checkout continúan siendo demostraciones. Esta entrega no habilita autenticación, cobros, pedidos ni reservas reales.

## Referencias

- [Prisma 7: referencia de consultas y comparación de columnas](https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference).
- [Angular: solicitudes y cancelación HTTP](https://angular.dev/guide/http/making-requests).
- [NestJS: controladores](https://docs.nestjs.com/controllers).
