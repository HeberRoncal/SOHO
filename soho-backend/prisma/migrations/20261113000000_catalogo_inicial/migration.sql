-- Esquema inicial generado sin conexión. Los CHECK del final son SQL mantenido a mano.
-- Requiere MySQL 8.0.16 o posterior para aplicar los CHECK.

-- CreateTable
CREATE TABLE `marcas` (
    `id` CHAR(36) NOT NULL,
    `codigo` VARCHAR(12) NOT NULL,
    `nombre` VARCHAR(50) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `logotipo` VARCHAR(1024) NULL,
    `alto_logotipo` SMALLINT UNSIGNED NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `marcas_codigo_key`(`codigo`),
    UNIQUE INDEX `marcas_nombre_key`(`nombre`),
    UNIQUE INDEX `marcas_slug_key`(`slug`),
    INDEX `marcas_activa_orden_idx`(`activa`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categorias` (
    `id` CHAR(36) NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `categorias_nombre_key`(`nombre`),
    UNIQUE INDEX `categorias_slug_key`(`slug`),
    INDEX `categorias_activa_orden_idx`(`activa`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `codigo_interno` VARCHAR(32) NOT NULL,
    `codigo_modelo` VARCHAR(60) NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `modelo` VARCHAR(100) NULL,
    `descripcion` VARCHAR(600) NOT NULL DEFAULT '',
    `genero` ENUM('HOMBRE', 'MUJER', 'UNISEX') NOT NULL DEFAULT 'UNISEX',
    `precio` DECIMAL(8, 2) NULL,
    `precio_anterior` DECIMAL(8, 2) NULL,
    `es_novedad` BOOLEAN NOT NULL DEFAULT false,
    `estado` ENUM('BORRADOR', 'PUBLICADO', 'ARCHIVADO') NOT NULL DEFAULT 'BORRADOR',
    `orden_catalogo` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `marca_id` CHAR(36) NULL,
    `categoria_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `productos_slug_key`(`slug`),
    UNIQUE INDEX `productos_codigo_interno_key`(`codigo_interno`),
    UNIQUE INDEX `productos_codigo_modelo_key`(`codigo_modelo`),
    UNIQUE INDEX `productos_nombre_key`(`nombre`),
    INDEX `productos_estado_orden_catalogo_id_idx`(`estado`, `orden_catalogo`, `id`),
    INDEX `productos_estado_precio_id_idx`(`estado`, `precio`, `id`),
    INDEX `productos_estado_genero_orden_catalogo_idx`(`estado`, `genero`, `orden_catalogo`),
    INDEX `productos_estado_es_novedad_orden_catalogo_idx`(`estado`, `es_novedad`, `orden_catalogo`),
    INDEX `productos_marca_id_estado_idx`(`marca_id`, `estado`),
    INDEX `productos_categoria_id_estado_idx`(`categoria_id`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `producto_colores` (
    `id` CHAR(36) NOT NULL,
    `producto_id` CHAR(36) NOT NULL,
    `codigo` CHAR(2) NOT NULL,
    `nombre` VARCHAR(50) NOT NULL,
    `hexadecimal` CHAR(7) NOT NULL,
    `orden` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `producto_colores_producto_id_orden_idx`(`producto_id`, `orden`),
    INDEX `producto_colores_codigo_idx`(`codigo`),
    UNIQUE INDEX `producto_colores_producto_id_codigo_key`(`producto_id`, `codigo`),
    UNIQUE INDEX `producto_colores_producto_id_nombre_key`(`producto_id`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tallas` (
    `id` CHAR(36) NOT NULL,
    `sistema` ENUM('EU') NOT NULL DEFAULT 'EU',
    `valor` DECIMAL(3, 1) NOT NULL,
    `orden` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tallas_sistema_orden_idx`(`sistema`, `orden`),
    UNIQUE INDEX `tallas_sistema_valor_key`(`sistema`, `valor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variantes` (
    `id` CHAR(36) NOT NULL,
    `producto_color_id` CHAR(36) NOT NULL,
    `talla_id` CHAR(36) NOT NULL,
    `sku` VARCHAR(96) NOT NULL,
    `habilitada` BOOLEAN NOT NULL DEFAULT true,
    `existencias` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `cantidad_reservada` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `variantes_sku_key`(`sku`),
    INDEX `variantes_producto_color_id_habilitada_idx`(`producto_color_id`, `habilitada`),
    INDEX `variantes_talla_id_habilitada_idx`(`talla_id`, `habilitada`),
    UNIQUE INDEX `variantes_producto_color_id_talla_id_key`(`producto_color_id`, `talla_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imagenes_producto` (
    `id` CHAR(36) NOT NULL,
    `producto_id` CHAR(36) NOT NULL,
    `ruta` VARCHAR(1024) NOT NULL,
    `texto_alternativo` VARCHAR(160) NOT NULL DEFAULT '',
    `orden` TINYINT UNSIGNED NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `imagenes_producto_producto_id_orden_key`(`producto_id`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imagenes_producto_color` (
    `id` CHAR(36) NOT NULL,
    `producto_color_id` CHAR(36) NOT NULL,
    `ruta` VARCHAR(1024) NOT NULL,
    `texto_alternativo` VARCHAR(160) NOT NULL DEFAULT '',
    `orden` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `imagenes_producto_color_producto_color_id_orden_key`(`producto_color_id`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_inventario` (
    `id` CHAR(36) NOT NULL,
    `variante_id` CHAR(36) NOT NULL,
    `tipo` ENUM('ENTRADA', 'SALIDA', 'AJUSTE') NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `saldo_anterior` INTEGER UNSIGNED NOT NULL,
    `saldo_posterior` INTEGER UNSIGNED NOT NULL,
    `cantidad_reservada` INTEGER UNSIGNED NOT NULL,
    `variante_habilitada` BOOLEAN NOT NULL,
    `motivo` VARCHAR(160) NOT NULL,
    `referencia` VARCHAR(80) NULL,
    `origen` ENUM('MANUAL', 'STOCK_INICIAL') NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimientos_inventario_variante_id_fecha_id_idx`(`variante_id`, `fecha`, `id`),
    INDEX `movimientos_inventario_fecha_id_idx`(`fecha`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_marca_id_fkey` FOREIGN KEY (`marca_id`) REFERENCES `marcas`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_categoria_id_fkey` FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `producto_colores` ADD CONSTRAINT `producto_colores_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `variantes` ADD CONSTRAINT `variantes_producto_color_id_fkey` FOREIGN KEY (`producto_color_id`) REFERENCES `producto_colores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `variantes` ADD CONSTRAINT `variantes_talla_id_fkey` FOREIGN KEY (`talla_id`) REFERENCES `tallas`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `imagenes_producto` ADD CONSTRAINT `imagenes_producto_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `imagenes_producto_color` ADD CONSTRAINT `imagenes_producto_color_producto_color_id_fkey` FOREIGN KEY (`producto_color_id`) REFERENCES `producto_colores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_variante_id_fkey` FOREIGN KEY (`variante_id`) REFERENCES `variantes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reglas de fila no representables en schema.prisma. Conservar en futuras migraciones.
ALTER TABLE `marcas`
    ADD CONSTRAINT `marcas_datos_no_vacios` CHECK (
        CHAR_LENGTH(TRIM(`codigo`)) > 0 AND
        CHAR_LENGTH(TRIM(`nombre`)) > 0 AND
        CHAR_LENGTH(TRIM(`slug`)) > 0
    ),
    ADD CONSTRAINT `marcas_alto_logotipo_positivo` CHECK (
        `alto_logotipo` IS NULL OR `alto_logotipo` > 0
    );

ALTER TABLE `categorias`
    ADD CONSTRAINT `categorias_datos_no_vacios` CHECK (
        CHAR_LENGTH(TRIM(`nombre`)) > 0 AND CHAR_LENGTH(TRIM(`slug`)) > 0
    );

ALTER TABLE `productos`
    ADD CONSTRAINT `productos_datos_no_vacios` CHECK (
        CHAR_LENGTH(TRIM(`nombre`)) > 0 AND
        CHAR_LENGTH(TRIM(`slug`)) > 0 AND
        CHAR_LENGTH(TRIM(`codigo_interno`)) > 0
    ),
    ADD CONSTRAINT `productos_precio_valido` CHECK (
        `precio` IS NULL OR `precio` BETWEEN 0.01 AND 999999.99
    ),
    ADD CONSTRAINT `productos_precio_anterior_valido` CHECK (
        `precio_anterior` IS NULL OR
        (`precio` IS NOT NULL AND `precio_anterior` > `precio`)
    ),
    ADD CONSTRAINT `productos_publicacion_datos_propios` CHECK (
        `estado` <> 'PUBLICADO' OR (
            `precio` IS NOT NULL AND
            `modelo` IS NOT NULL AND CHAR_LENGTH(TRIM(`modelo`)) > 0 AND
            `codigo_modelo` IS NOT NULL AND CHAR_LENGTH(TRIM(`codigo_modelo`)) > 0
        )
    );

ALTER TABLE `producto_colores`
    ADD CONSTRAINT `producto_colores_codigo_valido` CHECK (
        REGEXP_LIKE(`codigo`, '^[A-Z]{2}$', 'c')
    ),
    ADD CONSTRAINT `producto_colores_nombre_no_vacio` CHECK (CHAR_LENGTH(TRIM(`nombre`)) > 0),
    ADD CONSTRAINT `producto_colores_hexadecimal_valido` CHECK (
        REGEXP_LIKE(`hexadecimal`, '^#[0-9a-f]{6}$', 'i')
    );

ALTER TABLE `tallas`
    ADD CONSTRAINT `tallas_eu_rango_actual` CHECK (
        `valor` BETWEEN 35 AND 48 AND MOD(`valor` * 10, 5) = 0
    );

ALTER TABLE `variantes`
    ADD CONSTRAINT `variantes_sku_no_vacio` CHECK (CHAR_LENGTH(TRIM(`sku`)) > 0),
    ADD CONSTRAINT `variantes_saldos_limites` CHECK (
        `existencias` <= 99999 AND `cantidad_reservada` <= 99999
    );

ALTER TABLE `imagenes_producto`
    ADD CONSTRAINT `imagenes_producto_ruta_no_vacia` CHECK (CHAR_LENGTH(TRIM(`ruta`)) > 0),
    ADD CONSTRAINT `imagenes_producto_maximo_ocho` CHECK (`orden` <= 7);

ALTER TABLE `imagenes_producto_color`
    ADD CONSTRAINT `imagenes_producto_color_ruta_no_vacia` CHECK (CHAR_LENGTH(TRIM(`ruta`)) > 0);

ALTER TABLE `movimientos_inventario`
    ADD CONSTRAINT `movimientos_inventario_delta_valido` CHECK (
        `cantidad` BETWEEN -99999 AND 99999 AND `cantidad` <> 0
    ),
    ADD CONSTRAINT `movimientos_inventario_saldos_limites` CHECK (
        `saldo_anterior` <= 99999 AND `saldo_posterior` <= 99999 AND `cantidad_reservada` <= 99999
    ),
    ADD CONSTRAINT `movimientos_inventario_saldo_coherente` CHECK (
        CAST(`saldo_anterior` AS SIGNED) + `cantidad` = CAST(`saldo_posterior` AS SIGNED)
    ),
    ADD CONSTRAINT `movimientos_inventario_tipo_coherente` CHECK (
        (`tipo` = 'ENTRADA' AND `cantidad` > 0) OR
        (`tipo` = 'SALIDA' AND `cantidad` < 0) OR
        `tipo` = 'AJUSTE'
    ),
    ADD CONSTRAINT `movimientos_inventario_origen_coherente` CHECK (
        `origen` <> 'STOCK_INICIAL' OR (`tipo` = 'ENTRADA' AND `saldo_anterior` = 0)
    ),
    ADD CONSTRAINT `movimientos_inventario_motivo_no_vacio` CHECK (CHAR_LENGTH(TRIM(`motivo`)) > 0);
