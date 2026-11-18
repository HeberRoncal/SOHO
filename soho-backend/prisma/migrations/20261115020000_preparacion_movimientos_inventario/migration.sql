-- Ampliación compatible. Conserva movimientos históricos y no modifica existencias ni reservas.
-- SQL base obtenido con prisma migrate diff; CHECK mantenidos expresamente para MySQL 8.0.16+.

ALTER TABLE `variantes`
    ADD COLUMN `version_existencias` INTEGER UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE `movimientos_inventario`
    ADD COLUMN `clave_solicitud` CHAR(36) NULL,
    ADD COLUMN `respuesta` JSON NULL,
    ADD COLUMN `solicitud_hash` CHAR(64) NULL;

CREATE UNIQUE INDEX `movimientos_clave_solicitud_key`
    ON `movimientos_inventario`(`clave_solicitud`);

ALTER TABLE `variantes`
    ADD CONSTRAINT `variantes_version_existencias_positiva`
    CHECK (`version_existencias` >= 1);

ALTER TABLE `movimientos_inventario`
    ADD CONSTRAINT `movimientos_recuperacion_completa` CHECK (
        (`clave_solicitud` IS NULL AND `solicitud_hash` IS NULL AND `respuesta` IS NULL) OR
        (`clave_solicitud` IS NOT NULL AND `solicitud_hash` IS NOT NULL AND `respuesta` IS NOT NULL)
    ),
    ADD CONSTRAINT `movimientos_recuperacion_manual` CHECK (
        `clave_solicitud` IS NULL OR (`origen` = 'MANUAL' AND `usuario_responsable_id` IS NOT NULL)
    ),
    ADD CONSTRAINT `movimientos_solicitud_uuid` CHECK (
        `clave_solicitud` IS NULL OR
        REGEXP_LIKE(`clave_solicitud`, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c')
    ),
    ADD CONSTRAINT `movimientos_solicitud_hash` CHECK (
        `solicitud_hash` IS NULL OR REGEXP_LIKE(`solicitud_hash`, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `movimientos_respuesta_objeto` CHECK (
        `respuesta` IS NULL OR JSON_TYPE(`respuesta`) = 'OBJECT'
    );
