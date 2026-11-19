UPDATE `categorias`
SET `orden` = CASE `nombre`
    WHEN 'Clásicos' THEN 0
    WHEN 'Para correr' THEN 1
    WHEN 'Patineta' THEN 2
    WHEN 'Urbano' THEN 3
    WHEN 'Uso diario' THEN 4
    ELSE `orden`
END
WHERE `nombre` IN ('Clásicos', 'Para correr', 'Patineta', 'Urbano', 'Uso diario');

INSERT IGNORE INTO `marcas`
    (`id`, `codigo`, `nombre`, `slug`, `activa`, `orden`)
VALUES
    (UUID(), 'AD', 'adidas', 'adidas', TRUE, 0),
    (UUID(), 'AS', 'Asics', 'asics', TRUE, 1),
    (UUID(), 'CV', 'Converse', 'converse', TRUE, 2),
    (UUID(), 'NB', 'New Balance', 'new-balance', TRUE, 3),
    (UUID(), 'NK', 'Nike', 'nike', TRUE, 4),
    (UUID(), 'PM', 'Puma', 'puma', TRUE, 5),
    (UUID(), 'RB', 'Reebok', 'reebok', TRUE, 6),
    (UUID(), 'SK', 'Skechers', 'skechers', TRUE, 7),
    (UUID(), 'UA', 'Under Armour', 'under-armour', TRUE, 8),
    (UUID(), 'VN', 'Vans', 'vans', TRUE, 9);

UPDATE `marcas`
SET
    `nombre` = CASE LOWER(`nombre`)
        WHEN 'adidas' THEN 'adidas'
        WHEN 'asics' THEN 'Asics'
        WHEN 'converse' THEN 'Converse'
        WHEN 'new balance' THEN 'New Balance'
        WHEN 'nike' THEN 'Nike'
        WHEN 'puma' THEN 'Puma'
        WHEN 'reebok' THEN 'Reebok'
        WHEN 'skechers' THEN 'Skechers'
        WHEN 'under armour' THEN 'Under Armour'
        WHEN 'vans' THEN 'Vans'
        ELSE `nombre`
    END,
    `activa` = TRUE,
    `orden` = CASE LOWER(`nombre`)
        WHEN 'adidas' THEN 0
        WHEN 'asics' THEN 1
        WHEN 'converse' THEN 2
        WHEN 'new balance' THEN 3
        WHEN 'nike' THEN 4
        WHEN 'puma' THEN 5
        WHEN 'reebok' THEN 6
        WHEN 'skechers' THEN 7
        WHEN 'under armour' THEN 8
        WHEN 'vans' THEN 9
        ELSE `orden`
    END
WHERE LOWER(`nombre`) IN (
    'adidas', 'asics', 'converse', 'new balance', 'nike',
    'puma', 'reebok', 'skechers', 'under armour', 'vans'
);
