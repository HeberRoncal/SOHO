-- Recepcion privada previa al pedido; solo preparacion estructural.
-- MySQL 8.0.17+; base generada por Prisma migrate diff y CHECK revisados.
-- No crea recepciones, archivos ni operaciones; no modifica datos anteriores.

-- AlterTable
ALTER TABLE `comprobantes_pago` ADD COLUMN `comprobante_recepcion_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `recepciones_compra` (
    `id` CHAR(36) NOT NULL,
    `referencia` VARCHAR(24) NOT NULL,
    `instruccion_id` CHAR(36) NOT NULL,
    `clave_creacion_pedido` CHAR(36) NOT NULL,
    `clave_solicitud` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `estado` ENUM('RECIBIENDO', 'RECIBIDA', 'REQUIERE_ATENCION', 'PEDIDO_CREADO') NOT NULL DEFAULT 'RECIBIENDO',
    `motivos` JSON NOT NULL,
    `respuesta` JSON NULL,
    `acceso_invitado_expira_en` DATETIME(3) NULL,
    `comprobante_actual_id` CHAR(36) NULL,
    `estado_comprobante_actual` ENUM('PENDIENTE', 'DISPONIBLE') NOT NULL DEFAULT 'DISPONIBLE',
    `pedido_id` CHAR(36) NULL,
    `pago_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recibida_en` DATETIME(3) NULL,
    `pedido_registrado_en` DATETIME(3) NULL,

    UNIQUE INDEX `recepciones_compra_referencia_key`(`referencia`),
    UNIQUE INDEX `recepciones_instruccion_key`(`instruccion_id`),
    UNIQUE INDEX `recepciones_checkout_key`(`clave_creacion_pedido`),
    UNIQUE INDEX `recepciones_compra_clave_solicitud_key`(`clave_solicitud`),
    UNIQUE INDEX `recepciones_comprobante_actual_key`(`comprobante_actual_id`),
    UNIQUE INDEX `recepciones_pedido_key`(`pedido_id`),
    UNIQUE INDEX `recepciones_pago_key`(`pago_id`),
    INDEX `recepciones_bandeja_idx`(`estado`, `creado_en`, `id`),
    INDEX `recepciones_acceso_idx`(`acceso_invitado_expira_en`),
    UNIQUE INDEX `recepciones_instruccion_checkout_key`(`instruccion_id`, `clave_creacion_pedido`),
    UNIQUE INDEX `recepciones_instruccion_pedido_key`(`instruccion_id`, `pedido_id`),
    UNIQUE INDEX `recepciones_pago_pedido_instruccion_key`(`pago_id`, `pedido_id`, `instruccion_id`),
    UNIQUE INDEX `recepciones_actual_disponible_key`(`comprobante_actual_id`, `id`, `estado_comprobante_actual`),
    UNIQUE INDEX `recepciones_id_pago_key`(`id`, `pago_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comprobantes_recepcion_compra` (
    `id` CHAR(36) NOT NULL,
    `recepcion_id` CHAR(36) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL,
    `clave_solicitud` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `archivo_clave` VARCHAR(255) NOT NULL,
    `archivo_sha256_original` CHAR(64) NOT NULL,
    `archivo_sha256` CHAR(64) NOT NULL,
    `nombre_archivo` VARCHAR(255) NOT NULL,
    `formato` VARCHAR(32) NOT NULL,
    `tamano_bytes` INTEGER UNSIGNED NOT NULL,
    `numero_operacion` VARCHAR(12) NULL,
    `estado_archivo` ENUM('PENDIENTE', 'DISPONIBLE') NOT NULL DEFAULT 'PENDIENTE',
    `token_escritura` CHAR(36) NULL,
    `bloqueo_escritura_hasta` DATETIME(3) NULL,
    `intentos_escritura` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `proxima_revision_en` DATETIME(3) NULL,
    `ultima_incidencia` VARCHAR(300) NULL,
    `confirmado_en` DATETIME(3) NULL,
    `pago_destino_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `comprobantes_recepcion_compra_clave_solicitud_key`(`clave_solicitud`),
    UNIQUE INDEX `comprobantes_recepcion_compra_archivo_clave_key`(`archivo_clave`),
    UNIQUE INDEX `comprobantes_recepcion_pago_destino_key`(`pago_destino_id`),
    INDEX `comprobantes_recepcion_revision_idx`(`estado_archivo`, `proxima_revision_en`, `bloqueo_escritura_hasta`),
    UNIQUE INDEX `comprobantes_recepcion_version_key`(`recepcion_id`, `version`),
    UNIQUE INDEX `comprobantes_recepcion_id_recepcion_key`(`id`, `recepcion_id`),
    UNIQUE INDEX `comprobantes_recepcion_disponible_key`(`id`, `recepcion_id`, `estado_archivo`),
    UNIQUE INDEX `comprobantes_recepcion_destino_key`(`recepcion_id`, `pago_destino_id`),
    UNIQUE INDEX `comprobantes_recepcion_pago_contenido_key`(`id`, `pago_destino_id`, `archivo_sha256`, `formato`, `tamano_bytes`),
    UNIQUE INDEX `comprobantes_recepcion_copia_contenido_key`(`id`, `recepcion_id`, `archivo_sha256`, `formato`, `tamano_bytes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_recepcion_compra` (
    `id` CHAR(36) NOT NULL,
    `recepcion_id` CHAR(36) NOT NULL,
    `comprobante_id` CHAR(36) NOT NULL,
    `clave_solicitud` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `accion` ENUM('PROCESAR', 'REGISTRAR_PEDIDO', 'SOLICITAR_CORRECCION', 'ADJUNTAR_COMPROBANTE') NOT NULL,
    `estado` ENUM('PENDIENTE', 'CONFIRMADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `actor` ENUM('SISTEMA', 'CLIENTE', 'ADMIN') NOT NULL,
    `responsable_id` CHAR(36) NULL,
    `motivo` VARCHAR(300) NULL,
    `mensaje` VARCHAR(500) NULL,
    `version_esperada` INTEGER UNSIGNED NOT NULL,
    `version_resultante` INTEGER UNSIGNED NULL,
    `antes` JSON NOT NULL,
    `despues` JSON NULL,
    `respuesta` JSON NULL,
    `codigo_http` SMALLINT UNSIGNED NULL,
    `archivo_pedido_clave` VARCHAR(255) NULL,
    `archivo_pedido_sha256` CHAR(64) NULL,
    `archivo_pedido_formato` VARCHAR(32) NULL,
    `archivo_pedido_bytes` INTEGER UNSIGNED NULL,
    `archivo_pedido_estado` ENUM('PENDIENTE', 'DISPONIBLE') NULL,
    `archivo_pedido_confirmado_en` DATETIME(3) NULL,
    `token_proceso` CHAR(36) NULL,
    `bloqueo_proceso_hasta` DATETIME(3) NULL,
    `intentos_proceso` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `proxima_revision_en` DATETIME(3) NULL,
    `ultima_incidencia` VARCHAR(300) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finalizado_en` DATETIME(3) NULL,

    UNIQUE INDEX `operaciones_recepcion_compra_clave_solicitud_key`(`clave_solicitud`),
    UNIQUE INDEX `operaciones_recepcion_archivo_pedido_key`(`archivo_pedido_clave`),
    INDEX `operaciones_recepcion_historial_idx`(`recepcion_id`, `creado_en`, `id`),
    INDEX `operaciones_recepcion_comprobante_idx`(`comprobante_id`, `recepcion_id`),
    INDEX `operaciones_recepcion_copia_idx`(`comprobante_id`, `recepcion_id`, `archivo_pedido_sha256`, `archivo_pedido_formato`, `archivo_pedido_bytes`),
    INDEX `operaciones_recepcion_responsable_idx`(`responsable_id`, `creado_en`, `id`),
    INDEX `operaciones_recepcion_revision_idx`(`estado`, `proxima_revision_en`, `bloqueo_proceso_hasta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `pagos_pedido_instruccion_origen_key` ON `pagos_pedido`(`id`, `pedido_id`, `instruccion_id`);

-- CreateIndex
CREATE UNIQUE INDEX `comprobantes_origen_recepcion_key` ON `comprobantes_pago`(`comprobante_recepcion_id`);

-- CreateIndex
CREATE UNIQUE INDEX `comprobantes_origen_contenido_key` ON `comprobantes_pago`(`comprobante_recepcion_id`, `pago_id`, `archivo_sha256`, `formato`, `tamano_bytes`);

-- CreateIndex
CREATE UNIQUE INDEX `instrucciones_id_clave_recepcion_key` ON `instrucciones_pago`(`id`, `clave_creacion_pedido`);

-- CreateIndex
CREATE UNIQUE INDEX `instrucciones_id_pedido_recepcion_key` ON `instrucciones_pago`(`id`, `pedido_id`);

-- AddForeignKey
ALTER TABLE `comprobantes_pago` ADD CONSTRAINT `comprobantes_pago_comprobante_recepcion_id_pago_id_archivo__fkey` FOREIGN KEY (`comprobante_recepcion_id`, `pago_id`, `archivo_sha256`, `formato`, `tamano_bytes`) REFERENCES `comprobantes_recepcion_compra`(`id`, `pago_destino_id`, `archivo_sha256`, `formato`, `tamano_bytes`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `recepciones_compra` ADD CONSTRAINT `recepciones_compra_instruccion_id_clave_creacion_pedido_fkey` FOREIGN KEY (`instruccion_id`, `clave_creacion_pedido`) REFERENCES `instrucciones_pago`(`id`, `clave_creacion_pedido`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `recepciones_compra` ADD CONSTRAINT `recepciones_compra_instruccion_id_pedido_id_fkey` FOREIGN KEY (`instruccion_id`, `pedido_id`) REFERENCES `instrucciones_pago`(`id`, `pedido_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `recepciones_compra` ADD CONSTRAINT `recepciones_compra_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `recepciones_compra` ADD CONSTRAINT `recepciones_compra_pago_id_pedido_id_instruccion_id_fkey` FOREIGN KEY (`pago_id`, `pedido_id`, `instruccion_id`) REFERENCES `pagos_pedido`(`id`, `pedido_id`, `instruccion_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `recepciones_compra` ADD CONSTRAINT `recepciones_compra_comprobante_actual_id_id_estado_comproba_fkey` FOREIGN KEY (`comprobante_actual_id`, `id`, `estado_comprobante_actual`) REFERENCES `comprobantes_recepcion_compra`(`id`, `recepcion_id`, `estado_archivo`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `comprobantes_recepcion_compra` ADD CONSTRAINT `comprobantes_recepcion_compra_recepcion_id_fkey` FOREIGN KEY (`recepcion_id`) REFERENCES `recepciones_compra`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `comprobantes_recepcion_compra` ADD CONSTRAINT `comprobantes_recepcion_compra_recepcion_id_pago_destino_id_fkey` FOREIGN KEY (`recepcion_id`, `pago_destino_id`) REFERENCES `recepciones_compra`(`id`, `pago_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operaciones_recepcion_compra` ADD CONSTRAINT `operaciones_recepcion_compra_recepcion_id_fkey` FOREIGN KEY (`recepcion_id`) REFERENCES `recepciones_compra`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operaciones_recepcion_compra` ADD CONSTRAINT `operaciones_recepcion_compra_comprobante_id_recepcion_id_fkey` FOREIGN KEY (`comprobante_id`, `recepcion_id`) REFERENCES `comprobantes_recepcion_compra`(`id`, `recepcion_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operaciones_recepcion_compra` ADD CONSTRAINT `operaciones_recepcion_compra_comprobante_id_recepcion_id_ar_fkey` FOREIGN KEY (`comprobante_id`, `recepcion_id`, `archivo_pedido_sha256`, `archivo_pedido_formato`, `archivo_pedido_bytes`) REFERENCES `comprobantes_recepcion_compra`(`id`, `recepcion_id`, `archivo_sha256`, `formato`, `tamano_bytes`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operaciones_recepcion_compra` ADD CONSTRAINT `operaciones_recepcion_compra_responsable_id_fkey` FOREIGN KEY (`responsable_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `comprobantes_pago`
    ADD CONSTRAINT `comprobantes_origen_uuid` CHECK (
        comprobante_recepcion_id IS NULL OR REGEXP_LIKE(comprobante_recepcion_id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c')
    );

ALTER TABLE `recepciones_compra`
    ADD CONSTRAINT `recepciones_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(instruccion_id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_creacion_pedido, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_solicitud, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c')
    ),
    ADD CONSTRAINT `recepciones_referencia` CHECK (
        REGEXP_LIKE(referencia, '^REC-[A-Z0-9]{16}$', 'c')
    ),
    ADD CONSTRAINT `recepciones_hash` CHECK (
        REGEXP_LIKE(solicitud_hash, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `recepciones_version` CHECK (
        version >= 1
    ),
    ADD CONSTRAINT `recepciones_estado` CHECK (
        estado IN ('RECIBIENDO','RECIBIDA','REQUIERE_ATENCION','PEDIDO_CREADO') AND estado_comprobante_actual = 'DISPONIBLE'
    ),
    ADD CONSTRAINT `recepciones_fechas` CHECK (
        actualizado_en >= creado_en AND (acceso_invitado_expira_en IS NULL OR acceso_invitado_expira_en > creado_en)
    ),
    ADD CONSTRAINT `recepciones_confirmacion` CHECK (
        (estado = 'RECIBIENDO' AND comprobante_actual_id IS NULL AND recibida_en IS NULL AND respuesta IS NULL) OR (estado <> 'RECIBIENDO' AND comprobante_actual_id IS NOT NULL AND recibida_en IS NOT NULL AND recibida_en >= creado_en AND respuesta IS NOT NULL AND JSON_TYPE(respuesta) = 'OBJECT')
    ),
    ADD CONSTRAINT `recepciones_motivos` CHECK (
        JSON_SCHEMA_VALID('{"type":"array","maxItems":10,"uniqueItems":true,"items":{"enum":["PRECIO_CAMBIADO","STOCK_INSUFICIENTE","ARTICULO_NO_DISPONIBLE","COBERTURA_DESHABILITADA","COBERTURA_TARIFA_PENDIENTE","COTIZACION_CAMBIADA","TOTAL_CAMBIADO","COMPROBANTE_REQUIERE_CORRECCION","INVENTARIO_INCONSISTENTE","PREPARACION_INCONSISTENTE"]}}', motivos) AND ((estado = 'REQUIERE_ATENCION' AND JSON_LENGTH(motivos) >= 1) OR (estado <> 'REQUIERE_ATENCION' AND JSON_LENGTH(motivos) = 0))
    ),
    ADD CONSTRAINT `recepciones_pedido` CHECK (
        (estado = 'PEDIDO_CREADO' AND pedido_id IS NOT NULL AND pago_id IS NOT NULL AND pedido_registrado_en IS NOT NULL AND pedido_registrado_en >= recibida_en) OR (estado <> 'PEDIDO_CREADO' AND pedido_id IS NULL AND pago_id IS NULL AND pedido_registrado_en IS NULL)
    );

ALTER TABLE `comprobantes_recepcion_compra`
    ADD CONSTRAINT `rec_comp_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(recepcion_id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_solicitud, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c')
    ),
    ADD CONSTRAINT `rec_comp_version` CHECK (
        version >= 1
    ),
    ADD CONSTRAINT `rec_comp_hashes` CHECK (
        REGEXP_LIKE(solicitud_hash, '^[0-9a-f]{64}$', 'c') AND REGEXP_LIKE(archivo_sha256_original, '^[0-9a-f]{64}$', 'c') AND REGEXP_LIKE(archivo_sha256, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `rec_comp_archivo` CHECK (
        REGEXP_LIKE(archivo_clave, '^comprobantes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$', 'c') AND RIGHT(archivo_clave,CHAR_LENGTH(CASE formato WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE '?' END)+1) = CONCAT('.', CASE formato WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE '?' END)
    ),
    ADD CONSTRAINT `rec_comp_contenido` CHECK (
        formato IN ('image/png','image/jpeg','image/webp') AND tamano_bytes BETWEEN 1 AND 5242880 AND (CHAR_LENGTH(TRIM(nombre_archivo)) > 0 AND NOT REGEXP_LIKE(nombre_archivo, '[[:cntrl:]]', 'c') AND BINARY nombre_archivo = BINARY TRIM(nombre_archivo)) AND (numero_operacion IS NULL OR REGEXP_LIKE(numero_operacion, '^[0-9]{1,12}$', 'c'))
    ),
    ADD CONSTRAINT `rec_comp_confirmacion` CHECK (
        (estado_archivo = 'PENDIENTE' AND confirmado_en IS NULL AND pago_destino_id IS NULL) OR (estado_archivo = 'DISPONIBLE' AND confirmado_en IS NOT NULL AND confirmado_en >= creado_en AND token_escritura IS NULL AND bloqueo_escritura_hasta IS NULL AND proxima_revision_en IS NULL)
    ),
    ADD CONSTRAINT `rec_comp_fechas` CHECK (
        actualizado_en >= creado_en AND (proxima_revision_en IS NULL OR proxima_revision_en >= creado_en)
    ),
    ADD CONSTRAINT `rec_comp_bloqueo` CHECK (
        (token_escritura IS NULL AND bloqueo_escritura_hasta IS NULL) OR (token_escritura IS NOT NULL AND bloqueo_escritura_hasta IS NOT NULL AND REGEXP_LIKE(token_escritura, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND bloqueo_escritura_hasta > creado_en)
    ),
    ADD CONSTRAINT `rec_comp_incidencia` CHECK (
        ultima_incidencia IS NULL OR (CHAR_LENGTH(TRIM(ultima_incidencia)) > 0 AND NOT REGEXP_LIKE(ultima_incidencia, '[[:cntrl:]]', 'c') AND BINARY ultima_incidencia = BINARY TRIM(ultima_incidencia))
    );

ALTER TABLE `operaciones_recepcion_compra`
    ADD CONSTRAINT `rec_op_identidad` CHECK (
        REGEXP_LIKE(id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(recepcion_id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(comprobante_id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND REGEXP_LIKE(clave_solicitud, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c')
    ),
    ADD CONSTRAINT `rec_op_hash` CHECK (
        REGEXP_LIKE(solicitud_hash, '^[0-9a-f]{64}$', 'c')
    ),
    ADD CONSTRAINT `rec_op_accion` CHECK (
        accion IN ('PROCESAR','REGISTRAR_PEDIDO','SOLICITAR_CORRECCION','ADJUNTAR_COMPROBANTE')
    ),
    ADD CONSTRAINT `rec_op_actor` CHECK (
        (actor = 'SISTEMA' AND responsable_id IS NULL) OR (actor IN ('CLIENTE','ADMIN') AND responsable_id IS NOT NULL AND REGEXP_LIKE(responsable_id, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c'))
    ),
    ADD CONSTRAINT `rec_op_administracion` CHECK (
        accion NOT IN ('REGISTRAR_PEDIDO','SOLICITAR_CORRECCION') OR (actor = 'ADMIN' AND responsable_id IS NOT NULL AND motivo IS NOT NULL AND (CHAR_LENGTH(TRIM(motivo)) > 0 AND NOT REGEXP_LIKE(motivo, '[[:cntrl:]]', 'c') AND BINARY motivo = BINARY TRIM(motivo)))
    ),
    ADD CONSTRAINT `rec_op_texto` CHECK (
        (motivo IS NULL OR (CHAR_LENGTH(TRIM(motivo)) > 0 AND NOT REGEXP_LIKE(motivo, '[[:cntrl:]]', 'c') AND BINARY motivo = BINARY TRIM(motivo))) AND (mensaje IS NULL OR (CHAR_LENGTH(TRIM(mensaje)) > 0 AND NOT REGEXP_LIKE(mensaje, '[[:cntrl:]]', 'c') AND BINARY mensaje = BINARY TRIM(mensaje))) AND (accion <> 'SOLICITAR_CORRECCION' OR mensaje IS NOT NULL)
    ),
    ADD CONSTRAINT `rec_op_version` CHECK (
        version_esperada >= 1 AND (version_resultante IS NULL OR version_resultante >= 1)
    ),
    ADD CONSTRAINT `rec_op_antes` CHECK (
        antes IS NOT NULL AND JSON_TYPE(antes) = 'OBJECT'
    ),
    ADD CONSTRAINT `rec_op_resultado` CHECK (
        (estado = 'PENDIENTE' AND version_resultante IS NULL AND despues IS NULL AND respuesta IS NULL AND codigo_http IS NULL AND finalizado_en IS NULL) OR (estado IN ('CONFIRMADA','RECHAZADA') AND version_resultante IS NOT NULL AND despues IS NOT NULL AND JSON_TYPE(despues) = 'OBJECT' AND respuesta IS NOT NULL AND JSON_TYPE(respuesta) = 'OBJECT' AND codigo_http IS NOT NULL AND finalizado_en IS NOT NULL AND finalizado_en >= creado_en AND token_proceso IS NULL AND bloqueo_proceso_hasta IS NULL AND proxima_revision_en IS NULL AND ((estado = 'CONFIRMADA' AND codigo_http BETWEEN 200 AND 299 AND version_resultante BETWEEN version_esperada AND CAST(version_esperada AS UNSIGNED)+1) OR (estado = 'RECHAZADA' AND codigo_http BETWEEN 400 AND 499)))
    ),
    ADD CONSTRAINT `rec_op_fechas` CHECK (
        actualizado_en >= creado_en AND (proxima_revision_en IS NULL OR proxima_revision_en >= creado_en)
    ),
    ADD CONSTRAINT `rec_op_bloqueo` CHECK (
        (token_proceso IS NULL AND bloqueo_proceso_hasta IS NULL) OR (token_proceso IS NOT NULL AND bloqueo_proceso_hasta IS NOT NULL AND REGEXP_LIKE(token_proceso, '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', 'c') AND bloqueo_proceso_hasta > creado_en)
    ),
    ADD CONSTRAINT `rec_op_incidencia` CHECK (
        ultima_incidencia IS NULL OR (CHAR_LENGTH(TRIM(ultima_incidencia)) > 0 AND NOT REGEXP_LIKE(ultima_incidencia, '[[:cntrl:]]', 'c') AND BINARY ultima_incidencia = BINARY TRIM(ultima_incidencia))
    ),
    ADD CONSTRAINT `rec_op_copia_completa` CHECK (
        (archivo_pedido_clave IS NULL AND archivo_pedido_sha256 IS NULL AND archivo_pedido_formato IS NULL AND archivo_pedido_bytes IS NULL AND archivo_pedido_estado IS NULL AND archivo_pedido_confirmado_en IS NULL) OR (archivo_pedido_clave IS NOT NULL AND archivo_pedido_sha256 IS NOT NULL AND archivo_pedido_formato IS NOT NULL AND archivo_pedido_bytes IS NOT NULL AND archivo_pedido_estado IS NOT NULL AND accion IN ('PROCESAR','REGISTRAR_PEDIDO') AND REGEXP_LIKE(archivo_pedido_sha256, '^[0-9a-f]{64}$', 'c') AND archivo_pedido_formato IN ('image/png','image/jpeg','image/webp') AND archivo_pedido_bytes BETWEEN 1 AND 5242880 AND REGEXP_LIKE(archivo_pedido_clave, '^comprobantes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$', 'c') AND RIGHT(archivo_pedido_clave,CHAR_LENGTH(CASE archivo_pedido_formato WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE '?' END)+1) = CONCAT('.', CASE archivo_pedido_formato WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE '?' END) AND ((archivo_pedido_estado = 'PENDIENTE' AND archivo_pedido_confirmado_en IS NULL) OR (archivo_pedido_estado = 'DISPONIBLE' AND archivo_pedido_confirmado_en IS NOT NULL AND archivo_pedido_confirmado_en >= creado_en)))
    ),
    ADD CONSTRAINT `rec_op_copia_final` CHECK (
        estado <> 'CONFIRMADA' OR archivo_pedido_clave IS NULL OR archivo_pedido_estado = 'DISPONIBLE'
    ),
    ADD CONSTRAINT `rec_op_registro_copia` CHECK (
        accion <> 'REGISTRAR_PEDIDO' OR estado <> 'CONFIRMADA' OR archivo_pedido_clave IS NOT NULL
    );
