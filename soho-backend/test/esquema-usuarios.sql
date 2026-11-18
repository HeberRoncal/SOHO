-- SOLO para una base aislada con las migraciones del proyecto aplicadas. No usar --force.
-- Las filas se revierten; los hashes sintéticos prueban la estructura, no un inicio de sesión.
SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_usuarios = 0;

DELIMITER //
CREATE PROCEDURE comprobar_usuarios(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF condicion IS NULL OR NOT condicion THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_usuarios = @casos_usuarios + 1;
END//

CREATE PROCEDURE rechazar_usuarios(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING
            GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sql_usuarios = sentencia;
        PREPARE consulta_usuarios FROM @sql_usuarios;
        EXECUTE consulta_usuarios;
        DEALLOCATE PREPARE consulta_usuarios;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_usuarios = @casos_usuarios + 1;
END//
DELIMITER ;

START TRANSACTION;
SET @admin = UUID(), @cliente = UUID(), @sesion = UUID(), @token = UUID();
SET @ahora = CURRENT_TIMESTAMP(3);
SET @hash_clave = CONCAT('$argon2id$v=19$m=19456,t=2,p=1$', REPEAT('A',22), '$', REPEAT('B',43));

INSERT INTO usuarios (id, nombres, apellidos, correo, clave_hash)
VALUES (@cliente, 'Ana', 'Cliente', 'cliente@usuarios.test', @hash_clave);
INSERT INTO usuarios (id, nombres, apellidos, correo, clave_hash, rol, correo_verificado_en)
VALUES (@admin, 'Admin', 'SOHO', 'admin@usuarios.test', @hash_clave, 'ADMIN', @ahora);
CALL comprobar_usuarios((SELECT rol = 'CLIENTE' AND activo = TRUE AND correo_verificado_en IS NULL FROM usuarios WHERE id = @cliente), 'El rol predeterminado debe ser CLIENTE');
CALL comprobar_usuarios((SELECT rol = 'ADMIN' FROM usuarios WHERE id = @admin), 'Debe admitir ADMIN explicitamente');
CALL rechazar_usuarios(CONCAT('INSERT INTO usuarios (id,nombres,apellidos,correo,clave_hash) VALUES (UUID(),''Otra'',''Persona'',''cliente@usuarios.test'',',QUOTE(@hash_clave),')'),1062,'Correo duplicado');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET correo = ''CLIENTE@usuarios.test'' WHERE id = ',QUOTE(@cliente)),3819,'Correo en mayusculas');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET correo = '' cliente@usuarios.test'' WHERE id = ',QUOTE(@cliente)),3819,'Correo con espacios');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET correo = ''sin-arroba'' WHERE id = ',QUOTE(@cliente)),3819,'Correo invalido');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET nombres = '' '' WHERE id = ',QUOTE(@cliente)),3819,'Nombre vacio');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET apellidos = '' '' WHERE id = ',QUOTE(@cliente)),3819,'Apellido vacio');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET clave_hash = ''clave-en-texto-plano'' WHERE id = ',QUOTE(@cliente)),3819,'Clave sin hash');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET rol = ''PROPIETARIO'' WHERE id = ',QUOTE(@admin)),1265,'Tercer rol no admitido');
CALL rechazar_usuarios(CONCAT('UPDATE usuarios SET activo = 2 WHERE id = ',QUOTE(@cliente)),3819,'Estado booleano invalido');

INSERT INTO usuarios (id,nombres,apellidos,correo,clave_hash) VALUES
    (UUID(),'Jose','Cliente','jose@usuarios.test',@hash_clave),
    (UUID(),'José','Cliente','josé@usuarios.test',@hash_clave);
CALL comprobar_usuarios((SELECT COUNT(*) = 2 FROM usuarios WHERE correo IN ('jose@usuarios.test','josé@usuarios.test')), 'La unicidad no debe eliminar acentos');

