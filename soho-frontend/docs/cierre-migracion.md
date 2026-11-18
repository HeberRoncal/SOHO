# Cierre de la migración de interfaces

Fecha: 13 de noviembre de 2026 (America/Lima).

Esta entrega conserva en Git las interfaces migradas desde Genspark a Angular y sus recorridos de demostración. Es la base para comenzar la integración con NestJS y MySQL.

## Alcance incluido

- Tienda: inicio, navegación, catálogo y filtros, detalle y variantes, favoritos, carrito, finalizar compra y seguimiento de pedidos.
- Cuenta: acceso, registro, recuperación, perfil, direcciones e historial de demostración.
- Administración: dashboard, productos e inventario, pedidos, preparación y envíos, cancelaciones, revisión de pagos, clientes, cambios y devoluciones y configuración.
- Componentes compartidos, modelos, servicios de demostración, rutas y pruebas automatizadas.
- Imágenes y fuentes locales, incluidas las licencias de Archivo y Geist.

## Validación de cierre

Ejecutar desde `soho-frontend`:

```powershell
npm.cmd run build
npm.cmd test -- --watch=false
git diff --cached --check
```

Resultados del cierre:

| Comprobación                    | Resultado                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Compilación de producción       | Aprobada, sin advertencias                                                        |
| Tamaño inicial de la aplicación | 317,16 kB; transferencia estimada de 88,06 kB                                     |
| Pruebas automatizadas           | 314 aprobadas en 92 archivos; ninguna omitida                                     |
| Dependencias instaladas         | `npm.cmd ls --depth=0` sin errores                                                |
| Recursos locales                | 33 referencias literales a imágenes o fuentes comprobadas, sin archivos faltantes |

La compilación genera `dist/soho-frontend/browser`. Los resultados generados, cachés y herramientas temporales de revisión quedan fuera del commit. La revisión de nombres y patrones de credenciales no encontró coincidencias en los archivos de la entrega.

La primera ejecución con la configuración predeterminada de Vitest aprobó 311 pruebas y agotó el límite de 5 segundos en tres pruebas de navegación. Se incorporó `vitest.config.mjs`, enlazado desde `angular.json`, con la configuración utilizada en las revisiones anteriores: archivos secuenciales, máximo de dos trabajadores y límites de 30 segundos para pruebas y preparación. La ejecución completa con esa configuración aprobó las 314 pruebas sin cambiar aserciones ni excluir casos.

Entorno de validación: Windows, Node.js 26.13.0 y npm 11.20.0. El compilador requirió ejecutarse fuera del aislamiento de la herramienta por errores de acceso a directorios; la ejecución con permisos adecuados pasó sin modificar el código de la aplicación.

Este cierre comprueba compilación, pruebas y archivos de la entrega. Las revisiones visuales y recorridos en navegador anteriores siguen documentados como historial en el README; no se repitieron en este cierre. Las referencias a `../.checkout-review/` corresponden a evidencias locales externas al repositorio y no son necesarias para compilar o ejecutar las pruebas.

## Pendientes para la siguiente etapa

- Conectar NestJS, Prisma y MySQL; diseñar el esquema inicial y los contratos de API.
- Sustituir las fuentes de demostración por datos persistentes compartidos entre tienda y administración.
- Implementar autenticación y autorización administrativas y de clientes, propiedad de pedidos y recuperación real de cuentas.
- Validar precios, variantes, inventario, cobertura y totales en el servidor; conservar los importes históricos de los pedidos.
- Definir los plazos y la política de reservas de inventario antes de dar efectos reales a pedidos y pagos.
- Conectar tarifas y cobertura administrativas con el checkout, configurar los QR reales y restringir el acceso a comprobantes.
- Implementar almacenamiento de archivos, correos y efectos reales de cambios, devoluciones y reembolsos según la política acordada.

Los datos comerciales, cuentas, pedidos, pagos y acciones administrativas actuales son de demostración. Este cierre no acredita una tienda habilitada para ventas reales.
