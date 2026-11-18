-- Ejecutar SOLO en una base de pruebas aislada con la migración aplicada.
-- Las filas de prueba se revierten. No ejecutar con --force: un fallo debe detener la prueba.
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos = 0;

DELIMITER //
CREATE PROCEDURE comprobar_esquema(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF condicion IS NULL OR NOT condicion THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos = @casos + 1;
END//

CREATE PROCEDURE comprobar_rechazo_esquema(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
            GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sentencia_esquema = sentencia;
        PREPARE consulta_esquema FROM @sentencia_esquema;
        EXECUTE consulta_esquema;
        DEALLOCATE PREPARE consulta_esquema;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos = @casos + 1;
END//
DELIMITER ;

START TRANSACTION;
SET @marca = UUID(), @categoria = UUID(), @producto = UUID(), @color = UUID();
SET @talla = UUID(), @otra_talla = UUID(), @variante = UUID(), @movimiento = UUID();

INSERT INTO marcas (id, codigo, nombre, slug) VALUES (@marca, 'TEST', 'Marca de prueba', 'marca-prueba');
INSERT INTO categorias (id, nombre, slug) VALUES (@categoria, 'Categoria de prueba', 'categoria-prueba');
INSERT INTO productos (id, slug, codigo_interno, nombre, marca_id, categoria_id)
VALUES (@producto, 'producto-prueba', 'TEST-001', 'Producto de prueba', @marca, @categoria);
CALL comprobar_esquema(
    (SELECT estado = 'BORRADOR' AND precio IS NULL AND modelo IS NULL FROM productos WHERE id = @producto),
    'El borrador debe admitir datos pendientes'
);

CALL comprobar_rechazo_esquema(CONCAT('UPDATE productos SET precio = 0 WHERE id = ', QUOTE(@producto)), 3819, 'Precio cero');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE productos SET precio_anterior = 600 WHERE id = ', QUOTE(@producto)), 3819, 'Oferta sin precio actual');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE productos SET estado = ''PUBLICADO'' WHERE id = ', QUOTE(@producto)), 3819, 'Publicacion sin datos propios');
UPDATE productos SET precio = 499.90, precio_anterior = 549.90, modelo = 'Modelo de prueba', codigo_modelo = 'TEST-MODELO' WHERE id = @producto;
CALL comprobar_esquema((SELECT precio = 499.90 AND precio_anterior = 549.90 FROM productos WHERE id = @producto), 'Los precios deben conservar sus centimos');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE productos SET precio_anterior = 499.90 WHERE id = ', QUOTE(@producto)), 3819, 'Oferta sin rebaja');

INSERT INTO producto_colores (id, producto_id, codigo, nombre, hexadecimal)
VALUES (@color, @producto, 'BL', 'Blanco', '#F2F2F0');
INSERT INTO tallas (id, valor) VALUES (@talla, 40.5), (@otra_talla, 41);
INSERT INTO variantes (id, producto_color_id, talla_id, sku, existencias, cantidad_reservada)
VALUES (@variante, @color, @talla, 'TEST-001-BL-40P5', 5, 2);
INSERT INTO imagenes_producto (id, producto_id, ruta, orden)
VALUES (UUID(), @producto, '/imagenes/prueba.png', 0);
INSERT INTO imagenes_producto_color (id, producto_color_id, ruta)
VALUES (UUID(), @color, '/imagenes/prueba-blanco.png');
UPDATE productos SET estado = 'PUBLICADO' WHERE id = @producto;
CALL comprobar_esquema((SELECT COUNT(*) = 1 FROM productos WHERE id = @producto AND estado = 'PUBLICADO'), 'Debe admitir un producto completo');