INSERT INTO sesiones (id,usuario_id,token_hash,creada_en,ultima_actividad_en,expira_en)
VALUES (@sesion,@cliente,REPEAT('a',64),@ahora,@ahora,DATE_ADD(@ahora,INTERVAL 1 HOUR));
CALL comprobar_usuarios((SELECT revocada_en IS NULL FROM sesiones WHERE id = @sesion), 'La sesion nueva comienza sin revocar');
CALL rechazar_usuarios(CONCAT('INSERT INTO sesiones (id,usuario_id,token_hash,expira_en) VALUES (UUID(),',QUOTE(@cliente),',REPEAT(''a'',64),DATE_ADD(NOW(3),INTERVAL 1 HOUR))'),1062,'Hash de sesion duplicado');
CALL rechazar_usuarios('INSERT INTO sesiones (id,usuario_id,token_hash,expira_en) VALUES (UUID(),UUID(),REPEAT(''b'',64),DATE_ADD(NOW(3),INTERVAL 1 HOUR))',1452,'Sesion sin usuario');
CALL rechazar_usuarios(CONCAT('UPDATE sesiones SET token_hash = ''token-sin-hash'' WHERE id = ',QUOTE(@sesion)),3819,'Sesion con token crudo');
CALL rechazar_usuarios(CONCAT('UPDATE sesiones SET token_hash = REPEAT(''A'',64) WHERE id = ',QUOTE(@sesion)),3819,'Hash de sesion no canonico');
CALL rechazar_usuarios(CONCAT('UPDATE sesiones SET expira_en = creada_en WHERE id = ',QUOTE(@sesion)),3819,'Sesion sin vigencia');
CALL rechazar_usuarios(CONCAT('UPDATE sesiones SET ultima_actividad_en = DATE_SUB(creada_en,INTERVAL 1 SECOND) WHERE id = ',QUOTE(@sesion)),3819,'Actividad anterior a creacion');
CALL rechazar_usuarios(CONCAT('UPDATE sesiones SET ultima_actividad_en = DATE_ADD(expira_en,INTERVAL 1 SECOND) WHERE id = ',QUOTE(@sesion)),3819,'Actividad posterior a vencimiento');
CALL rechazar_usuarios(CONCAT('UPDATE sesiones SET revocada_en = DATE_SUB(creada_en,INTERVAL 1 SECOND) WHERE id = ',QUOTE(@sesion)),3819,'Revocacion de sesion incoherente');
UPDATE sesiones SET revocada_en = @ahora WHERE id = @sesion;
CALL comprobar_usuarios((SELECT revocada_en IS NOT NULL FROM sesiones WHERE id = @sesion), 'Debe guardar la revocacion');

