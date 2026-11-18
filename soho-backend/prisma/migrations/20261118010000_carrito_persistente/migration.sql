CREATE TABLE `carritos_usuario` (
  `usuario_id` CHAR(36) NOT NULL,
  `articulos` JSON NOT NULL,
  `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `actualizado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `carritos_usuario_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `carritos_articulos_array` CHECK (JSON_TYPE(`articulos`) = 'ARRAY' AND JSON_LENGTH(`articulos`) <= 100)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operaciones_carrito` (
  `usuario_id` CHAR(36) NOT NULL,
  `clave` CHAR(36) NOT NULL,
  `hash` CHAR(64) NOT NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`usuario_id`, `clave`),
  CONSTRAINT `operaciones_carrito_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `carritos_usuario` (`usuario_id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