CALL comprobar_rechazo_esquema(CONCAT('INSERT INTO variantes (id, producto_color_id, talla_id, sku) VALUES (UUID(), ', QUOTE(@color), ', ', QUOTE(@otra_talla), ', ''TEST-001-BL-40P5'')'), 1062, 'SKU duplicado');
CALL comprobar_rechazo_esquema(CONCAT('INSERT INTO variantes (id, producto_color_id, talla_id, sku) VALUES (UUID(), ', QUOTE(@color), ', ', QUOTE(@talla), ', ''OTRO-SKU'')'), 1062, 'Color y talla duplicados');
CALL comprobar_rechazo_esquema(CONCAT('INSERT INTO variantes (id, producto_color_id, talla_id, sku) VALUES (UUID(), UUID(), ', QUOTE(@talla), ', ''SKU-HUERFANO'')'), 1452, 'Variante sin color padre');
CALL comprobar_rechazo_esquema(CONCAT('INSERT INTO producto_colores (id, producto_id, codigo, nombre, hexadecimal) VALUES (UUID(), ', QUOTE(@producto), ', ''BL'', ''Otro blanco'', ''#FFFFFF'')'), 1062, 'Color duplicado en producto');
CALL comprobar_rechazo_esquema('INSERT INTO tallas (id, valor) VALUES (UUID(), 40.5)', 1062, 'Talla duplicada');
CALL comprobar_rechazo_esquema('INSERT INTO tallas (id, valor) VALUES (UUID(), 40.3)', 3819, 'Talla fuera del paso actual');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE producto_colores SET codigo = ''bl'' WHERE id = ', QUOTE(@color)), 3819, 'Codigo de color en minusculas');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE producto_colores SET hexadecimal = ''#ZZZZZZ'' WHERE id = ', QUOTE(@color)), 3819, 'Hexadecimal invalido');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE variantes SET existencias = -1 WHERE id = ', QUOTE(@variante)), 1264, 'Stock negativo');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE variantes SET existencias = 100000 WHERE id = ', QUOTE(@variante)), 3819, 'Stock fuera del limite');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE variantes SET cantidad_reservada = -1 WHERE id = ', QUOTE(@variante)), 1264, 'Reservas negativas');
CALL comprobar_rechazo_esquema(CONCAT('INSERT INTO imagenes_producto (id, producto_id, ruta, orden) VALUES (UUID(), ', QUOTE(@producto), ', ''/otra.png'', 0)'), 1062, 'Orden de imagen duplicado');
CALL comprobar_rechazo_esquema(CONCAT('INSERT INTO imagenes_producto (id, producto_id, ruta, orden) VALUES (UUID(), ', QUOTE(@producto), ', ''/novena.png'', 8)'), 3819, 'Mas de ocho imagenes generales');

INSERT INTO movimientos_inventario
    (id, variante_id, tipo, cantidad, saldo_anterior, saldo_posterior, cantidad_reservada, variante_habilitada, motivo, origen)
VALUES (@movimiento, @variante, 'ENTRADA', 1, 4, 5, 2, TRUE, 'Entrada de prueba', 'MANUAL');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE movimientos_inventario SET saldo_posterior = 9 WHERE id = ', QUOTE(@movimiento)), 3819, 'Saldo incoherente');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE movimientos_inventario SET tipo = ''SALIDA'' WHERE id = ', QUOTE(@movimiento)), 3819, 'Salida con cantidad positiva');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE movimientos_inventario SET cantidad = 0, saldo_anterior = 5 WHERE id = ', QUOTE(@movimiento)), 3819, 'Movimiento sin cantidad');
CALL comprobar_rechazo_esquema(CONCAT('UPDATE movimientos_inventario SET motivo = '' '' WHERE id = ', QUOTE(@movimiento)), 3819, 'Movimiento sin motivo');
CALL comprobar_rechazo_esquema(CONCAT('DELETE FROM variantes WHERE id = ', QUOTE(@variante)), 1451, 'Borrado de variante con historial');
CALL comprobar_rechazo_esquema(CONCAT('DELETE FROM productos WHERE id = ', QUOTE(@producto)), 1451, 'Borrado de producto con colores');

-- Una perdida fisica puede dejar reservas pendientes: no se borra ni altera su historial.
UPDATE variantes SET existencias = 1 WHERE id = @variante;
CALL comprobar_esquema(
    (SELECT GREATEST(0, CAST(existencias AS SIGNED) - CAST(cantidad_reservada AS SIGNED)) = 0 FROM variantes WHERE id = @variante),
    'El disponible no puede ser negativo ante faltantes fisicos'
);
CALL comprobar_esquema(
    (SELECT saldo_posterior = 5 AND cantidad_reservada = 2 FROM movimientos_inventario WHERE id = @movimiento),
    'El historial conserva los saldos originales'
);

ROLLBACK;
DROP PROCEDURE comprobar_rechazo_esquema;
DROP PROCEDURE comprobar_esquema;
SELECT @casos AS casos_aprobados;
