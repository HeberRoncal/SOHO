-- Opciones de talla para bases nuevas, sin ejecutar el seed de demostración.
-- Conserva IDs, orden y relaciones de cualquier talla existente.
INSERT INTO `tallas` (`id`, `sistema`, `valor`, `orden`)
SELECT UUID(), 'EU', opciones.valor, opciones.orden
FROM (
SELECT 35.0 AS valor, 0 AS orden
UNION ALL
SELECT 35.5 AS valor, 1 AS orden
UNION ALL
SELECT 36.0 AS valor, 2 AS orden
UNION ALL
SELECT 36.5 AS valor, 3 AS orden
UNION ALL
SELECT 37.0 AS valor, 4 AS orden
UNION ALL
SELECT 37.5 AS valor, 5 AS orden
UNION ALL
SELECT 38.0 AS valor, 6 AS orden
UNION ALL
SELECT 38.5 AS valor, 7 AS orden
UNION ALL
SELECT 39.0 AS valor, 8 AS orden
UNION ALL
SELECT 39.5 AS valor, 9 AS orden
UNION ALL
SELECT 40.0 AS valor, 10 AS orden
UNION ALL
SELECT 40.5 AS valor, 11 AS orden
UNION ALL
SELECT 41.0 AS valor, 12 AS orden
UNION ALL
SELECT 41.5 AS valor, 13 AS orden
UNION ALL
SELECT 42.0 AS valor, 14 AS orden
UNION ALL
SELECT 42.5 AS valor, 15 AS orden
UNION ALL
SELECT 43.0 AS valor, 16 AS orden
UNION ALL
SELECT 43.5 AS valor, 17 AS orden
UNION ALL
SELECT 44.0 AS valor, 18 AS orden
UNION ALL
SELECT 44.5 AS valor, 19 AS orden
UNION ALL
SELECT 45.0 AS valor, 20 AS orden
UNION ALL
SELECT 45.5 AS valor, 21 AS orden
UNION ALL
SELECT 46.0 AS valor, 22 AS orden
UNION ALL
SELECT 46.5 AS valor, 23 AS orden
UNION ALL
SELECT 47.0 AS valor, 24 AS orden
UNION ALL
SELECT 47.5 AS valor, 25 AS orden
UNION ALL
SELECT 48.0 AS valor, 26 AS orden
) AS opciones
WHERE NOT EXISTS (
    SELECT 1 FROM `tallas` AS existente
    WHERE existente.`sistema` = 'EU'
      AND existente.`valor` = opciones.valor
);
