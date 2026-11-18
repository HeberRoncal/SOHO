-- Preparacion compatible de configuracion comercial; no habilita transferencias.
-- Base obtenida con Prisma migrate diff; CHECK agregados para MySQL 8.0.17+ (JSON_SCHEMA_VALID).
-- No reconstruye destinos historicos ni cambia pagos, stock, reservas o catalogo.

-- AlterTable
ALTER TABLE `pagos_pedido` ADD COLUMN `instruccion_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `configuracion_pagos` (
    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `version_actual_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `configuracion_pagos_version_actual_id_key`(`version_actual_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `versiones_configuracion_pagos` (
    `id` CHAR(36) NOT NULL,
    `configuracion_id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `numero` INTEGER UNSIGNED NOT NULL,
    `clave_solicitud` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `respuesta` JSON NOT NULL,
    `responsable_id` CHAR(36) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `versiones_configuracion_pagos_numero_key`(`numero`),
    UNIQUE INDEX `versiones_configuracion_pagos_clave_solicitud_key`(`clave_solicitud`),
    INDEX `versiones_configuracion_pagos_responsable_id_creado_en_id_idx`(`responsable_id`, `creado_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metodos_pago_configurados` (
    `id` CHAR(36) NOT NULL,
    `version_id` CHAR(36) NOT NULL,
    `metodo` ENUM('YAPE', 'PLIN') NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT false,
    `celular` VARCHAR(9) NULL,
    `titular` VARCHAR(120) NULL,
    `archivo_qr_id` CHAR(36) NULL,

    INDEX `metodos_pago_configurados_archivo_qr_id_metodo_idx`(`archivo_qr_id`, `metodo`),
    UNIQUE INDEX `metodos_version_metodo_key`(`version_id`, `metodo`),
    UNIQUE INDEX `metodos_id_metodo_key`(`id`, `metodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archivos_qr_pago` (
    `id` CHAR(36) NOT NULL,
    `metodo` ENUM('YAPE', 'PLIN') NOT NULL,
    `proveedor` ENUM('CLOUDINARY') NOT NULL DEFAULT 'CLOUDINARY',
    `estado` ENUM('PENDIENTE', 'CONCILIANDO', 'DISPONIBLE', 'FALLIDO', 'ELIMINANDO', 'ELIMINADO') NOT NULL DEFAULT 'PENDIENTE',
    `clave_carga` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `hash_contenido` CHAR(64) NOT NULL,
    `cloud_name` VARCHAR(80) NOT NULL,
    `public_id` VARCHAR(255) NOT NULL,
    `asset_id` VARCHAR(128) NULL,
    `version_cloudinary` BIGINT UNSIGNED NULL,
    `resource_type` VARCHAR(16) NOT NULL DEFAULT 'image',
    `delivery_type` VARCHAR(24) NOT NULL DEFAULT 'upload',
    `url_entrega` VARCHAR(1024) NULL,
    `carpeta_cloudinary` VARCHAR(512) NOT NULL,
    `nombre_original` VARCHAR(255) NOT NULL,
    `formato` VARCHAR(16) NOT NULL,
    `ancho` INTEGER UNSIGNED NOT NULL,
    `alto` INTEGER UNSIGNED NOT NULL,
    `bytes` INTEGER UNSIGNED NOT NULL,
    `creado_por_id` CHAR(36) NOT NULL,
    `token_carga` CHAR(36) NULL,
    `bloqueo_carga_hasta` DATETIME(3) NULL,
    `intentos_carga` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `proxima_revision_en` DATETIME(3) NULL,
    `confirmado_en` DATETIME(3) NULL,
    `limpiar_desde` DATETIME(3) NULL,
    `token_limpieza` CHAR(36) NULL,
    `bloqueo_limpieza_hasta` DATETIME(3) NULL,
    `intentos_limpieza` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `eliminado_en` DATETIME(3) NULL,
    `ultima_incidencia` VARCHAR(300) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `archivos_qr_pago_clave_carga_key`(`clave_carga`),
    INDEX `archivos_qr_pago_creado_por_id_creado_en_id_idx`(`creado_por_id`, `creado_en`, `id`),
    INDEX `qr_revision_idx`(`estado`, `proxima_revision_en`, `bloqueo_carga_hasta`),
    INDEX `qr_limpieza_idx`(`estado`, `limpiar_desde`, `bloqueo_limpieza_hasta`),
    UNIQUE INDEX `qr_id_metodo_key`(`id`, `metodo`),
    UNIQUE INDEX `qr_cuenta_asset_key`(`cloud_name`, `asset_id`),
    UNIQUE INDEX `qr_identidad_recurso_key`(`cloud_name`, `public_id`, `resource_type`, `delivery_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instrucciones_pago` (
    `id` CHAR(36) NOT NULL,
    `metodo_configurado_id` CHAR(36) NOT NULL,
    `metodo` ENUM('YAPE', 'PLIN') NOT NULL,
    `clave_solicitud` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `preparacion_hash` CHAR(64) NOT NULL,
    `clave_creacion_pedido` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NULL,
    `acceso_invitado_hash` CHAR(64) NULL,
    `moneda` ENUM('PEN') NOT NULL DEFAULT 'PEN',
    `importe_referencia` DECIMAL(14, 2) NOT NULL,
    `respuesta` JSON NOT NULL,
    `emitida_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pedido_id` CHAR(36) NULL,

    UNIQUE INDEX `instrucciones_pago_clave_solicitud_key`(`clave_solicitud`),
    UNIQUE INDEX `instrucciones_pedido_key`(`pedido_id`),
    INDEX `instrucciones_pago_metodo_configurado_id_metodo_idx`(`metodo_configurado_id`, `metodo`),
    INDEX `instrucciones_pago_usuario_id_emitida_en_id_idx`(`usuario_id`, `emitida_en`, `id`),
    INDEX `instrucciones_invitado_fecha_idx`(`acceso_invitado_hash`, `emitida_en`, `id`),
    INDEX `instrucciones_checkout_fecha_idx`(`clave_creacion_pedido`, `emitida_en`, `id`),
    UNIQUE INDEX `instrucciones_pedido_clave_key`(`pedido_id`, `clave_creacion_pedido`),
    UNIQUE INDEX `instrucciones_id_pedido_metodo_key`(`id`, `pedido_id`, `metodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_tienda` (
    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `version_actual_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `configuracion_tienda_version_actual_id_key`(`version_actual_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `versiones_configuracion_tienda` (
    `id` CHAR(36) NOT NULL,
    `configuracion_id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `numero` INTEGER UNSIGNED NOT NULL,
    `correo` VARCHAR(160) NULL,
    `whatsapp` VARCHAR(9) NULL,
    `horario` VARCHAR(160) NULL,
    `enlaces` JSON NOT NULL,
    `cambios` TEXT NULL,
    `privacidad` TEXT NULL,
    `terminos` TEXT NULL,
    `clave_solicitud` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `respuesta` JSON NOT NULL,
    `responsable_id` CHAR(36) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `versiones_configuracion_tienda_numero_key`(`numero`),
    UNIQUE INDEX `versiones_configuracion_tienda_clave_solicitud_key`(`clave_solicitud`),
    INDEX `versiones_configuracion_tienda_responsable_id_creado_en_id_idx`(`responsable_id`, `creado_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `pedidos_id_clave_creacion_key` ON `pedidos`(`id`, `clave_creacion`);

-- CreateIndex
CREATE UNIQUE INDEX `pagos_instruccion_key` ON `pagos_pedido`(`instruccion_id`);

-- CreateIndex
CREATE UNIQUE INDEX `pagos_instruccion_pedido_metodo_key` ON `pagos_pedido`(`instruccion_id`, `pedido_id`, `metodo`);

-- AddForeignKey
ALTER TABLE `pagos_pedido` ADD CONSTRAINT `pagos_pedido_instruccion_id_pedido_id_metodo_fkey` FOREIGN KEY (`instruccion_id`, `pedido_id`, `metodo`) REFERENCES `instrucciones_pago`(`id`, `pedido_id`, `metodo`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `configuracion_pagos` ADD CONSTRAINT `configuracion_pagos_version_actual_id_fkey` FOREIGN KEY (`version_actual_id`) REFERENCES `versiones_configuracion_pagos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `versiones_configuracion_pagos` ADD CONSTRAINT `versiones_configuracion_pagos_configuracion_id_fkey` FOREIGN KEY (`configuracion_id`) REFERENCES `configuracion_pagos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `versiones_configuracion_pagos` ADD CONSTRAINT `versiones_configuracion_pagos_responsable_id_fkey` FOREIGN KEY (`responsable_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `metodos_pago_configurados` ADD CONSTRAINT `metodos_pago_configurados_version_id_fkey` FOREIGN KEY (`version_id`) REFERENCES `versiones_configuracion_pagos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `metodos_pago_configurados` ADD CONSTRAINT `metodos_pago_configurados_archivo_qr_id_metodo_fkey` FOREIGN KEY (`archivo_qr_id`, `metodo`) REFERENCES `archivos_qr_pago`(`id`, `metodo`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `archivos_qr_pago` ADD CONSTRAINT `archivos_qr_pago_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `instrucciones_pago` ADD CONSTRAINT `instrucciones_pago_metodo_configurado_id_metodo_fkey` FOREIGN KEY (`metodo_configurado_id`, `metodo`) REFERENCES `metodos_pago_configurados`(`id`, `metodo`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `instrucciones_pago` ADD CONSTRAINT `instrucciones_pago_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `instrucciones_pago` ADD CONSTRAINT `instrucciones_pago_pedido_id_clave_creacion_pedido_fkey` FOREIGN KEY (`pedido_id`, `clave_creacion_pedido`) REFERENCES `pedidos`(`id`, `clave_creacion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `configuracion_tienda` ADD CONSTRAINT `configuracion_tienda_version_actual_id_fkey` FOREIGN KEY (`version_actual_id`) REFERENCES `versiones_configuracion_tienda`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `versiones_configuracion_tienda` ADD CONSTRAINT `versiones_configuracion_tienda_configuracion_id_fkey` FOREIGN KEY (`configuracion_id`) REFERENCES `configuracion_tienda`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `versiones_configuracion_tienda` ADD CONSTRAINT `versiones_configuracion_tienda_responsable_id_fkey` FOREIGN KEY (`responsable_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reglas manuales: Prisma no representa estos CHECK.

ALTER TABLE `configuracion_pagos`
    ADD CONSTRAINT `config_pagos_unica` CHECK (
        id = 1
    );

ALTER TABLE `versiones_configuracion_pagos`
    ADD CONSTRAINT `version_pagos_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_solicitud, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c')
    ),
    ADD CONSTRAINT `version_pagos_numero` CHECK (
        configuracion_id = 1 AND numero >= 1
    ),
    ADD CONSTRAINT `version_pagos_solicitud` CHECK (
        REGEXP_LIKE(solicitud_hash, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `version_pagos_respuesta` CHECK (
        JSON_TYPE(respuesta) = 'OBJECT'
    );

ALTER TABLE `configuracion_tienda`
    ADD CONSTRAINT `config_tienda_unica` CHECK (
        id = 1
    );

ALTER TABLE `versiones_configuracion_tienda`
    ADD CONSTRAINT `version_tienda_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_solicitud, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c')
    ),
    ADD CONSTRAINT `version_tienda_numero` CHECK (
        configuracion_id = 1 AND numero >= 1
    ),
    ADD CONSTRAINT `version_tienda_solicitud` CHECK (
        REGEXP_LIKE(solicitud_hash, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `version_tienda_respuesta` CHECK (
        JSON_TYPE(respuesta) = 'OBJECT'
    );

ALTER TABLE `metodos_pago_configurados`
    ADD CONSTRAINT `metodos_config_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND metodo IN ('YAPE','PLIN')
    ),
    ADD CONSTRAINT `metodos_config_activo` CHECK (
        activo IN (0,1)
    ),
    ADD CONSTRAINT `metodos_config_celular` CHECK (
        celular IS NULL OR REGEXP_LIKE(celular, '^9[0-9]{8}$', 'c')
    ),
    ADD CONSTRAINT `metodos_config_titular` CHECK (
        titular IS NULL OR (CHAR_LENGTH(TRIM(titular)) > 0 AND NOT REGEXP_LIKE(titular, '[[:cntrl:]]', 'c') AND BINARY titular = BINARY TRIM(titular))
    ),
    ADD CONSTRAINT `metodos_config_completo` CHECK (
        activo = 0 OR (celular IS NOT NULL AND titular IS NOT NULL)
    );

ALTER TABLE `archivos_qr_pago`
    ADD CONSTRAINT `qr_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_carga, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND metodo IN ('YAPE','PLIN') AND proveedor = 'CLOUDINARY'
    ),
    ADD CONSTRAINT `qr_estado` CHECK (
        estado IN ('PENDIENTE','CONCILIANDO','DISPONIBLE','FALLIDO','ELIMINANDO','ELIMINADO')
    ),
    ADD CONSTRAINT `qr_hashes` CHECK (
        REGEXP_LIKE(solicitud_hash, '^[0-9a-f]{64}$', 'c') AND REGEXP_LIKE(hash_contenido, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `qr_recurso` CHECK (
        REGEXP_LIKE(cloud_name, '^[A-Za-z0-9_-]+$', 'c') AND CHAR_LENGTH(TRIM(public_id)) > 0 AND NOT REGEXP_LIKE(public_id, '[[:cntrl:]]', 'c') AND resource_type = 'image' AND delivery_type = 'upload'
    ),
    ADD CONSTRAINT `qr_carpeta` CHECK (
        BINARY LEFT(carpeta_cloudinary, CHAR_LENGTH(CONCAT('SOHO/pagos/',LOWER(metodo),'/'))) = BINARY CONCAT('SOHO/pagos/',LOWER(metodo),'/') AND CHAR_LENGTH(carpeta_cloudinary) > CHAR_LENGTH(CONCAT('SOHO/pagos/',LOWER(metodo),'/')) AND NOT REGEXP_LIKE(carpeta_cloudinary, '[[:cntrl:]]', 'c')
    ),
    ADD CONSTRAINT `qr_contenido` CHECK (
        CHAR_LENGTH(TRIM(nombre_original)) > 0 AND NOT REGEXP_LIKE(nombre_original, '[[:cntrl:]]', 'c') AND formato IN ('png','jpg','webp') AND ancho BETWEEN 1 AND 4096 AND alto BETWEEN 1 AND 4096 AND bytes BETWEEN 1 AND 2097152
    ),
    ADD CONSTRAINT `qr_confirmacion_completa` CHECK (
        (asset_id IS NULL AND version_cloudinary IS NULL AND url_entrega IS NULL AND confirmado_en IS NULL) OR (asset_id IS NOT NULL AND version_cloudinary IS NOT NULL AND url_entrega IS NOT NULL AND confirmado_en IS NOT NULL AND CHAR_LENGTH(TRIM(asset_id)) > 0 AND NOT REGEXP_LIKE(asset_id, '[[:cntrl:]]', 'c') AND version_cloudinary >= 1 AND REGEXP_LIKE(url_entrega, '^https://[^[:space:]]+$', 'c') AND confirmado_en >= creado_en)
    ),
    ADD CONSTRAINT `qr_disponibilidad` CHECK (
        estado NOT IN ('DISPONIBLE','ELIMINANDO','ELIMINADO') OR (asset_id IS NOT NULL AND confirmado_en IS NOT NULL)
    ),
    ADD CONSTRAINT `qr_carga_bloqueo` CHECK (
        (token_carga IS NULL AND bloqueo_carga_hasta IS NULL) OR (token_carga IS NOT NULL AND bloqueo_carga_hasta IS NOT NULL AND REGEXP_LIKE(token_carga, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND bloqueo_carga_hasta > creado_en)
    ),
    ADD CONSTRAINT `qr_conciliando` CHECK (
        estado <> 'CONCILIANDO' OR token_carga IS NOT NULL
    ),
    ADD CONSTRAINT `qr_limpieza_bloqueo` CHECK (
        (token_limpieza IS NULL AND bloqueo_limpieza_hasta IS NULL) OR (token_limpieza IS NOT NULL AND bloqueo_limpieza_hasta IS NOT NULL AND REGEXP_LIKE(token_limpieza, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND bloqueo_limpieza_hasta > creado_en)
    ),
    ADD CONSTRAINT `qr_eliminando` CHECK (
        estado <> 'ELIMINANDO' OR token_limpieza IS NOT NULL
    ),
    ADD CONSTRAINT `qr_eliminacion` CHECK (
        (estado = 'ELIMINADO' AND eliminado_en IS NOT NULL AND eliminado_en >= confirmado_en) OR (estado <> 'ELIMINADO' AND eliminado_en IS NULL)
    ),
    ADD CONSTRAINT `qr_incidencia` CHECK (
        ultima_incidencia IS NULL OR (CHAR_LENGTH(TRIM(ultima_incidencia)) > 0 AND NOT REGEXP_LIKE(ultima_incidencia, '[[:cntrl:]]', 'c'))
    );

ALTER TABLE `instrucciones_pago`
    ADD CONSTRAINT `instrucciones_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_solicitud, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_creacion_pedido, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND metodo IN ('YAPE','PLIN')
    ),
    ADD CONSTRAINT `instrucciones_hashes` CHECK (
        REGEXP_LIKE(solicitud_hash, '^[0-9a-f]{64}$', 'c') AND REGEXP_LIKE(preparacion_hash, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `instrucciones_propietario` CHECK (
        (usuario_id IS NOT NULL AND acceso_invitado_hash IS NULL) OR (usuario_id IS NULL AND acceso_invitado_hash IS NOT NULL AND REGEXP_LIKE(acceso_invitado_hash, '^[0-9a-f]{64}$', 'c'))
    ),
    ADD CONSTRAINT `instrucciones_importe` CHECK (
        moneda = 'PEN' AND importe_referencia >= 0
    ),
    ADD CONSTRAINT `instrucciones_respuesta` CHECK (
        JSON_TYPE(respuesta) = 'OBJECT'
    );

ALTER TABLE `versiones_configuracion_tienda`
    ADD CONSTRAINT `tienda_correo` CHECK (
        correo IS NULL OR (BINARY correo = BINARY LOWER(TRIM(correo)) AND REGEXP_LIKE(correo, '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$', 'c'))
    ),
    ADD CONSTRAINT `tienda_whatsapp` CHECK (
        whatsapp IS NULL OR REGEXP_LIKE(whatsapp, '^9[0-9]{8}$', 'c')
    ),
    ADD CONSTRAINT `tienda_horario` CHECK (
        horario IS NULL OR (CHAR_LENGTH(TRIM(horario)) > 0 AND NOT REGEXP_LIKE(horario, '[[:cntrl:]]', 'c') AND BINARY horario = BINARY TRIM(horario))
    ),
    ADD CONSTRAINT `tienda_enlaces` CHECK (
        JSON_SCHEMA_VALID('{"type":"array","minItems":2,"maxItems":2,"items":{"type":"object","additionalProperties":false,"required":["texto","url"],"properties":{"texto":{"type":"string","maxLength":100},"url":{"type":["string","null"],"minLength":1,"maxLength":2048}}}}', enlaces) AND (JSON_TYPE(JSON_EXTRACT(enlaces,'$[0].url')) = 'NULL' OR (REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(enlaces,'$[0].url')), '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$', 'c') AND REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(enlaces,'$[0].texto')), '[^[:space:]]', 'c') AND NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(enlaces,'$[0].texto')), '[[:cntrl:]]', 'c'))) AND (JSON_TYPE(JSON_EXTRACT(enlaces,'$[1].url')) = 'NULL' OR (REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(enlaces,'$[1].url')), '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$', 'c') AND REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(enlaces,'$[1].texto')), '[^[:space:]]', 'c') AND NOT REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(enlaces,'$[1].texto')), '[[:cntrl:]]', 'c')))
    ),
    ADD CONSTRAINT `tienda_cambios` CHECK (
        cambios IS NULL OR (CHAR_LENGTH(cambios) <= 10000 AND REGEXP_LIKE(cambios, '[^[:space:]]', 'c') AND NOT REGEXP_LIKE(REPLACE(REPLACE(REPLACE(cambios,CHAR(13),''),CHAR(10),''),CHAR(9),''), '[[:cntrl:]]', 'c'))
    ),
    ADD CONSTRAINT `tienda_privacidad` CHECK (
        privacidad IS NULL OR (CHAR_LENGTH(privacidad) <= 10000 AND REGEXP_LIKE(privacidad, '[^[:space:]]', 'c') AND NOT REGEXP_LIKE(REPLACE(REPLACE(REPLACE(privacidad,CHAR(13),''),CHAR(10),''),CHAR(9),''), '[[:cntrl:]]', 'c'))
    ),
    ADD CONSTRAINT `tienda_terminos` CHECK (
        terminos IS NULL OR (CHAR_LENGTH(terminos) <= 10000 AND REGEXP_LIKE(terminos, '[^[:space:]]', 'c') AND NOT REGEXP_LIKE(REPLACE(REPLACE(REPLACE(terminos,CHAR(13),''),CHAR(10),''),CHAR(9),''), '[[:cntrl:]]', 'c'))
    );

-- Solo filas de control, sin metodos publicados ni datos comerciales ficticios.
INSERT INTO configuracion_pagos (id) VALUES (1);
INSERT INTO configuracion_tienda (id) VALUES (1);
