-- Sexta migración aditiva: núcleo de pedidos, pagos manuales y reservas.
-- No modifica filas ni columnas de las quince tablas anteriores.
-- Los CHECK y el índice funcional son SQL manual no representado por Prisma.

-- CreateTable
CREATE TABLE `pedidos` (
    `id` CHAR(36) NOT NULL,
    `codigo` VARCHAR(32) NOT NULL,
    `usuario_id` CHAR(36) NULL,
    `clave_creacion` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `acceso_invitado_hash` CHAR(64) NULL,
    `acceso_invitado_expira_en` DATETIME(3) NULL,
    `nombres` VARCHAR(80) NOT NULL,
    `apellidos` VARCHAR(80) NOT NULL,
    `correo` VARCHAR(254) NOT NULL,
    `destinatario` VARCHAR(140) NOT NULL,
    `celular` VARCHAR(9) NOT NULL,
    `distrito_codigo` VARCHAR(80) NOT NULL,
    `distrito_nombre` VARCHAR(80) NOT NULL,
    `provincia` VARCHAR(80) NOT NULL DEFAULT 'Trujillo',
    `departamento` VARCHAR(80) NOT NULL DEFAULT 'La Libertad',
    `direccion` VARCHAR(180) NOT NULL,
    `referencia` VARCHAR(200) NOT NULL DEFAULT '',
    `plazo_entrega` VARCHAR(80) NULL,
    `moneda` ENUM('PEN') NOT NULL DEFAULT 'PEN',
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `descuento` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cupon_codigo` VARCHAR(40) NULL,
    `costo_envio` DECIMAL(8, 2) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,
    `estado_entrega` ENUM('PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 'INCIDENCIA', 'ENVIADO', 'ENTREGADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pedidos_codigo_key`(`codigo`),
    UNIQUE INDEX `pedidos_clave_creacion_key`(`clave_creacion`),
    UNIQUE INDEX `pedidos_acceso_invitado_hash_key`(`acceso_invitado_hash`),
    INDEX `pedidos_usuario_id_creado_en_id_idx`(`usuario_id`, `creado_en`, `id`),
    INDEX `pedidos_estado_entrega_creado_en_id_idx`(`estado_entrega`, `creado_en`, `id`),
    INDEX `pedidos_correo_creado_en_id_idx`(`correo`, `creado_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedido_articulos` (
    `id` CHAR(36) NOT NULL,
    `pedido_id` CHAR(36) NOT NULL,
    `variante_id` CHAR(36) NOT NULL,
    `orden` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `sku` VARCHAR(96) NOT NULL,
    `nombre_producto` VARCHAR(120) NOT NULL,
    `color` VARCHAR(50) NOT NULL,
    `sistema_talla` ENUM('EU') NOT NULL DEFAULT 'EU',
    `talla` DECIMAL(3, 1) NOT NULL,
    `imagen` VARCHAR(1024) NOT NULL,
    `cantidad` INTEGER UNSIGNED NOT NULL,
    `precio_unitario` DECIMAL(8, 2) NOT NULL,
    `importe_bruto` DECIMAL(14, 2) NOT NULL,
    `descuento` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `importe_neto` DECIMAL(14, 2) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pedido_articulos_variante_id_idx`(`variante_id`),
    UNIQUE INDEX `pedido_articulos_pedido_id_variante_id_key`(`pedido_id`, `variante_id`),
    UNIQUE INDEX `pedido_articulos_pedido_id_orden_key`(`pedido_id`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedido_articulo_unidades` (
    `id` CHAR(36) NOT NULL,
    `pedido_articulo_id` CHAR(36) NOT NULL,
    `numero` INTEGER UNSIGNED NOT NULL,
    `importe_bruto` DECIMAL(8, 2) NOT NULL,
    `descuento` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `importe_neto` DECIMAL(8, 2) NOT NULL,

    UNIQUE INDEX `pedido_articulo_unidades_pedido_articulo_id_numero_key`(`pedido_articulo_id`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedido_facturacion` (
    `id` CHAR(36) NOT NULL,
    `pedido_id` CHAR(36) NOT NULL,
    `tipo` ENUM('BOLETA', 'FACTURA') NOT NULL,
    `tipo_documento` ENUM('DNI', 'CE', 'PAS', 'RUC') NOT NULL,
    `numero_documento` VARCHAR(12) NOT NULL,
    `razon_social` VARCHAR(160) NULL,
    `domicilio_fiscal` VARCHAR(180) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pedido_facturacion_pedido_id_key`(`pedido_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos_pedido` (
    `id` CHAR(36) NOT NULL,
    `pedido_id` CHAR(36) NOT NULL,
    `metodo` ENUM('YAPE', 'PLIN') NOT NULL,
    `estado` ENUM('PENDIENTE', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO') NOT NULL DEFAULT 'PENDIENTE',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pagos_pedido_pedido_id_key`(`pedido_id`),
    INDEX `pagos_pedido_estado_creado_en_id_idx`(`estado`, `creado_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comprobantes_pago` (
    `id` CHAR(36) NOT NULL,
    `pago_id` CHAR(36) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL,
    `archivo_clave` VARCHAR(255) NOT NULL,
    `archivo_sha256` CHAR(64) NOT NULL,
    `nombre_archivo` VARCHAR(255) NOT NULL,
    `formato` VARCHAR(32) NOT NULL,
    `tamano_bytes` INTEGER UNSIGNED NOT NULL,
    `numero_operacion` VARCHAR(12) NULL,
    `monto_informado` DECIMAL(14, 2) NULL,
    `estado_revision` ENUM('PENDIENTE', 'OBSERVADO', 'APROBADO', 'RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    `motivo` ENUM('ILEGIBLE', 'MONTO', 'INGRESO', 'DATOS', 'OTRO') NULL,
    `mensaje` VARCHAR(500) NULL,
    `solicitud_correccion` ENUM('LEGIBLE', 'CORREGIDO') NULL,
    `revisado_por_id` CHAR(36) NULL,
    `revisado_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `comprobantes_pago_archivo_clave_key`(`archivo_clave`),
    INDEX `comprobantes_pago_revisado_por_id_revisado_en_idx`(`revisado_por_id`, `revisado_en`),
    UNIQUE INDEX `comprobantes_pago_pago_id_version_key`(`pago_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_reserva` (
    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `modo` ENUM('HASTA_DECISION', 'TIEMPO') NOT NULL DEFAULT 'HASTA_DECISION',
    `horas` INTEGER UNSIGNED NULL,
    `accion_vencimiento` ENUM('LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR') NULL,
    `accion_cancelacion` ENUM('LIBERAR', 'PREGUNTAR') NOT NULL DEFAULT 'LIBERAR',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `actualizado_por_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `configuracion_reserva_actualizado_por_id_idx`(`actualizado_por_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservas_inventario` (
    `id` CHAR(36) NOT NULL,
    `pedido_articulo_id` CHAR(36) NOT NULL,
    `cantidad` INTEGER UNSIGNED NOT NULL,
    `estado` ENUM('ACTIVA', 'LIBERADA', 'CONSUMIDA') NOT NULL DEFAULT 'ACTIVA',
    `configuracion_id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `configuracion_version` INTEGER UNSIGNED NOT NULL,
    `modo` ENUM('HASTA_DECISION', 'TIEMPO') NOT NULL,
    `horas` INTEGER UNSIGNED NULL,
    `accion_vencimiento` ENUM('LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR') NULL,
    `accion_cancelacion` ENUM('LIBERAR', 'PREGUNTAR') NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `vence_en` DATETIME(3) NULL,
    `vencimiento_atendido_en` DATETIME(3) NULL,
    `cerrada_en` DATETIME(3) NULL,
    `motivo_cierre` VARCHAR(160) NULL,

    INDEX `reservas_inventario_pedido_articulo_id_creado_en_id_idx`(`pedido_articulo_id`, `creado_en`, `id`),
    INDEX `reservas_inventario_estado_vence_en_id_idx`(`estado`, `vence_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos_pedido` (
    `id` CHAR(36) NOT NULL,
    `pedido_id` CHAR(36) NOT NULL,
    `secuencia` INTEGER UNSIGNED NOT NULL,
    `version_pedido` INTEGER UNSIGNED NOT NULL,
    `tipo` ENUM('CREADO', 'COMPROBANTE_ADJUNTADO', 'PAGO_APROBADO', 'PAGO_OBSERVADO', 'PAGO_RECHAZADO', 'PAGO_ANULADO', 'RESERVA_CREADA', 'RESERVA_LIBERADA', 'RESERVA_CONSUMIDA', 'RESERVA_VENCIDA', 'ENTREGA_CAMBIADA', 'NOTA_INTERNA') NOT NULL,
    `actor` ENUM('SISTEMA', 'CLIENTE', 'ADMIN') NOT NULL,
    `responsable_id` CHAR(36) NULL,
    `visibilidad` ENUM('CLIENTE', 'INTERNA') NOT NULL DEFAULT 'INTERNA',
    `titulo` VARCHAR(120) NOT NULL,
    `descripcion` VARCHAR(1000) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `eventos_pedido_pedido_id_fecha_id_idx`(`pedido_id`, `fecha`, `id`),
    INDEX `eventos_pedido_responsable_id_fecha_id_idx`(`responsable_id`, `fecha`, `id`),
    UNIQUE INDEX `eventos_pedido_pedido_id_secuencia_key`(`pedido_id`, `secuencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pedido_articulos` ADD CONSTRAINT `pedido_articulos_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pedido_articulos` ADD CONSTRAINT `pedido_articulos_variante_id_fkey` FOREIGN KEY (`variante_id`) REFERENCES `variantes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pedido_articulo_unidades` ADD CONSTRAINT `pedido_articulo_unidades_pedido_articulo_id_fkey` FOREIGN KEY (`pedido_articulo_id`) REFERENCES `pedido_articulos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pedido_facturacion` ADD CONSTRAINT `pedido_facturacion_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pagos_pedido` ADD CONSTRAINT `pagos_pedido_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `comprobantes_pago` ADD CONSTRAINT `comprobantes_pago_pago_id_fkey` FOREIGN KEY (`pago_id`) REFERENCES `pagos_pedido`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `comprobantes_pago` ADD CONSTRAINT `comprobantes_pago_revisado_por_id_fkey` FOREIGN KEY (`revisado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `configuracion_reserva` ADD CONSTRAINT `configuracion_reserva_actualizado_por_id_fkey` FOREIGN KEY (`actualizado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `reservas_inventario` ADD CONSTRAINT `reservas_inventario_pedido_articulo_id_fkey` FOREIGN KEY (`pedido_articulo_id`) REFERENCES `pedido_articulos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `reservas_inventario` ADD CONSTRAINT `reservas_inventario_configuracion_id_fkey` FOREIGN KEY (`configuracion_id`) REFERENCES `configuracion_reserva`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `eventos_pedido` ADD CONSTRAINT `eventos_pedido_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `eventos_pedido` ADD CONSTRAINT `eventos_pedido_responsable_id_fkey` FOREIGN KEY (`responsable_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `pedidos`
    ADD CONSTRAINT `pedidos_codigo_formato` CHECK (
        REGEXP_LIKE(`codigo`, '^SOHO-[A-Z0-9]{6,24}$', 'c') AND
        NOT REGEXP_LIKE(`codigo`, '[^A-Z0-9-]', 'c')
    ),
    ADD CONSTRAINT `pedidos_creacion_valida` CHECK (
        REGEXP_LIKE(`clave_creacion`, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c') AND
        NOT REGEXP_LIKE(`clave_creacion`, '[^0-9a-f-]', 'c') AND
        REGEXP_LIKE(`solicitud_hash`, '^[0-9a-f]{64}$', 'c') AND
        NOT REGEXP_LIKE(`solicitud_hash`, '[^0-9a-f]', 'c')
    ),
    ADD CONSTRAINT `pedidos_propiedad_acceso` CHECK (
        (`usuario_id` IS NOT NULL AND `acceso_invitado_hash` IS NULL AND `acceso_invitado_expira_en` IS NULL) OR
        (`usuario_id` IS NULL AND `acceso_invitado_hash` IS NOT NULL AND `acceso_invitado_expira_en` IS NOT NULL AND
         REGEXP_LIKE(`acceso_invitado_hash`, '^[0-9a-f]{64}$', 'c') AND
         NOT REGEXP_LIKE(`acceso_invitado_hash`, '[^0-9a-f]', 'c') AND `acceso_invitado_expira_en` > `creado_en`)
    ),
    ADD CONSTRAINT `pedidos_contacto_valido` CHECK (
        CHAR_LENGTH(TRIM(`nombres`)) >= 2 AND CHAR_LENGTH(TRIM(`apellidos`)) >= 2 AND
        CHAR_LENGTH(TRIM(`destinatario`)) >= 2 AND
        REGEXP_LIKE(`correo`, '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$', 'c') AND
        REGEXP_LIKE(`celular`, '^9[0-9]{8}$', 'c') AND NOT REGEXP_LIKE(`celular`, '[^0-9]', 'c') AND
        NOT REGEXP_LIKE(CONCAT(`nombres`,`apellidos`,`destinatario`,`correo`), '[[:cntrl:]]', 'c')
    ),
    ADD CONSTRAINT `pedidos_domicilio_valido` CHECK (
        REGEXP_LIKE(`distrito_codigo`, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c') AND
        NOT REGEXP_LIKE(`distrito_codigo`, '[^a-z0-9-]', 'c') AND
        CHAR_LENGTH(TRIM(`distrito_nombre`)) >= 2 AND CHAR_LENGTH(TRIM(`provincia`)) >= 2 AND
        CHAR_LENGTH(TRIM(`departamento`)) >= 2 AND CHAR_LENGTH(TRIM(`direccion`)) >= 6 AND
        NOT REGEXP_LIKE(CONCAT(`distrito_nombre`,`provincia`,`departamento`,`direccion`), '[[:cntrl:]]', 'c') AND
        NOT REGEXP_LIKE(REPLACE(REPLACE(`referencia`, CHAR(13), ''), CHAR(10), ''), '[[:cntrl:]]', 'c') AND
        (`plazo_entrega` IS NULL OR (CHAR_LENGTH(TRIM(`plazo_entrega`)) > 0 AND NOT REGEXP_LIKE(`plazo_entrega`, '[[:cntrl:]]', 'c')))
    ),
    ADD CONSTRAINT `pedidos_importes_coherentes` CHECK (
        `subtotal` > 0 AND `descuento` >= 0 AND `descuento` <= `subtotal` AND `costo_envio` >= 0 AND
        `total` = `subtotal` - `descuento` + `costo_envio` AND
        (`distrito_codigo` <> 'la-esperanza' OR `costo_envio` = 0)
    ),
    ADD CONSTRAINT `pedidos_cupon_valido` CHECK (
        `cupon_codigo` IS NULL OR (CHAR_LENGTH(TRIM(`cupon_codigo`)) > 0 AND NOT REGEXP_LIKE(`cupon_codigo`, '[[:cntrl:]]', 'c'))
    ),
    ADD CONSTRAINT `pedidos_version_positiva` CHECK (`version` >= 1);

ALTER TABLE `pedido_articulos`
    ADD CONSTRAINT `pedido_articulos_identidad_valida` CHECK (
        CHAR_LENGTH(TRIM(`sku`)) > 0 AND CHAR_LENGTH(TRIM(`nombre_producto`)) > 0 AND
        CHAR_LENGTH(TRIM(`color`)) > 0 AND CHAR_LENGTH(TRIM(`imagen`)) > 0 AND
        NOT REGEXP_LIKE(CONCAT(`sku`,`nombre_producto`,`color`,`imagen`), '[[:cntrl:]]', 'c') AND
        `talla` BETWEEN 35 AND 48 AND MOD(`talla` * 2, 1) = 0
    ),
    ADD CONSTRAINT `pedido_articulos_cantidad_valida` CHECK (`cantidad` BETWEEN 1 AND 99999),
    ADD CONSTRAINT `pedido_articulos_importes_coherentes` CHECK (
        `precio_unitario` > 0 AND `importe_bruto` = `precio_unitario` * `cantidad` AND
        `descuento` >= 0 AND `descuento` <= `importe_bruto` AND `importe_neto` = `importe_bruto` - `descuento`
    );

ALTER TABLE `pedido_articulo_unidades`
    ADD CONSTRAINT `pedido_unidades_numero_valido` CHECK (`numero` BETWEEN 1 AND 99999),
    ADD CONSTRAINT `pedido_unidades_importes_coherentes` CHECK (
        `importe_bruto` > 0 AND `descuento` >= 0 AND `descuento` <= `importe_bruto` AND
        `importe_neto` = `importe_bruto` - `descuento`
    );

ALTER TABLE `pedido_facturacion`
    ADD CONSTRAINT `pedido_facturacion_documento_coherente` CHECK (
        (`tipo` = 'BOLETA' AND `razon_social` IS NULL AND `domicilio_fiscal` IS NULL AND (
            (`tipo_documento` = 'DNI' AND REGEXP_LIKE(`numero_documento`, '^[0-9]{8}$', 'c') AND NOT REGEXP_LIKE(`numero_documento`, '[^0-9]', 'c')) OR
            (`tipo_documento` = 'CE' AND REGEXP_LIKE(`numero_documento`, '^[A-Za-z0-9]{9,12}$', 'c') AND NOT REGEXP_LIKE(`numero_documento`, '[^A-Za-z0-9]', 'c')) OR
            (`tipo_documento` = 'PAS' AND REGEXP_LIKE(`numero_documento`, '^[A-Za-z0-9]{6,12}$', 'c') AND NOT REGEXP_LIKE(`numero_documento`, '[^A-Za-z0-9]', 'c'))
        )) OR
        (`tipo` = 'FACTURA' AND `tipo_documento` = 'RUC' AND
         REGEXP_LIKE(`numero_documento`, '^(10|15|17|20)[0-9]{9}$', 'c') AND NOT REGEXP_LIKE(`numero_documento`, '[^0-9]', 'c') AND
         `razon_social` IS NOT NULL AND `domicilio_fiscal` IS NOT NULL AND
         CHAR_LENGTH(TRIM(`razon_social`)) >= 3 AND CHAR_LENGTH(TRIM(`domicilio_fiscal`)) >= 6 AND
         NOT REGEXP_LIKE(CONCAT(`razon_social`,`domicilio_fiscal`), '[[:cntrl:]]', 'c'))
    );

ALTER TABLE `pagos_pedido`
    ADD CONSTRAINT `pagos_pedido_version_positiva` CHECK (`version` >= 1);

ALTER TABLE `comprobantes_pago`
    ADD CONSTRAINT `comprobantes_archivo_valido` CHECK (
        REGEXP_LIKE(`archivo_clave`, '^comprobantes/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*[.](png|jpg|jpeg|webp)$', 'c') AND
        NOT REGEXP_LIKE(`archivo_clave`, '[[:cntrl:]]', 'c') AND
        REGEXP_LIKE(`archivo_sha256`, '^[0-9a-f]{64}$', 'c') AND NOT REGEXP_LIKE(`archivo_sha256`, '[^0-9a-f]', 'c') AND
        CHAR_LENGTH(TRIM(`nombre_archivo`)) > 0 AND NOT REGEXP_LIKE(`nombre_archivo`, '[[:cntrl:]]', 'c') AND
        REGEXP_LIKE(`formato`, '^image/(png|jpeg|webp)$', 'c') AND NOT REGEXP_LIKE(`formato`, '[[:cntrl:]]', 'c') AND
        `tamano_bytes` BETWEEN 1 AND 5242880
    ),
    ADD CONSTRAINT `comprobantes_operacion_valida` CHECK (
        `numero_operacion` IS NULL OR (REGEXP_LIKE(`numero_operacion`, '^[0-9]{1,12}$', 'c') AND NOT REGEXP_LIKE(`numero_operacion`, '[^0-9]', 'c'))
    ),
    ADD CONSTRAINT `comprobantes_monto_valido` CHECK (`monto_informado` IS NULL OR `monto_informado` >= 0),
    ADD CONSTRAINT `comprobantes_version_positiva` CHECK (`version` >= 1),
    ADD CONSTRAINT `comprobantes_revision_coherente` CHECK (
        (`estado_revision` = 'PENDIENTE' AND `revisado_por_id` IS NULL AND `revisado_en` IS NULL AND `motivo` IS NULL AND `mensaje` IS NULL AND `solicitud_correccion` IS NULL) OR
        (`estado_revision` <> 'PENDIENTE' AND `revisado_por_id` IS NOT NULL AND `revisado_en` IS NOT NULL AND `revisado_en` >= `creado_en` AND (
            (`estado_revision` = 'APROBADO' AND `motivo` IS NULL AND `mensaje` IS NULL AND `solicitud_correccion` IS NULL) OR
            (`estado_revision` IN ('OBSERVADO','RECHAZADO') AND `motivo` IS NOT NULL AND `mensaje` IS NOT NULL AND
             CHAR_LENGTH(TRIM(`mensaje`)) >= 10 AND NOT REGEXP_LIKE(`mensaje`, '[[:cntrl:]]', 'c') AND (
                (`estado_revision` = 'OBSERVADO' AND `solicitud_correccion` IS NOT NULL) OR
                (`estado_revision` = 'RECHAZADO' AND `solicitud_correccion` IS NULL)
             ))
        ))
    );

ALTER TABLE `configuracion_reserva`
    ADD CONSTRAINT `configuracion_reserva_unica` CHECK (`id` = 1),
    ADD CONSTRAINT `configuracion_reserva_version_positiva` CHECK (`version` >= 1),
    ADD CONSTRAINT `configuracion_reserva_politica_coherente` CHECK (
        (`modo` = 'HASTA_DECISION' AND `horas` IS NULL AND `accion_vencimiento` IS NULL) OR
        (`modo` = 'TIEMPO' AND `horas` IS NOT NULL AND `horas` BETWEEN 1 AND 999999 AND `accion_vencimiento` IS NOT NULL)
    );

ALTER TABLE `reservas_inventario`
    ADD CONSTRAINT `reservas_cantidad_valida` CHECK (`cantidad` BETWEEN 1 AND 99999),
    ADD CONSTRAINT `reservas_configuracion_version_positiva` CHECK (`configuracion_version` >= 1),
    ADD CONSTRAINT `reservas_politica_coherente` CHECK (
        (`modo` = 'HASTA_DECISION' AND `horas` IS NULL AND `accion_vencimiento` IS NULL AND `vence_en` IS NULL) OR
        (`modo` = 'TIEMPO' AND `horas` IS NOT NULL AND `horas` BETWEEN 1 AND 999999 AND `accion_vencimiento` IS NOT NULL AND
         `vence_en` IS NOT NULL AND `vence_en` = DATE_ADD(`creado_en`, INTERVAL `horas` HOUR))
    ),
    ADD CONSTRAINT `reservas_cierre_coherente` CHECK (
        (`estado` = 'ACTIVA' AND `cerrada_en` IS NULL AND `motivo_cierre` IS NULL) OR
        (`estado` IN ('LIBERADA','CONSUMIDA') AND `cerrada_en` IS NOT NULL AND `cerrada_en` >= `creado_en` AND
         `motivo_cierre` IS NOT NULL AND CHAR_LENGTH(TRIM(`motivo_cierre`)) >= 2 AND NOT REGEXP_LIKE(`motivo_cierre`, '[[:cntrl:]]', 'c'))
    ),
    ADD CONSTRAINT `reservas_atencion_vencimiento_coherente` CHECK (
        `vencimiento_atendido_en` IS NULL OR (`vence_en` IS NOT NULL AND `vencimiento_atendido_en` >= `vence_en`)
    );

-- Una sola ACTIVA por línea; permite conservar múltiples reservas anteriores cerradas.
CREATE UNIQUE INDEX `reservas_una_activa_por_articulo_key`
    ON `reservas_inventario` ((CASE WHEN `estado` = 'ACTIVA' THEN `pedido_articulo_id` ELSE NULL END));

ALTER TABLE `eventos_pedido`
    ADD CONSTRAINT `eventos_pedido_secuencia_positiva` CHECK (`secuencia` >= 1 AND `version_pedido` >= 1),
    ADD CONSTRAINT `eventos_pedido_actor_coherente` CHECK (
        (`actor` = 'SISTEMA' AND `responsable_id` IS NULL) OR
        (`actor` IN ('CLIENTE','ADMIN') AND `responsable_id` IS NOT NULL)
    ),
    ADD CONSTRAINT `eventos_pedido_contenido_valido` CHECK (
        CHAR_LENGTH(TRIM(`titulo`)) > 0 AND CHAR_LENGTH(TRIM(`descripcion`)) > 0 AND
        NOT REGEXP_LIKE(`titulo`, '[[:cntrl:]]', 'c') AND
        NOT REGEXP_LIKE(REPLACE(REPLACE(`descripcion`, CHAR(13), ''), CHAR(10), ''), '[[:cntrl:]]', 'c')
    ),
    ADD CONSTRAINT `eventos_pedido_nota_interna` CHECK (`tipo` <> 'NOTA_INTERNA' OR `visibilidad` = 'INTERNA');

-- Política inicial del frontend: hasta decisión administrativa, liberación al cancelar.
-- No crea pedidos, archivos, reservas ni movimientos; no modifica la cobertura existente.
INSERT INTO `configuracion_reserva` (`id`) VALUES (1);
