-- SOLO para una base aislada con las cuatro migraciones aplicadas. No usar --force.
-- Las filas se revierten; no comprueba sesión, propiedad HTTP ni cobertura comercial.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_direcciones = 0;

DELIMITER //
CREATE PROCEDURE comprobar_direcciones(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF condicion IS NULL OR NOT condicion THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_direcciones = @casos_direcciones + 1;
END//

CREATE PROCEDURE rechazar_direcciones(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING
            GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sql_direcciones = sentencia;
        PREPARE consulta_direcciones FROM @sql_direcciones;
        EXECUTE consulta_direcciones;
        DEALLOCATE PREPARE consulta_direcciones;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_direcciones = @casos_direcciones + 1;
END//
DELIMITER ;

START TRANSACTION;
SET @usuario_direcciones = UUID(), @otro_usuario_direcciones = UUID();
SET @casa_direcciones = UUID(), @trabajo_direcciones = UUID(), @otra_direccion = UUID();
INSERT INTO usuarios (id,nombres,apellidos,correo)
VALUES (@usuario_direcciones,'Ana','Pérez','ana@direcciones.test'),
       (@otro_usuario_direcciones,'Luis','López','luis@direcciones.test');

INSERT INTO direcciones_usuario (id,usuario_id,etiqueta,destinatario,celular,distrito,direccion)
VALUES (@casa_direcciones,@usuario_direcciones,'Casa','Ana Pérez','987654321','la-esperanza','Av. Perú 123');
CALL comprobar_direcciones((SELECT NOT predeterminada AND referencia = '' AND creado_en IS NOT NULL AND actualizado_en IS NOT NULL FROM direcciones_usuario WHERE id = @casa_direcciones), 'Valores predeterminados y fechas');
CALL comprobar_direcciones((SELECT destinatario = 'Ana Pérez' AND direccion = 'Av. Perú 123' FROM direcciones_usuario WHERE id = @casa_direcciones), 'Conserva texto Unicode');

-- Una etiqueta es descriptiva: no es única ni siquiera dentro de una cuenta.
INSERT INTO direcciones_usuario (id,usuario_id,etiqueta,destinatario,celular,distrito,direccion)
VALUES (@trabajo_direcciones,@usuario_direcciones,'Casa','María O’Connor','912345678','trujillo','Jr. España 456'),
       (UUID(),@usuario_direcciones,'Familia','Ana Pérez','987654321','huanchaco','Calle Los Pinos 789');
CALL comprobar_direcciones((SELECT COUNT(*) = 3 FROM direcciones_usuario WHERE usuario_id = @usuario_direcciones AND NOT predeterminada), 'Varias direcciones no predeterminadas');

UPDATE direcciones_usuario SET predeterminada = TRUE WHERE id = @casa_direcciones;
INSERT INTO direcciones_usuario (id,usuario_id,etiqueta,destinatario,celular,distrito,direccion,predeterminada)
VALUES (@otra_direccion,@otro_usuario_direcciones,'Casa','Luis López','912345678','trujillo','Jr. España 456',TRUE);
CALL comprobar_direcciones((SELECT COUNT(*) = 2 FROM direcciones_usuario WHERE predeterminada), 'Cada usuario tiene su propia predeterminada');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET predeterminada = TRUE WHERE id = ',QUOTE(@trabajo_direcciones)),1062,'Segunda predeterminada mediante UPDATE');
CALL rechazar_direcciones(CONCAT('INSERT INTO direcciones_usuario (id,usuario_id,etiqueta,destinatario,celular,distrito,direccion,predeterminada) VALUES (UUID(),',QUOTE(@usuario_direcciones),',''Otra'',''Ana Pérez'',''987654321'',''trujillo'',''Calle Otra 123'',TRUE)'),1062,'Segunda predeterminada mediante INSERT');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET usuario_id = ',QUOTE(@usuario_direcciones),' WHERE id = ',QUOTE(@otra_direccion)),1062,'Trasladar otra predeterminada al mismo usuario');

SAVEPOINT cambio_predeterminada;
UPDATE direcciones_usuario SET predeterminada = FALSE WHERE id = @casa_direcciones;
UPDATE direcciones_usuario SET predeterminada = TRUE WHERE id = @trabajo_direcciones;
CALL comprobar_direcciones((SELECT COUNT(*) = 1 FROM direcciones_usuario WHERE usuario_id = @usuario_direcciones AND predeterminada), 'Cambio de predeterminada en dos pasos');
ROLLBACK TO SAVEPOINT cambio_predeterminada;
CALL comprobar_direcciones((SELECT predeterminada FROM direcciones_usuario WHERE id = @casa_direcciones), 'Rollback restaura la predeterminada');

CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET usuario_id = UUID() WHERE id = ',QUOTE(@trabajo_direcciones)),1452,'Direccion sin usuario existente');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET usuario_id = NULL WHERE id = ',QUOTE(@trabajo_direcciones)),1048,'Direccion sin propietario');
CALL rechazar_direcciones(CONCAT('DELETE FROM usuarios WHERE id = ',QUOTE(@usuario_direcciones)),1451,'Borrado de usuario con direcciones');
CALL rechazar_direcciones(CONCAT('UPDATE usuarios SET id = UUID() WHERE id = ',QUOTE(@usuario_direcciones)),1451,'Cambio del identificador del propietario');

CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET etiqueta = '''' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Etiqueta vacia');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET etiqueta = ''  '' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Etiqueta solo con espacios');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET etiqueta = ''A'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Etiqueta de un caracter');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET etiqueta = REPEAT(''a'',41) WHERE id = ',QUOTE(@casa_direcciones)),1406,'Etiqueta demasiado larga');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET destinatario = '' '' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Destinatario vacio');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET destinatario = ''A'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Destinatario de un caracter');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET destinatario = REPEAT(''a'',141) WHERE id = ',QUOTE(@casa_direcciones)),1406,'Destinatario demasiado largo');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET celular = ''98765432'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Celular corto');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET celular = ''9876543210'' WHERE id = ',QUOTE(@casa_direcciones)),1406,'Celular largo');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET celular = ''887654321'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Celular sin nueve inicial');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET celular = ''9abcdefgh'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Celular con letras');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET celular = ''987 54321'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Celular con espacios');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET celular = ',QUOTE(CONCAT('98765432',CHAR(10))),' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Celular con salto final');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = '''' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Distrito vacio');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = ''La-Esperanza'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Distrito sin normalizar');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = ''la esperanza'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Distrito con espacios');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = ''-trujillo'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Distrito con guion inicial');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = ''trujillo-'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Distrito con guion final');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = ''la--esperanza'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Distrito con guiones consecutivos');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = ',QUOTE(CONCAT('trujillo',CHAR(10))),' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Distrito con salto final');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET distrito = REPEAT(''a'',81) WHERE id = ',QUOTE(@casa_direcciones)),1406,'Distrito demasiado largo');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET direccion = ''     '' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Direccion solo con espacios');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET direccion = ''12345'' WHERE id = ',QUOTE(@casa_direcciones)),3819,'Direccion demasiado corta');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET direccion = REPEAT(''a'',181) WHERE id = ',QUOTE(@casa_direcciones)),1406,'Direccion demasiado larga');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET referencia = REPEAT(''a'',201) WHERE id = ',QUOTE(@casa_direcciones)),1406,'Referencia demasiado larga');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET referencia = NULL WHERE id = ',QUOTE(@casa_direcciones)),1048,'Referencia nula en lugar de cadena vacia');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET predeterminada = 2 WHERE id = ',QUOTE(@casa_direcciones)),3819,'Predeterminada fuera de booleano');
CALL rechazar_direcciones(CONCAT('UPDATE direcciones_usuario SET predeterminada = NULL WHERE id = ',QUOTE(@casa_direcciones)),1048,'Predeterminada nula');

-- Los límites admitidos se guardan íntegros. La cobertura se validará en el servicio.
UPDATE direcciones_usuario SET etiqueta = REPEAT('á',40), destinatario = REPEAT('ñ',140),
    distrito = REPEAT('a',80), direccion = REPEAT('é',180), referencia = REPEAT('ó',200)
WHERE id = @trabajo_direcciones;
CALL comprobar_direcciones((SELECT CHAR_LENGTH(etiqueta) = 40 AND CHAR_LENGTH(destinatario) = 140 AND CHAR_LENGTH(distrito) = 80 AND CHAR_LENGTH(direccion) = 180 AND CHAR_LENGTH(referencia) = 200 FROM direcciones_usuario WHERE id = @trabajo_direcciones), 'Admite los limites sin truncar Unicode');

DELETE FROM direcciones_usuario WHERE id = @casa_direcciones;
CALL comprobar_direcciones((SELECT COUNT(*) = 0 FROM direcciones_usuario WHERE usuario_id = @usuario_direcciones AND predeterminada), 'Elegir reemplazo corresponde al servicio');
UPDATE direcciones_usuario SET predeterminada = TRUE WHERE id = @trabajo_direcciones;
CALL comprobar_direcciones((SELECT predeterminada FROM direcciones_usuario WHERE id = @trabajo_direcciones), 'Borrar la predeterminada libera su indice');
CALL comprobar_direcciones((SELECT COUNT(*) = 1 FROM direcciones_usuario WHERE usuario_id = @otro_usuario_direcciones AND predeterminada), 'La otra cuenta conserva su direccion');

ROLLBACK;
DROP PROCEDURE rechazar_direcciones;
DROP PROCEDURE comprobar_direcciones;
SELECT @casos_direcciones AS casos_aprobados;
