-- SOLO en una base aislada de pruebas con las cinco migraciones aplicadas.
-- No usar --force. Las filas y cambios de esta prueba se revierten al terminar.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_cobertura = 0;

DELIMITER //
CREATE PROCEDURE comprobar_cobertura(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF condicion IS NULL OR NOT condicion THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_cobertura = @casos_cobertura + 1;
END//

CREATE PROCEDURE rechazar_cobertura(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING
            GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sql_cobertura = sentencia;
        PREPARE consulta_cobertura FROM @sql_cobertura;
        EXECUTE consulta_cobertura;
        DEALLOCATE PREPARE consulta_cobertura;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_cobertura = @casos_cobertura + 1;
END//
DELIMITER ;

START TRANSACTION;
CALL comprobar_cobertura((SELECT COUNT(*) = 7 FROM zonas_entrega), 'Incorpora exactamente siete distritos iniciales');
CALL comprobar_cobertura((SELECT nombre = 'La Esperanza' AND tarifa = 0 AND habilitada AND orden = 0 FROM zonas_entrega WHERE codigo = 'la-esperanza'), 'La Esperanza gratuita y habilitada');
CALL comprobar_cobertura((SELECT nombre = 'Trujillo' AND tarifa IS NULL AND habilitada AND orden = 1 FROM zonas_entrega WHERE codigo = 'trujillo'), 'Trujillo conserva codigo y tarifa pendiente');
CALL comprobar_cobertura((SELECT nombre = 'El Porvenir' AND tarifa IS NULL AND habilitada AND orden = 2 FROM zonas_entrega WHERE codigo = 'el-porvenir'), 'El Porvenir conserva codigo y tarifa pendiente');
CALL comprobar_cobertura((SELECT nombre = 'Florencia de Mora' AND tarifa IS NULL AND habilitada AND orden = 3 FROM zonas_entrega WHERE codigo = 'florencia-de-mora'), 'Florencia de Mora conserva codigo y tarifa pendiente');
CALL comprobar_cobertura((SELECT nombre = 'Víctor Larco Herrera' AND tarifa IS NULL AND habilitada AND orden = 4 FROM zonas_entrega WHERE codigo = 'victor-larco'), 'Victor Larco conserva nombre Unicode y codigo existente');
CALL comprobar_cobertura((SELECT nombre = 'Huanchaco' AND tarifa IS NULL AND habilitada AND orden = 5 FROM zonas_entrega WHERE codigo = 'huanchaco'), 'Huanchaco conserva codigo y tarifa pendiente');
CALL comprobar_cobertura((SELECT nombre = 'Moche' AND tarifa IS NULL AND NOT habilitada AND orden = 6 FROM zonas_entrega WHERE codigo = 'moche'), 'Moche comienza desactivado y pendiente de tarifa');
CALL comprobar_cobertura((SELECT COUNT(*) = 7 FROM zonas_entrega WHERE plazo IS NULL AND creado_en IS NOT NULL AND actualizado_en IS NOT NULL), 'Plazos pendientes y fechas iniciales');
CALL comprobar_cobertura((SELECT COUNT(*) = 1 FROM zonas_entrega WHERE habilitada AND tarifa IS NOT NULL), 'Solo una zona tiene tarifa confirmada para futura cotizacion');

SET @zona_cobertura = UUID();
INSERT INTO zonas_entrega (id,codigo,nombre) VALUES (@zona_cobertura,'zona-prueba','Zona de prueba');
CALL comprobar_cobertura((SELECT tarifa IS NULL AND plazo IS NULL AND NOT habilitada AND orden = 0 FROM zonas_entrega WHERE id = @zona_cobertura), 'Valores predeterminados sin tarifa gratuita implicita');
CALL rechazar_cobertura('INSERT INTO zonas_entrega (id,codigo,nombre) VALUES (UUID(),''trujillo'',''Duplicada'')',1062,'Codigo de distrito duplicado');
CALL rechazar_cobertura('INSERT INTO zonas_entrega (id,codigo,nombre) VALUES (UUID(),''otra-zona'',''Trujillo'')',1062,'Nombre de distrito duplicado');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = '''' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Codigo vacio');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = ''ZONA-PRUEBA'' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Codigo en mayusculas');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = ''zona prueba'' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Codigo con espacios');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = ''zona--prueba'' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Codigo con guiones repetidos');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = ''-zona-prueba'' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Codigo con guion inicial');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = ''zona-prueba-'' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Codigo con guion final');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = ',QUOTE(CONCAT('zona-prueba',CHAR(10))),' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Codigo con salto final');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET codigo = REPEAT(''a'',81) WHERE id = ',QUOTE(@zona_cobertura)),1406,'Codigo demasiado largo');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET nombre = ''  '' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Nombre sin contenido');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET nombre = ''A'' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Nombre de un caracter');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET nombre = ',QUOTE(CONCAT('Zona',CHAR(10),'Prueba')),' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Nombre con control');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET nombre = REPEAT(''a'',81) WHERE id = ',QUOTE(@zona_cobertura)),1406,'Nombre demasiado largo');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET tarifa = -0.01 WHERE id = ',QUOTE(@zona_cobertura)),3819,'Tarifa negativa');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET tarifa = 1000000 WHERE id = ',QUOTE(@zona_cobertura)),1264,'Tarifa fuera del decimal');
CALL rechazar_cobertura('UPDATE zonas_entrega SET tarifa = 1 WHERE codigo = ''la-esperanza''',3819,'Cobro en La Esperanza');
CALL rechazar_cobertura('UPDATE zonas_entrega SET tarifa = NULL WHERE codigo = ''la-esperanza''',3819,'Tarifa pendiente en La Esperanza');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET plazo = '''' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Plazo vacio en lugar de NULL');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET plazo = ''  '' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Plazo solo con espacios');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET plazo = ',QUOTE(CONCAT('Manana',CHAR(9),'tarde')),' WHERE id = ',QUOTE(@zona_cobertura)),3819,'Plazo con control');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET plazo = REPEAT(''a'',81) WHERE id = ',QUOTE(@zona_cobertura)),1406,'Plazo demasiado largo');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET habilitada = 2 WHERE id = ',QUOTE(@zona_cobertura)),3819,'Habilitada fuera de booleano');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET habilitada = NULL WHERE id = ',QUOTE(@zona_cobertura)),1048,'Habilitada nula');
CALL rechazar_cobertura(CONCAT('UPDATE zonas_entrega SET orden = -1 WHERE id = ',QUOTE(@zona_cobertura)),1264,'Orden negativo');

UPDATE zonas_entrega SET tarifa = 0.10, plazo = 'Dos días de prueba', habilitada = TRUE WHERE id = @zona_cobertura;
CALL comprobar_cobertura((SELECT tarifa = 0.10 AND plazo = 'Dos días de prueba' AND habilitada FROM zonas_entrega WHERE id = @zona_cobertura), 'Tarifa exacta y plazo Unicode');
UPDATE zonas_entrega SET tarifa = 0 WHERE id = @zona_cobertura;
CALL comprobar_cobertura((SELECT tarifa = 0 AND habilitada FROM zonas_entrega WHERE id = @zona_cobertura), 'Tarifa cero es gratuita confirmada');
UPDATE zonas_entrega SET tarifa = NULL WHERE id = @zona_cobertura;
CALL comprobar_cobertura((SELECT tarifa IS NULL AND habilitada FROM zonas_entrega WHERE id = @zona_cobertura), 'Habilitacion y tarifa pendiente son condiciones independientes');
UPDATE zonas_entrega SET tarifa = 999999.99, codigo = REPEAT('a',80), nombre = REPEAT('ñ',80), plazo = REPEAT('á',80) WHERE id = @zona_cobertura;
CALL comprobar_cobertura((SELECT tarifa = 999999.99 AND CHAR_LENGTH(codigo) = 80 AND CHAR_LENGTH(nombre) = 80 AND CHAR_LENGTH(plazo) = 80 FROM zonas_entrega WHERE id = @zona_cobertura), 'Limites permitidos sin truncamiento');

-- Una dirección guardada no equivale a cobertura contratada ni depende de su fila.
SET @usuario_cobertura = UUID(), @direccion_cobertura = UUID();
INSERT INTO usuarios (id,nombres,apellidos,correo) VALUES (@usuario_cobertura,'Ana','Cobertura','ana@cobertura.test');
INSERT INTO direcciones_usuario (id,usuario_id,etiqueta,destinatario,celular,distrito,direccion)
VALUES (@direccion_cobertura,@usuario_cobertura,'Casa','Ana Cobertura','987654321','distrito-sin-cobertura','Calle de prueba 123');
CALL comprobar_cobertura((SELECT distrito = 'distrito-sin-cobertura' FROM direcciones_usuario WHERE id = @direccion_cobertura), 'La agenda conserva codigos sin zona de entrega');
UPDATE zonas_entrega SET habilitada = FALSE WHERE codigo = 'la-esperanza';
CALL comprobar_cobertura((SELECT tarifa = 0 AND NOT habilitada FROM zonas_entrega WHERE codigo = 'la-esperanza'), 'Deshabilitar no altera la regla gratuita');

ROLLBACK;
DROP PROCEDURE rechazar_cobertura;
DROP PROCEDURE comprobar_cobertura;
SELECT @casos_cobertura AS casos_aprobados;
