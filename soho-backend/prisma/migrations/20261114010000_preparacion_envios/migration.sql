-- Ampliacion aditiva: conserva movimientos anteriores y no crea envios ni cambia stock.
-- AlterTable
ALTER TABLE `movimientos_inventario` ADD COLUMN `envio_pedido_id` CHAR(36) NULL,
    MODIFY `origen` ENUM('MANUAL', 'STOCK_INICIAL', 'ENVIO_PEDIDO') NOT NULL;

-- CreateTable
CREATE TABLE `envios_pedido` (
    `id` CHAR(36) NOT NULL,
    `pedido_id` CHAR(36) NOT NULL,
    `preparacion_iniciada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `preparacion_iniciada_por_id` CHAR(36) NOT NULL,
    `transportista` VARCHAR(80) NULL,
    `referencia_seguimiento` VARCHAR(80) NULL,
    `despachado_en` DATETIME(3) NULL,
    `despachado_por_id` CHAR(36) NULL,
    `entregado_en` DATETIME(3) NULL,
    `entrega_registrada_por_id` CHAR(36) NULL,

    UNIQUE INDEX `envios_pedido_pedido_id_key`(`pedido_id`),
    INDEX `envios_preparacion_admin_fecha_idx`(`preparacion_iniciada_por_id`, `preparacion_iniciada_en`),
    INDEX `envios_despacho_admin_fecha_idx`(`despachado_por_id`, `despachado_en`),
    INDEX `envios_entrega_admin_fecha_idx`(`entrega_registrada_por_id`, `entregado_en`),
    INDEX `envios_despachado_fecha_id_idx`(`despachado_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `movimientos_envio_variante_key` ON `movimientos_inventario`(`envio_pedido_id`, `variante_id`);

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_envio_pedido_id_fkey` FOREIGN KEY (`envio_pedido_id`) REFERENCES `envios_pedido`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `envios_pedido` ADD CONSTRAINT `envios_pedido_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `envios_pedido` ADD CONSTRAINT `envios_pedido_preparacion_iniciada_por_id_fkey` FOREIGN KEY (`preparacion_iniciada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `envios_pedido` ADD CONSTRAINT `envios_pedido_despachado_por_id_fkey` FOREIGN KEY (`despachado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `envios_pedido` ADD CONSTRAINT `envios_pedido_entrega_registrada_por_id_fkey` FOREIGN KEY (`entrega_registrada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reglas de fila que no representa Prisma. No sustituyen las transacciones de la API.
ALTER TABLE `envios_pedido`
    ADD CONSTRAINT `envios_despacho_coherente` CHECK (
        (`despachado_en` IS NULL AND `despachado_por_id` IS NULL AND `transportista` IS NULL AND `referencia_seguimiento` IS NULL) OR
        (`despachado_en` IS NOT NULL AND `despachado_por_id` IS NOT NULL AND
         `transportista` IS NOT NULL AND `referencia_seguimiento` IS NOT NULL AND
         CHAR_LENGTH(TRIM(`transportista`)) BETWEEN 2 AND 80 AND
         CHAR_LENGTH(TRIM(`referencia_seguimiento`)) BETWEEN 3 AND 80 AND
         CHAR_LENGTH(`transportista`) = CHAR_LENGTH(TRIM(`transportista`)) AND
         CHAR_LENGTH(`referencia_seguimiento`) = CHAR_LENGTH(TRIM(`referencia_seguimiento`)) AND
         NOT REGEXP_LIKE(`transportista`, '[[:cntrl:]]', 'c') AND
         NOT REGEXP_LIKE(`referencia_seguimiento`, '[[:cntrl:]]', 'c') AND
         `despachado_en` >= `preparacion_iniciada_en`)
    ),
    ADD CONSTRAINT `envios_entrega_coherente` CHECK (
        (`entregado_en` IS NULL AND `entrega_registrada_por_id` IS NULL) OR
        (`entregado_en` IS NOT NULL AND `entrega_registrada_por_id` IS NOT NULL AND
         `despachado_en` IS NOT NULL AND `entregado_en` >= `despachado_en`)
    );

ALTER TABLE `movimientos_inventario`
    ADD CONSTRAINT `movimientos_envio_coherente` CHECK (
        (`origen` = 'ENVIO_PEDIDO' AND `envio_pedido_id` IS NOT NULL AND
         `usuario_responsable_id` IS NOT NULL AND `tipo` = 'SALIDA') OR
        (`origen` IN ('MANUAL', 'STOCK_INICIAL') AND `envio_pedido_id` IS NULL)
    );
