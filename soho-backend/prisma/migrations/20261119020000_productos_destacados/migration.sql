ALTER TABLE `productos`
    ADD COLUMN `es_destacado` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `productos`
    ADD INDEX `productos_estado_es_destacado_orden_catalogo_idx` (`estado`, `es_destacado`, `orden_catalogo`);

UPDATE `productos`
SET `es_destacado` = true
WHERE `slug` IN ('suede', 'oldskool', 'peg', 'nb990v5', 'ub1', 'ub5', 'samba');
