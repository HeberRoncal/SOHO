-- Migración aditiva: conserva los datos del catálogo y sus movimientos.
-- Los CHECK y la colación del correo son SQL manual que debe conservarse.

-- AlterTable
ALTER TABLE `movimientos_inventario` ADD COLUMN `usuario_responsable_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` CHAR(36) NOT NULL,
    `nombres` VARCHAR(80) NOT NULL,
    `apellidos` VARCHAR(80) NOT NULL,
    `correo` VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `clave_hash` VARCHAR(255) NOT NULL,
    `rol` ENUM('ADMIN', 'CLIENTE') NOT NULL DEFAULT 'CLIENTE',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `correo_verificado_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `usuarios_correo_key`(`correo`),
    INDEX `usuarios_rol_activo_creado_en_idx`(`rol`, `activo`, `creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesiones` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ultima_actividad_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expira_en` DATETIME(3) NOT NULL,
    `revocada_en` DATETIME(3) NULL,

    UNIQUE INDEX `sesiones_token_hash_key`(`token_hash`),
    INDEX `sesiones_usuario_id_revocada_en_expira_en_idx`(`usuario_id`, `revocada_en`, `expira_en`),
    INDEX `sesiones_expira_en_idx`(`expira_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tokens_usuario` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `tipo` ENUM('VERIFICACION_CORREO', 'RECUPERACION_CLAVE') NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expira_en` DATETIME(3) NOT NULL,
    `usado_en` DATETIME(3) NULL,
    `revocado_en` DATETIME(3) NULL,

    UNIQUE INDEX `tokens_usuario_token_hash_key`(`token_hash`),
    INDEX `tokens_usuario_usuario_id_tipo_idx`(`usuario_id`, `tipo`),
    INDEX `tokens_usuario_expira_en_idx`(`expira_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `movimientos_inventario_usuario_responsable_id_fecha_id_idx` ON `movimientos_inventario`(`usuario_responsable_id`, `fecha`, `id`);

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_usuario_responsable_id_fkey` FOREIGN KEY (`usuario_responsable_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sesiones` ADD CONSTRAINT `sesiones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tokens_usuario` ADD CONSTRAINT `tokens_usuario_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- El servidor normalizará el correo antes de guardarlo, sin eliminar acentos.
ALTER TABLE `usuarios`
    ADD CONSTRAINT `usuarios_nombres_no_vacios` CHECK (
        CHAR_LENGTH(TRIM(`nombres`)) >= 2 AND CHAR_LENGTH(TRIM(`apellidos`)) >= 2
    ),
    ADD CONSTRAINT `usuarios_correo_normalizado` CHECK (
        CAST(`correo` AS BINARY) = CAST(LOWER(TRIM(`correo`)) AS BINARY) AND
        REGEXP_LIKE(`correo`, '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$', 'c')
    ),
    ADD CONSTRAINT `usuarios_clave_hash_formato` CHECK (
        CHAR_LENGTH(`clave_hash`) >= 80 AND REGEXP_LIKE(`clave_hash`, '^[$]argon2id[$][^[:space:]]+$', 'c')
    ),
    ADD CONSTRAINT `usuarios_activo_booleano` CHECK (`activo` IN (0, 1));

ALTER TABLE `sesiones`
    ADD CONSTRAINT `sesiones_token_hash_formato` CHECK (
        REGEXP_LIKE(`token_hash`, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `sesiones_fechas_coherentes` CHECK (
        `expira_en` > `creada_en` AND
        `ultima_actividad_en` >= `creada_en` AND
        `ultima_actividad_en` <= `expira_en` AND
        (`revocada_en` IS NULL OR `revocada_en` >= `creada_en`)
    );

ALTER TABLE `tokens_usuario`
    ADD CONSTRAINT `tokens_usuario_hash_formato` CHECK (
        REGEXP_LIKE(`token_hash`, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `tokens_usuario_fechas_coherentes` CHECK (
        `expira_en` > `creado_en` AND
        (`usado_en` IS NULL OR (`usado_en` >= `creado_en` AND `usado_en` <= `expira_en`)) AND
        (`revocado_en` IS NULL OR `revocado_en` >= `creado_en`)
    );
