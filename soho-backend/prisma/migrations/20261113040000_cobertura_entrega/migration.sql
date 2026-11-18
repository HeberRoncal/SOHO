-- Migración aditiva: cobertura, sin modificar la agenda ni las tablas existentes.
-- Los CHECK son SQL manual que debe conservarse al preparar otras migraciones.

-- CreateTable
CREATE TABLE `zonas_entrega` (
    `id` CHAR(36) NOT NULL,
    `codigo` VARCHAR(80) NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `tarifa` DECIMAL(8, 2) NULL,
    `plazo` VARCHAR(80) NULL,
    `habilitada` BOOLEAN NOT NULL DEFAULT false,
    `orden` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `zonas_entrega_codigo_key`(`codigo`),
    UNIQUE INDEX `zonas_entrega_nombre_key`(`nombre`),
    INDEX `zonas_entrega_habilitada_orden_codigo_idx`(`habilitada`, `orden`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `zonas_entrega`
    ADD CONSTRAINT `zonas_entrega_codigo_formato` CHECK (
        REGEXP_LIKE(`codigo`, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c') AND
        NOT REGEXP_LIKE(`codigo`, '[^a-z0-9-]', 'c')
    ),
    ADD CONSTRAINT `zonas_entrega_nombre_valido` CHECK (
        CHAR_LENGTH(TRIM(`nombre`)) >= 2 AND
        NOT REGEXP_LIKE(`nombre`, '[[:cntrl:]]', 'c')
    ),
    ADD CONSTRAINT `zonas_entrega_tarifa_no_negativa` CHECK (
        `tarifa` IS NULL OR `tarifa` >= 0
    ),
    ADD CONSTRAINT `zonas_entrega_la_esperanza_gratuita` CHECK (
        `codigo` <> 'la-esperanza' OR (`tarifa` IS NOT NULL AND `tarifa` = 0)
    ),
    ADD CONSTRAINT `zonas_entrega_plazo_valido` CHECK (
        `plazo` IS NULL OR (
            CHAR_LENGTH(TRIM(`plazo`)) >= 1 AND
            NOT REGEXP_LIKE(`plazo`, '[[:cntrl:]]', 'c')
        )
    ),
    ADD CONSTRAINT `zonas_entrega_habilitada_booleana` CHECK (
        `habilitada` IN (0, 1)
    );

-- Configuración inicial de los distritos existentes. No son tarifas de demostración.
-- NULL es pendiente de definir: nunca debe convertirse en cero al cotizar.
-- Se conserva la habilitación actual; cotizar exigirá además una tarifa definida.
-- Los UUID v4 son estables y no dependen de la implementación UUID() de MySQL.
INSERT INTO `zonas_entrega` (`id`, `codigo`, `nombre`, `tarifa`, `plazo`, `habilitada`, `orden`) VALUES
    ('6d27d410-70cb-4a55-9400-000000000001', 'la-esperanza', 'La Esperanza', 0.00, NULL, true, 0),
    ('6d27d410-70cb-4a55-9400-000000000002', 'trujillo', 'Trujillo', NULL, NULL, true, 1),
    ('6d27d410-70cb-4a55-9400-000000000003', 'el-porvenir', 'El Porvenir', NULL, NULL, true, 2),
    ('6d27d410-70cb-4a55-9400-000000000004', 'florencia-de-mora', 'Florencia de Mora', NULL, NULL, true, 3),
    ('6d27d410-70cb-4a55-9400-000000000005', 'victor-larco', 'Víctor Larco Herrera', NULL, NULL, true, 4),
    ('6d27d410-70cb-4a55-9400-000000000006', 'huanchaco', 'Huanchaco', NULL, NULL, true, 5),
    ('6d27d410-70cb-4a55-9400-000000000007', 'moche', 'Moche', NULL, NULL, false, 6);
