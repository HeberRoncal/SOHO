UPDATE `categorias`
SET `nombre` = 'Urbanas', `slug` = 'urbanas', `activa` = TRUE, `orden` = 0
WHERE `nombre` = 'Clásicos';

UPDATE `categorias`
SET `nombre` = 'Running/Gym', `slug` = 'running-gym', `activa` = TRUE, `orden` = 1
WHERE `nombre` = 'Para correr';

UPDATE `categorias`
SET `nombre` = 'Básquet', `slug` = 'basquet', `activa` = TRUE, `orden` = 2
WHERE `nombre` = 'Patineta';

UPDATE `categorias`
SET `nombre` = 'Skate', `slug` = 'skate', `activa` = TRUE, `orden` = 3
WHERE `nombre` = 'Urbano';

UPDATE `categorias`
SET `nombre` = 'Clásicos', `slug` = 'clasicos', `activa` = TRUE, `orden` = 4
WHERE `nombre` = 'Uso diario';
