-- Migración aditiva: agenda privada, sin modificar usuarios ni datos del catálogo.
-- Los CHECK y el índice funcional son SQL manual que debe conservarse.

-- CreateTable
CREATE TABLE `direcciones_usuario` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `etiqueta` VARCHAR(40) NOT NULL,
    `destinatario` VARCHAR(140) NOT NULL,
    `celular` VARCHAR(9) NOT NULL,
    `distrito` VARCHAR(80) NOT NULL,
    `direccion` VARCHAR(180) NOT NULL,
    `referencia` VARCHAR(200) NOT NULL DEFAULT '',
    `predeterminada` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `direcciones_usuario_usuario_id_predeterminada_creado_en_id_idx`(`usuario_id`, `predeterminada`, `creado_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `direcciones_usuario` ADD CONSTRAINT `direcciones_usuario_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `direcciones_usuario`
    ADD CONSTRAINT `direcciones_usuario_textos_no_vacios` CHECK (
        CHAR_LENGTH(TRIM(`etiqueta`)) >= 2 AND
        CHAR_LENGTH(TRIM(`destinatario`)) >= 2 AND
        CHAR_LENGTH(TRIM(`direccion`)) >= 6
    ),
    ADD CONSTRAINT `direcciones_usuario_celular_formato` CHECK (
        CHAR_LENGTH(`celular`) = 9 AND
        REGEXP_LIKE(`celular`, '^9[0-9]{8}$', 'c')
    ),
    ADD CONSTRAINT `direcciones_usuario_distrito_formato` CHECK (
        REGEXP_LIKE(`distrito`, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c') AND
        NOT REGEXP_LIKE(`distrito`, '[^a-z0-9-]', 'c')
    ),
    ADD CONSTRAINT `direcciones_usuario_predeterminada_booleana` CHECK (
        `predeterminada` IN (0, 1)
    );

-- Solo las predeterminadas aportan usuario_id al índice único; las demás aportan
-- NULL, por lo que cada usuario puede guardar varias direcciones no predeterminadas.
-- Prisma no representa índices funcionales: no sustituir por UNIQUE(usuario_id,
-- predeterminada), que limitaría también a una sola dirección no predeterminada.
CREATE UNIQUE INDEX `direcciones_usuario_una_predeterminada_key`
    ON `direcciones_usuario` ((CASE WHEN `predeterminada` = 1 THEN `usuario_id` ELSE NULL END));
