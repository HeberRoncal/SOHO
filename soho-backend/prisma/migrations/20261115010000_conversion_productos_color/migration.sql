-- Décima migración: prepara el corte, sin convertir productos automáticamente.
-- DropIndex
DROP INDEX `productos_codigo_modelo_key` ON `productos`;

-- DropIndex
DROP INDEX `productos_nombre_key` ON `productos`;

-- AlterTable
ALTER TABLE `productos` MODIFY `nombre` VARCHAR(180) NOT NULL;

-- AlterTable
ALTER TABLE `pedido_articulos` MODIFY `nombre_producto` VARCHAR(180) NOT NULL;

-- CreateTable
CREATE TABLE `conversion_catalogo` (
    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `huella_origen` CHAR(64) NULL,
    `huella_manifiesto` CHAR(64) NULL,
    `manifiesto` JSON NULL,
    `realizada_en` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE conversion_catalogo
 ADD CONSTRAINT conversion_catalogo_unica CHECK(id=1),
 ADD CONSTRAINT conversion_catalogo_estado_coherente CHECK(
  (huella_origen IS NULL AND huella_manifiesto IS NULL AND manifiesto IS NULL AND realizada_en IS NULL) OR
  (huella_origen IS NOT NULL AND REGEXP_LIKE(huella_origen,'^[0-9a-f]{64}$','c') AND
   huella_manifiesto IS NOT NULL AND REGEXP_LIKE(huella_manifiesto,'^[0-9a-f]{64}$','c') AND
   manifiesto IS NOT NULL AND JSON_TYPE(manifiesto)='OBJECT' AND realizada_en IS NOT NULL)
 );
INSERT INTO conversion_catalogo(id) VALUES(1);
