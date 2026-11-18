# Organización de autenticación

El módulo se organiza por responsabilidad. `autenticacion.module.ts` mantiene el registro de controladores, proveedores, guards globales y filtro de errores; las carpetas agrupan las implementaciones que utiliza.

```text
src/autenticacion/
├── autenticacion.module.ts
├── acceso/
│   ├── autenticacion.controller.ts
│   ├── autenticacion.service.ts
│   ├── crear-administrador.ts
│   ├── datos-auth.ts
│   └── datos-auth.spec.ts
├── correo/
│   ├── configuracion-correo.ts
│   ├── correos.service.ts
│   └── correo.spec.ts
├── google/
│   ├── datos-google.ts
│   ├── desafios-google.service.ts
│   ├── google.controller.ts
│   ├── google.service.ts
│   └── verificador-google.service.ts
├── recuperacion/
│   ├── datos-recuperacion.ts
│   ├── recuperacion.controller.ts
│   ├── recuperacion.service.ts
│   └── recuperacion.spec.ts
├── seguridad/
│   ├── auth.decoradores.ts
│   ├── auth.guards.ts
│   ├── claves.service.ts
│   ├── configuracion-auth.ts
│   ├── csrf.service.ts
│   ├── errores-auth.filter.ts
│   ├── limites-auth.service.ts
│   └── seguridad-auth.spec.ts
├── sesiones/
│   ├── contexto-auth.ts
│   ├── cookies-auth.ts
│   ├── respuesta-auth.ts
│   └── sesiones.service.ts
└── verificacion/
    ├── datos-verificacion.ts
    ├── verificacion.controller.ts
    ├── verificacion.service.ts
    └── verificacion.spec.ts
```

- **Acceso:** registro, login, consulta y edición del perfil propio, logout, validación de datos y función de creación de administradores. El punto de entrada interactivo continúa en `scripts/crear-admin.ts`.
- **Correo:** configuración SMTP y transporte compartido por recuperación y verificación. El proveedor se llama `CorreosService` para reflejar ambos usos.
- **Google:** validación de credenciales, desafíos, acceso y vinculación explícita.
- **Recuperación:** solicitudes, tokens y restablecimiento de contraseña.
- **Seguridad:** autorización por roles, guards, contraseña, CSRF, límites, configuración de autenticación y errores públicos.
- **Sesiones:** contratos del usuario autenticado, cookies, creación y revocación de sesiones y construcción de respuestas con sesión.
- **Verificación:** envío solicitado, comprobación y confirmación del correo.

Las pruebas unitarias permanecen junto a su implementación. Las pruebas HTTP y de integración con MySQL se conservan en `test/`. Las importaciones relativas utilizan la extensión `.js` que requiere la compilación ESM del proyecto; no se añaden archivos intermediarios para mantener rutas anteriores.

Esta reorganización conserva los endpoints, reglas de autorización, formato de respuestas, configuración de entorno y esquema de datos. No requiere migración ni modificaciones de Angular. El contrato funcional se documenta en [Autenticación y RBAC](autenticacion.md).
