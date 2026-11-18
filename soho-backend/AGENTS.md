# AGENTS.md

## SOHO: flujo de trabajo

- Continúa vigente la integración de las interfaces Angular con NestJS, API REST, Prisma y MySQL. El estado y la siguiente entrega propuesta están en [Estado de integración](docs/estado-integracion.md).
- El usuario exige usar Nest CLI para crear nuevas piezas del backend. Desde esta carpeta, ejecutar `npx.cmd --no-install nest generate <tipo> <ruta>` (`nest g` es equivalente), con el generador adecuado para módulo, controlador, servicio, recurso, clase, interfaz, guard, pipe, filtro, middleware, decorador o gateway.
- Para recursos CRUD, utilizar REST API y adaptar después los archivos generados a Prisma, validación, sesión, RBAC e importaciones ESM con extensión `.js`.
- Los componentes existentes se reorganizan conservando su lógica e importaciones; no se regeneran encima de implementaciones completas. Mantener las carpetas por responsabilidad documentadas para autenticación y catálogo.
- No editar manualmente `src/generated/prisma`: modificar `prisma/schema.prisma` y ejecutar `npm.cmd run db:generate`. Las migraciones y la generación del cliente son operaciones distintas.

## Production data: NestJS Observe

This app's production telemetry - traces, errors, logs and metrics - goes to [NestJS Observe](https://observe.nestjs.com). Until `ObserveModule` is registered in `src/app.module.ts`, nothing is sent: `npx @nestjs/observe link` sets it up in one step - it installs `@nestjs/observe`, wires it into the app, and writes the key pair (`OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`) to `.env`.

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- The Observe MCP server answers those questions directly: errors with their traces and logs, slow operations, jobs, and what a release changed (`find_regressions`, `diff_release`). It is included on the Pro plan and above. In Claude Code: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`, and the client opens a browser to approve. Other clients: https://www.observe.nestjs.com/documentation/mcp
- Without it, the user can open the request or error in the Observe dashboard and click **Copy agent prompt**, which hands over that page's trace, stack and logs as text.
