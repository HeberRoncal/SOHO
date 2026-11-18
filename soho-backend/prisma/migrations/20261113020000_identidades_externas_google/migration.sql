-- Ampliación para acceso con contraseña, Google o ambos métodos vinculados.
-- Conserva las filas existentes y no modifica las migraciones anteriores.

-- La ausencia de clave local se representa con NULL. Una clave presente mantiene
-- el mismo formato PHC Argon2id exigido antes de esta migración.
ALTER TABLE `usuarios`
    DROP CHECK `usuarios_clave_hash_formato`,
    MODIFY `clave_hash` VARCHAR(255) NULL,
    ADD CONSTRAINT `usuarios_clave_hash_formato` CHECK (
        `clave_hash` IS NULL OR (
            CHAR_LENGTH(`clave_hash`) >= 80 AND
            REGEXP_LIKE(`clave_hash`, '^[$]argon2id[$][^[:space:]]+$', 'c')
        )
    );

-- Google define sub como un identificador ASCII sensible a mayúsculas.
-- Esta colación y el CHECK son SQL manual: Prisma no los representa por completo.
CREATE TABLE `identidades_externas` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `proveedor` ENUM('GOOGLE') NOT NULL,
    `identificador_proveedor` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `identidades_externas_usuario_id_idx`(`usuario_id`),
    UNIQUE INDEX `identidades_externas_proveedor_identificador_proveedor_key`(`proveedor`, `identificador_proveedor`),
    PRIMARY KEY (`id`),
    CONSTRAINT `identidades_externas_identificador_formato` CHECK (
        CHAR_LENGTH(`identificador_proveedor`) >= 1 AND
        NOT REGEXP_LIKE(`identificador_proveedor`, '[^!-~]', 'c')
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `identidades_externas`
    ADD CONSTRAINT `identidades_externas_usuario_id_fkey`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- El servicio creará usuario e identidad en una transacción, verificará el ID
-- token de Google y evitará desvincular el último método de acceso disponible.