INSERT INTO tokens_usuario (id,usuario_id,tipo,token_hash,creado_en,expira_en)
VALUES (@token,@cliente,'VERIFICACION_CORREO',REPEAT('c',64),@ahora,DATE_ADD(@ahora,INTERVAL 1 HOUR));
INSERT INTO tokens_usuario (id,usuario_id,tipo,token_hash,creado_en,expira_en)
VALUES (UUID(),@cliente,'RECUPERACION_CLAVE',REPEAT('d',64),@ahora,DATE_ADD(@ahora,INTERVAL 1 HOUR));
CALL comprobar_usuarios((SELECT COUNT(*) = 2 FROM tokens_usuario WHERE usuario_id = @cliente), 'Debe admitir ambos propositos');
CALL rechazar_usuarios(CONCAT('INSERT INTO tokens_usuario (id,usuario_id,tipo,token_hash,expira_en) VALUES (UUID(),',QUOTE(@cliente),',''VERIFICACION_CORREO'',REPEAT(''c'',64),DATE_ADD(NOW(3),INTERVAL 1 HOUR))'),1062,'Hash de token duplicado');
CALL rechazar_usuarios('INSERT INTO tokens_usuario (id,usuario_id,tipo,token_hash,expira_en) VALUES (UUID(),UUID(),''RECUPERACION_CLAVE'',REPEAT(''e'',64),DATE_ADD(NOW(3),INTERVAL 1 HOUR))',1452,'Token sin usuario');
CALL rechazar_usuarios(CONCAT('UPDATE tokens_usuario SET tipo = ''INVITACION'' WHERE id = ',QUOTE(@token)),1265,'Proposito no admitido');
CALL rechazar_usuarios(CONCAT('UPDATE tokens_usuario SET token_hash = ''enlace-en-texto-plano'' WHERE id = ',QUOTE(@token)),3819,'Token de enlace sin hash');
CALL rechazar_usuarios(CONCAT('UPDATE tokens_usuario SET expira_en = creado_en WHERE id = ',QUOTE(@token)),3819,'Token sin vigencia');
CALL rechazar_usuarios(CONCAT('UPDATE tokens_usuario SET usado_en = DATE_SUB(creado_en,INTERVAL 1 SECOND) WHERE id = ',QUOTE(@token)),3819,'Consumo anterior a creacion');
CALL rechazar_usuarios(CONCAT('UPDATE tokens_usuario SET usado_en = DATE_ADD(expira_en,INTERVAL 1 SECOND) WHERE id = ',QUOTE(@token)),3819,'Consumo posterior a vencimiento');
CALL rechazar_usuarios(CONCAT('UPDATE tokens_usuario SET revocado_en = DATE_SUB(creado_en,INTERVAL 1 SECOND) WHERE id = ',QUOTE(@token)),3819,'Revocacion de token incoherente');
UPDATE tokens_usuario SET usado_en = @ahora WHERE id = @token;
CALL comprobar_usuarios((SELECT usado_en IS NOT NULL FROM tokens_usuario WHERE id = @token), 'Debe guardar el consumo');
CALL rechazar_usuarios(CONCAT('DELETE FROM usuarios WHERE id = ',QUOTE(@cliente)),1451,'Borrado de usuario con sesiones o tokens');

-- Referencia al responsable y conservación de movimientos anteriores sin responsable.
SET @producto_auth = UUID(), @color_auth = UUID(), @variante_auth = UUID(), @mov_auth = UUID();
SET @sku_auth = CONCAT('AUTH-',LEFT(REPLACE(UUID(),'-',''),12));
INSERT INTO productos (id,slug,codigo_interno,nombre)
VALUES (@producto_auth,CONCAT('auth-',UUID()),@sku_auth,CONCAT('Prueba usuarios ',UUID()));
INSERT INTO producto_colores (id,producto_id,codigo,nombre,hexadecimal)
VALUES (@color_auth,@producto_auth,'BL','Blanco','#FFFFFF');
INSERT INTO tallas (id,valor) VALUES (UUID(),40) ON DUPLICATE KEY UPDATE id = id;
SET @talla_auth = (SELECT id FROM tallas WHERE sistema = 'EU' AND valor = 40);
INSERT INTO variantes (id,producto_color_id,talla_id,sku,existencias)
VALUES (@variante_auth,@color_auth,@talla_auth,@sku_auth,1);
INSERT INTO movimientos_inventario
    (id,variante_id,usuario_responsable_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen)
VALUES (@mov_auth,@variante_auth,@admin,'ENTRADA',1,0,1,0,TRUE,'Prueba de responsable','MANUAL');
CALL comprobar_usuarios((SELECT usuario_responsable_id = @admin FROM movimientos_inventario WHERE id = @mov_auth), 'Debe enlazar al usuario responsable');
CALL rechazar_usuarios(CONCAT('UPDATE movimientos_inventario SET usuario_responsable_id = UUID() WHERE id = ',QUOTE(@mov_auth)),1452,'Responsable inexistente');
CALL rechazar_usuarios(CONCAT('DELETE FROM usuarios WHERE id = ',QUOTE(@admin)),1451,'Borrado de responsable con historial');
UPDATE movimientos_inventario SET usuario_responsable_id = NULL WHERE id = @mov_auth;
CALL comprobar_usuarios((SELECT usuario_responsable_id IS NULL FROM movimientos_inventario WHERE id = @mov_auth), 'El esquema admite historial anterior sin responsable');

ROLLBACK;
DROP PROCEDURE rechazar_usuarios;
DROP PROCEDURE comprobar_usuarios;
SELECT @casos_usuarios AS casos_aprobados;
