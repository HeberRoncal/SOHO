INSERT IGNORE INTO `categorias` (`id`, `nombre`, `slug`, `orden`)
VALUES
    (UUID(), 'Urbano', 'urbano', 0),
    (UUID(), 'Clásicos', 'clasicos', 1),
    (UUID(), 'Uso diario', 'uso-diario', 2),
    (UUID(), 'Patineta', 'patineta', 3),
    (UUID(), 'Para correr', 'para-correr', 4);
