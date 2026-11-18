-- SOLO para una base aislada con las tres migraciones aplicadas. No usar --force.
-- Las filas se revierten. Los sub y hashes son sintéticos; no permiten acceder.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_identidades = 0;

DELIMITER //
CREATE PROCEDURE comprobar_identidades(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF condicion IS NULL OR NOT condicion THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_identidades = @casos_identidades + 1;
END//

CREATE PROCEDURE rechazar_identidades(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING
            GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sql_identidades = sentencia;
        PREPARE consulta_identidades FROM @sql_identidades;
        EXECUTE consulta_identidades;
        DEALLOCATE PREPARE consulta_identidades;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_identidades = @casos_identidades + 1;
END//
DELIMITER ;

START TRANSACTION;
SET @usuario_google = UUID(), @usuario_local = UUID(), @otro_usuario = UUID();
SET @identidad_google = UUID(), @identidad_local = UUID();
SET @hash_identidades = CONCAT('$argon2id$v=19$m=19456,t=2,p=1$', REPEAT('A',22), '$', REPEAT('B',43));

INSERT INTO usuarios (id,nombres,apellidos,correo,clave_hash)
VALUES (@usuario_google,'Ana','Google','google@identidades.test',NULL);
INSERT INTO usuarios (id,nombres,apellidos,correo,clave_hash)
VALUES (@usuario_local,'Luis','Local','local@identidades.test',@hash_identidades);
INSERT INTO usuarios (id,nombres,apellidos,correo)
VALUES (@otro_usuario,'Otra','Persona','otra@identidades.test');
CALL comprobar_identidades((SELECT clave_hash IS NULL AND rol = 'CLIENTE' AND activo = TRUE FROM usuarios WHERE id = @usuario_google), 'Cuenta Google sin clave y con rol CLIENTE');
CALL comprobar_identidades((SELECT clave_hash IS NULL FROM usuarios WHERE id = @otro_usuario), 'Se permite omitir la clave local');

INSERT INTO identidades_externas (id,usuario_id,proveedor,identificador_proveedor)
VALUES (@identidad_google,@usuario_google,'GOOGLE','GoogleSubject-123');
INSERT INTO identidades_externas (id,usuario_id,proveedor,identificador_proveedor)
VALUES (@identidad_local,@usuario_local,'GOOGLE','GoogleSubject-456');
CALL comprobar_identidades((SELECT usuario_id = @usuario_google AND proveedor = 'GOOGLE' AND creado_en IS NOT NULL FROM identidades_externas WHERE id = @identidad_google), 'Identidad vinculada y con fecha predeterminada');
CALL comprobar_identidades((SELECT CAST(clave_hash AS BINARY) = CAST(@hash_identidades AS BINARY) AND rol = 'CLIENTE' FROM usuarios WHERE id = @usuario_local), 'Vincular Google conserva clave y rol locales');

CALL rechazar_identidades(CONCAT('INSERT INTO identidades_externas (id,usuario_id,proveedor,identificador_proveedor) VALUES (UUID(),',QUOTE(@usuario_google),',''GOOGLE'',''GoogleSubject-123'')'),1062,'Identidad duplicada en mismo usuario');
CALL rechazar_identidades(CONCAT('INSERT INTO identidades_externas (id,usuario_id,proveedor,identificador_proveedor) VALUES (UUID(),',QUOTE(@otro_usuario),',''GOOGLE'',''GoogleSubject-123'')'),1062,'Misma identidad en dos usuarios');
CALL rechazar_identidades('INSERT INTO identidades_externas (id,usuario_id,proveedor,identificador_proveedor) VALUES (UUID(),UUID(),''GOOGLE'',''Huerfana'')',1452,'Identidad sin usuario');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET proveedor = ''FACEBOOK'' WHERE id = ',QUOTE(@identidad_google)),1265,'Proveedor no admitido');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = '''' WHERE id = ',QUOTE(@identidad_google)),3819,'Identificador vacio');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = '' GoogleSubject'' WHERE id = ',QUOTE(@identidad_google)),3819,'Espacio inicial');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = ''GoogleSubject '' WHERE id = ',QUOTE(@identidad_google)),3819,'Espacio final');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = ''Google Subject'' WHERE id = ',QUOTE(@identidad_google)),3819,'Espacio intermedio');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = ',QUOTE(CONCAT('Google',CHAR(9),'Subject')),' WHERE id = ',QUOTE(@identidad_google)),3819,'Tabulador en identificador');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = ',QUOTE(CONCAT('GoogleSubject',CHAR(10))),' WHERE id = ',QUOTE(@identidad_google)),3819,'Salto de linea final');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = ',QUOTE(CONCAT('Google',CHAR(1),'Subject')),' WHERE id = ',QUOTE(@identidad_google)),3819,'Caracter de control');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = ''cuenta-é'' WHERE id = ',QUOTE(@identidad_google)),1366,'Identificador fuera de ASCII');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = REPEAT(''a'',256) WHERE id = ',QUOTE(@identidad_google)),1406,'Identificador demasiado largo');
CALL rechazar_identidades(CONCAT('UPDATE identidades_externas SET identificador_proveedor = NULL WHERE id = ',QUOTE(@identidad_google)),1048,'Identificador nulo');

-- ASCII binario conserva diferencias de mayúsculas: ambos sub son distintos.
INSERT INTO identidades_externas (id,usuario_id,proveedor,identificador_proveedor)
VALUES (UUID(),@otro_usuario,'GOOGLE','googlesubject-123');
CALL comprobar_identidades((SELECT COUNT(*) = 2 FROM identidades_externas WHERE identificador_proveedor IN ('GoogleSubject-123','googlesubject-123')), 'La unicidad distingue mayusculas');
INSERT INTO identidades_externas (id,usuario_id,proveedor,identificador_proveedor)
VALUES (UUID(),@otro_usuario,'GOOGLE',REPEAT('x',255));
CALL comprobar_identidades((SELECT COUNT(*) = 1 FROM identidades_externas WHERE identificador_proveedor = REPEAT('x',255)), 'Admite identificador de 255 caracteres');

CALL rechazar_identidades(CONCAT('UPDATE usuarios SET clave_hash = '''' WHERE id = ',QUOTE(@usuario_google)),3819,'Clave vacia en lugar de NULL');
CALL rechazar_identidades(CONCAT('UPDATE usuarios SET clave_hash = ''clave-en-texto-plano'' WHERE id = ',QUOTE(@usuario_google)),3819,'Clave sin hash');
CALL rechazar_identidades(CONCAT('UPDATE usuarios SET clave_hash = REPEAT(''a'',100) WHERE id = ',QUOTE(@usuario_google)),3819,'Cadena larga sin prefijo Argon2id');
UPDATE usuarios SET clave_hash = @hash_identidades WHERE id = @usuario_google;
CALL comprobar_identidades((SELECT CAST(clave_hash AS BINARY) = CAST(@hash_identidades AS BINARY) FROM usuarios WHERE id = @usuario_google), 'Admite agregar una clave a la cuenta Google');
UPDATE usuarios SET clave_hash = NULL WHERE id = @usuario_google;
CALL comprobar_identidades((SELECT clave_hash IS NULL FROM usuarios WHERE id = @usuario_google), 'Admite mantener solo el acceso Google');

CALL rechazar_identidades(CONCAT('DELETE FROM usuarios WHERE id = ',QUOTE(@usuario_google)),1451,'Borrado de usuario con identidad');
CALL rechazar_identidades(CONCAT('UPDATE usuarios SET id = UUID() WHERE id = ',QUOTE(@usuario_google)),1451,'Cambio de identificador del usuario vinculado');

INSERT INTO sesiones (id,usuario_id,token_hash,expira_en)
VALUES (UUID(),@usuario_google,REPEAT('f',64),DATE_ADD(NOW(3),INTERVAL 1 HOUR));
CALL comprobar_identidades((SELECT COUNT(*) = 1 FROM sesiones WHERE usuario_id = @usuario_google), 'La cuenta Google usa la misma tabla de sesiones');

ROLLBACK;
DROP PROCEDURE rechazar_identidades;
DROP PROCEDURE comprobar_identidades;
SELECT @casos_identidades AS casos_aprobados;
