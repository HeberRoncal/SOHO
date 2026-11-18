-- Octava migracion aditiva: registra cancelaciones sin inventarlas ni cambiar datos anteriores.
-- CreateTable
CREATE TABLE `cancelaciones_pedido` (
    `id` CHAR(36) NOT NULL,
    `pedido_id` CHAR(36) NOT NULL,
    `motivo` VARCHAR(300) NOT NULL,
    `cancelada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `registrada_por_id` CHAR(36) NOT NULL,
    `estado_entrega_anterior` ENUM('PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 'INCIDENCIA', 'ENVIADO', 'ENTREGADO', 'CANCELADO') NOT NULL,
    `estado_pago_anterior` ENUM('PENDIENTE', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO') NOT NULL,
    `version_pedido` INTEGER UNSIGNED NOT NULL,
    `decision_reservas_consultadas` ENUM('LIBERAR', 'CONSERVAR') NULL,

    UNIQUE INDEX `cancelaciones_pedido_pedido_id_key`(`pedido_id`),
    INDEX `cancelaciones_admin_fecha_idx`(`registrada_por_id`, `cancelada_en`),
    INDEX `cancelaciones_fecha_id_idx`(`cancelada_en`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cancelaciones_pedido` ADD CONSTRAINT `cancelaciones_pedido_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cancelaciones_pedido` ADD CONSTRAINT `cancelaciones_pedido_registrada_por_id_fkey` FOREIGN KEY (`registrada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Reglas de fila no representadas por Prisma. Las relaciones entre estado,
-- reservas, responsable ADMIN e historial corresponden a la futura API.
ALTER TABLE `cancelaciones_pedido`
    ADD CONSTRAINT `cancelaciones_motivo_valido` CHECK (
        CHAR_LENGTH(TRIM(`motivo`)) BETWEEN 10 AND 300 AND
        CHAR_LENGTH(`motivo`) = CHAR_LENGTH(TRIM(`motivo`)) AND
        NOT REGEXP_LIKE(REPLACE(REPLACE(`motivo`, CHAR(13), ''), CHAR(10), ''), '[[:cntrl:]]', 'c')
    ),
    ADD CONSTRAINT `cancelaciones_etapa_anterior_valida` CHECK (
        `estado_entrega_anterior` IN ('PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 'INCIDENCIA')
    ),
    ADD CONSTRAINT `cancelaciones_version_valida` CHECK (`version_pedido` >= 2);
