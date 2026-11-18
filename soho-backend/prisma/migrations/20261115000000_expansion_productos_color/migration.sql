-- Novena migracion: ampliacion compatible, sin convertir ni dividir productos.
-- Conserva columnas, referencias, CHECK y datos de las ocho migraciones anteriores.
-- Las tablas nuevas quedan vacias; el contador se inicializara durante la conversion revisada.
-- AlterTable
ALTER TABLE `productos` ADD COLUMN `actualizado_por_id` CHAR(36) NULL,
    ADD COLUMN `carpeta_imagenes` VARCHAR(512) NULL,
    ADD COLUMN `codigo_color` CHAR(2) NULL,
    ADD COLUMN `color_hexadecimal` CHAR(7) NULL,
    ADD COLUMN `color_nombre` VARCHAR(50) NULL,
    ADD COLUMN `creado_por_id` CHAR(36) NULL,
    ADD COLUMN `grupo_modelo_id` CHAR(36) NULL,
    ADD COLUMN `orden_color` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `version` INTEGER UNSIGNED NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `variantes` ADD COLUMN `producto_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `imagenes_producto` ADD COLUMN `archivo_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `pedido_articulos` ADD COLUMN `archivo_imagen_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `grupos_modelo` (
    `id` CHAR(36) NOT NULL,
    `marca_id` CHAR(36) NULL,
    `codigo_modelo` VARCHAR(60) NULL,
    `modelo` VARCHAR(100) NULL,
    `slug_carpeta` VARCHAR(160) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `creado_por_id` CHAR(36) NULL,
    `actualizado_por_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `grupos_modelo_slug_carpeta_key`(`slug_carpeta`),
    INDEX `grupos_modelo_creado_por_id_idx`(`creado_por_id`),
    INDEX `grupos_modelo_actualizado_por_id_idx`(`actualizado_por_id`),
    UNIQUE INDEX `grupos_modelo_marca_id_codigo_modelo_key`(`marca_id`, `codigo_modelo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archivos_imagen` (
    `id` CHAR(36) NOT NULL,
    `producto_origen_id` CHAR(36) NOT NULL,
    `proveedor` ENUM('LEGADO', 'CLOUDINARY') NOT NULL DEFAULT 'CLOUDINARY',
    `estado` ENUM('PENDIENTE', 'CONCILIANDO', 'DISPONIBLE', 'FALLIDO', 'ELIMINANDO', 'ELIMINADO') NOT NULL DEFAULT 'PENDIENTE',
    `clave_carga` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `hash_contenido` CHAR(64) NULL,
    `cloud_name` VARCHAR(80) NULL,
    `asset_id` VARCHAR(128) NULL,
    `public_id` VARCHAR(255) NULL,
    `version_cloudinary` BIGINT UNSIGNED NULL,
    `resource_type` VARCHAR(16) NULL,
    `delivery_type` VARCHAR(24) NULL,
    `url_entrega` VARCHAR(1024) NULL,
    `carpeta_cloudinary` VARCHAR(512) NULL,
    `nombre_original` VARCHAR(255) NULL,
    `formato` VARCHAR(16) NULL,
    `ancho` INTEGER UNSIGNED NULL,
    `alto` INTEGER UNSIGNED NULL,
    `bytes` INTEGER UNSIGNED NULL,
    `creado_por_id` CHAR(36) NULL,
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

    UNIQUE INDEX `archivos_imagen_clave_carga_key`(`clave_carga`),
    INDEX `archivos_imagen_producto_origen_id_estado_creado_en_idx`(`producto_origen_id`, `estado`, `creado_en`),
    INDEX `archivos_imagen_estado_proxima_revision_en_bloqueo_carga_has_idx`(`estado`, `proxima_revision_en`, `bloqueo_carga_hasta`),
    INDEX `archivos_imagen_estado_limpiar_desde_bloqueo_limpieza_hasta_idx`(`estado`, `limpiar_desde`, `bloqueo_limpieza_hasta`),
    INDEX `archivos_imagen_creado_por_id_idx`(`creado_por_id`),
    UNIQUE INDEX `archivos_imagen_id_producto_origen_id_key`(`id`, `producto_origen_id`),
    UNIQUE INDEX `archivos_imagen_cloud_name_asset_id_key`(`cloud_name`, `asset_id`),
    UNIQUE INDEX `archivos_imagen_cloud_name_public_id_resource_type_delivery__key`(`cloud_name`, `public_id`, `resource_type`, `delivery_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_producto` (
    `id` CHAR(36) NOT NULL,
    `clave_solicitud` CHAR(36) NOT NULL,
    `solicitud_hash` CHAR(64) NOT NULL,
    `producto_id` CHAR(36) NOT NULL,
    `usuario_responsable_id` CHAR(36) NOT NULL,
    `tipo` ENUM('CREAR', 'ACTUALIZAR', 'PUBLICAR', 'ARCHIVAR', 'RESTAURAR', 'AGREGAR_VARIANTES', 'ACTUALIZAR_GALERIA') NOT NULL,
    `version_anterior` INTEGER UNSIGNED NULL,
    `version_posterior` INTEGER UNSIGNED NOT NULL,
    `antes` JSON NULL,
    `despues` JSON NOT NULL,
    `respuesta` JSON NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `operaciones_producto_clave_solicitud_key`(`clave_solicitud`),
    INDEX `operaciones_producto_producto_id_creado_en_id_idx`(`producto_id`, `creado_en`, `id`),
    INDEX `operaciones_producto_usuario_responsable_id_creado_en_id_idx`(`usuario_responsable_id`, `creado_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `secuencia_codigo_producto` (
    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `ultimo_numero` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alias_producto` (
    `id` CHAR(36) NOT NULL,
    `slug_anterior` VARCHAR(160) NOT NULL,
    `codigo_color` VARCHAR(2) NOT NULL DEFAULT '',
    `producto_destino_id` CHAR(36) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `alias_producto_producto_destino_id_idx`(`producto_destino_id`),
    UNIQUE INDEX `alias_producto_slug_anterior_codigo_color_key`(`slug_anterior`, `codigo_color`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `productos_carpeta_imagenes_key` ON `productos`(`carpeta_imagenes`);

-- CreateIndex
CREATE INDEX `productos_grupo_modelo_id_orden_color_id_idx` ON `productos`(`grupo_modelo_id`, `orden_color`, `id`);

-- CreateIndex
CREATE INDEX `productos_creado_por_id_idx` ON `productos`(`creado_por_id`);

-- CreateIndex
CREATE INDEX `productos_actualizado_por_id_idx` ON `productos`(`actualizado_por_id`);

-- CreateIndex
CREATE UNIQUE INDEX `productos_grupo_modelo_id_codigo_color_key` ON `productos`(`grupo_modelo_id`, `codigo_color`);

-- CreateIndex
CREATE INDEX `variantes_producto_id_habilitada_idx` ON `variantes`(`producto_id`, `habilitada`);

-- CreateIndex
CREATE UNIQUE INDEX `variantes_producto_id_talla_id_key` ON `variantes`(`producto_id`, `talla_id`);

-- CreateIndex
CREATE INDEX `imagenes_producto_archivo_id_producto_id_idx` ON `imagenes_producto`(`archivo_id`, `producto_id`);

-- CreateIndex
CREATE UNIQUE INDEX `imagenes_producto_producto_id_archivo_id_key` ON `imagenes_producto`(`producto_id`, `archivo_id`);

-- CreateIndex
CREATE INDEX `pedido_articulos_archivo_imagen_id_idx` ON `pedido_articulos`(`archivo_imagen_id`);

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_grupo_modelo_id_fkey` FOREIGN KEY (`grupo_modelo_id`) REFERENCES `grupos_modelo`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_actualizado_por_id_fkey` FOREIGN KEY (`actualizado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `variantes` ADD CONSTRAINT `variantes_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `imagenes_producto` ADD CONSTRAINT `imagenes_producto_archivo_id_producto_id_fkey` FOREIGN KEY (`archivo_id`, `producto_id`) REFERENCES `archivos_imagen`(`id`, `producto_origen_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `pedido_articulos` ADD CONSTRAINT `pedido_articulos_archivo_imagen_id_fkey` FOREIGN KEY (`archivo_imagen_id`) REFERENCES `archivos_imagen`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `grupos_modelo` ADD CONSTRAINT `grupos_modelo_marca_id_fkey` FOREIGN KEY (`marca_id`) REFERENCES `marcas`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `grupos_modelo` ADD CONSTRAINT `grupos_modelo_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `grupos_modelo` ADD CONSTRAINT `grupos_modelo_actualizado_por_id_fkey` FOREIGN KEY (`actualizado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `archivos_imagen` ADD CONSTRAINT `archivos_imagen_producto_origen_id_fkey` FOREIGN KEY (`producto_origen_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `archivos_imagen` ADD CONSTRAINT `archivos_imagen_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operaciones_producto` ADD CONSTRAINT `operaciones_producto_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operaciones_producto` ADD CONSTRAINT `operaciones_producto_usuario_responsable_id_fkey` FOREIGN KEY (`usuario_responsable_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `alias_producto` ADD CONSTRAINT `alias_producto_producto_destino_id_fkey` FOREIGN KEY (`producto_destino_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Las reglas entre tablas (publicacion, autorizacion y limpieza sin referencias)
-- se comprobaran transaccionalmente en sus futuras operaciones.
ALTER TABLE `productos`
  ADD CONSTRAINT `productos_color_codigo_futuro` CHECK (`codigo_color` IS NULL OR REGEXP_LIKE(`codigo_color`, '^[A-Z]{2}$', 'c')),
  ADD CONSTRAINT `productos_color_nombre_futuro` CHECK (`color_nombre` IS NULL OR CHAR_LENGTH(TRIM(`color_nombre`)) > 0),
  ADD CONSTRAINT `productos_color_hex_futuro` CHECK (`color_hexadecimal` IS NULL OR REGEXP_LIKE(`color_hexadecimal`, '^#[0-9A-Fa-f]{6}$', 'c')),
  ADD CONSTRAINT `productos_carpeta_futura` CHECK (`carpeta_imagenes` IS NULL OR CHAR_LENGTH(TRIM(`carpeta_imagenes`)) > 0),
  ADD CONSTRAINT `productos_version_positiva` CHECK (`version` >= 1);

ALTER TABLE `grupos_modelo`
  ADD CONSTRAINT `grupos_modelo_codigo_valido` CHECK (`codigo_modelo` IS NULL OR REGEXP_LIKE(`codigo_modelo`, '^[A-Z0-9]+$', 'c')),
  ADD CONSTRAINT `grupos_modelo_nombre_valido` CHECK (`modelo` IS NULL OR CHAR_LENGTH(TRIM(`modelo`)) > 0),
  ADD CONSTRAINT `grupos_modelo_carpeta_valida` CHECK (REGEXP_LIKE(`slug_carpeta`, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c')),
  ADD CONSTRAINT `grupos_modelo_version_positiva` CHECK (`version` >= 1);

ALTER TABLE `archivos_imagen`
  ADD CONSTRAINT `archivos_imagen_hashes_validos` CHECK (
    REGEXP_LIKE(`solicitud_hash`, '^[0-9a-f]{64}$', 'c') AND
    (`hash_contenido` IS NULL OR REGEXP_LIKE(`hash_contenido`, '^[0-9a-f]{64}$', 'c'))
  ),
  ADD CONSTRAINT `archivos_imagen_proveedor_coherente` CHECK (
    (`proveedor` = 'LEGADO' AND `estado` = 'DISPONIBLE' AND
      `url_entrega` IS NOT NULL AND CHAR_LENGTH(TRIM(`url_entrega`)) > 0 AND
      `cloud_name` IS NULL AND `asset_id` IS NULL AND `public_id` IS NULL AND
      `version_cloudinary` IS NULL AND `resource_type` IS NULL AND `delivery_type` IS NULL AND
      `carpeta_cloudinary` IS NULL) OR
    (`proveedor` = 'CLOUDINARY' AND
      `cloud_name` IS NOT NULL AND CHAR_LENGTH(TRIM(`cloud_name`)) > 0 AND
      `public_id` IS NOT NULL AND CHAR_LENGTH(TRIM(`public_id`)) > 0 AND
      `resource_type` IS NOT NULL AND `resource_type` = 'image' AND
      `delivery_type` IS NOT NULL AND `delivery_type` = 'upload' AND
      `carpeta_cloudinary` IS NOT NULL AND CHAR_LENGTH(TRIM(`carpeta_cloudinary`)) > 0)
  ),
  ADD CONSTRAINT `archivos_imagen_confirmacion_completa` CHECK (
    `proveedor` = 'LEGADO' OR `estado` NOT IN ('DISPONIBLE', 'ELIMINANDO', 'ELIMINADO') OR
    (`asset_id` IS NOT NULL AND CHAR_LENGTH(TRIM(`asset_id`)) > 0 AND
      `version_cloudinary` IS NOT NULL AND `version_cloudinary` > 0 AND
      `url_entrega` IS NOT NULL AND LEFT(`url_entrega`, 8) = 'https://' AND
      `formato` IS NOT NULL AND `formato` IN ('jpg', 'jpeg', 'png', 'webp') AND
      `ancho` IS NOT NULL AND `ancho` > 0 AND `alto` IS NOT NULL AND `alto` > 0 AND
      `bytes` IS NOT NULL AND `bytes` BETWEEN 1 AND 5242880)
  ),
  ADD CONSTRAINT `archivos_imagen_fecha_confirmacion` CHECK (
    (`estado` IN ('DISPONIBLE', 'ELIMINANDO', 'ELIMINADO') AND `confirmado_en` IS NOT NULL AND `confirmado_en` >= `creado_en`) OR
    (`estado` NOT IN ('DISPONIBLE', 'ELIMINANDO', 'ELIMINADO') AND `confirmado_en` IS NULL)
  ),
  ADD CONSTRAINT `archivos_imagen_bloqueo_carga` CHECK (
    (`token_carga` IS NULL AND `bloqueo_carga_hasta` IS NULL) OR
    (`token_carga` IS NOT NULL AND CHAR_LENGTH(TRIM(`token_carga`)) = 36 AND
      `bloqueo_carga_hasta` IS NOT NULL AND `estado` IN ('PENDIENTE', 'CONCILIANDO') AND `proveedor` = 'CLOUDINARY')
  ),
  ADD CONSTRAINT `archivos_imagen_bloqueo_limpieza` CHECK (
    (`estado` = 'ELIMINANDO' AND `proveedor` = 'CLOUDINARY' AND
      `token_limpieza` IS NOT NULL AND CHAR_LENGTH(TRIM(`token_limpieza`)) = 36 AND `bloqueo_limpieza_hasta` IS NOT NULL) OR
    (`estado` <> 'ELIMINANDO' AND `token_limpieza` IS NULL AND `bloqueo_limpieza_hasta` IS NULL)
  ),
  ADD CONSTRAINT `archivos_imagen_fecha_eliminacion` CHECK (
    (`estado` = 'ELIMINADO' AND `eliminado_en` IS NOT NULL AND `confirmado_en` IS NOT NULL AND `eliminado_en` >= `confirmado_en`) OR
    (`estado` <> 'ELIMINADO' AND `eliminado_en` IS NULL)
  );

ALTER TABLE `operaciones_producto`
  ADD CONSTRAINT `operaciones_producto_hash_valido` CHECK (REGEXP_LIKE(`solicitud_hash`, '^[0-9a-f]{64}$', 'c')),
  ADD CONSTRAINT `operaciones_producto_versiones` CHECK (
    (`tipo` = 'CREAR' AND `version_anterior` IS NULL AND `version_posterior` = 1 AND `antes` IS NULL) OR
    (`tipo` <> 'CREAR' AND `version_anterior` IS NOT NULL AND `version_anterior` >= 1 AND
      `version_posterior` = `version_anterior` + 1 AND `antes` IS NOT NULL AND JSON_TYPE(`antes`) = 'OBJECT')
  ),
  ADD CONSTRAINT `operaciones_producto_copias_objeto` CHECK (JSON_TYPE(`despues`) = 'OBJECT' AND JSON_TYPE(`respuesta`) = 'OBJECT');

ALTER TABLE `secuencia_codigo_producto`
  ADD CONSTRAINT `secuencia_codigo_producto_unica` CHECK (`id` = 1);

ALTER TABLE `alias_producto`
  ADD CONSTRAINT `alias_producto_slug_valido` CHECK (REGEXP_LIKE(`slug_anterior`, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c')),
  ADD CONSTRAINT `alias_producto_color_valido` CHECK (`codigo_color` = '' OR REGEXP_LIKE(`codigo_color`, '^[A-Z]{2}$', 'c'));
