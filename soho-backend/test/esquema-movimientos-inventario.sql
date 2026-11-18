-- SOLO MySQL temporal exclusivo con sufijo _test y once migraciones. Sin --force.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_movimientos=0;
DELIMITER //
CREATE PROCEDURE comprobar_movimientos(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
  IF RIGHT(DATABASE(),5)<>'_test' OR condicion IS NULL OR NOT condicion THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=mensaje;
  END IF;
  SET @casos_movimientos=@casos_movimientos+1;
END//
CREATE PROCEDURE rechazar_movimientos(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
  DECLARE recibido INT DEFAULT 0;
  DECLARE mensaje VARCHAR(128);
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING GET DIAGNOSTICS CONDITION 1 recibido=MYSQL_ERRNO;
    SET @sql_movimientos=sentencia;
    PREPARE consulta_movimientos FROM @sql_movimientos;
    EXECUTE consulta_movimientos;
    DEALLOCATE PREPARE consulta_movimientos;
  END;
  IF recibido<>esperado THEN
    SET mensaje=CONCAT(caso,': esperado ',esperado,', recibido ',recibido);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=mensaje;
  END IF;
  SET @casos_movimientos=@casos_movimientos+1;
END//
DELIMITER ;
CALL comprobar_movimientos(RIGHT(DATABASE(),5)='_test','Base de pruebas exclusiva');
CALL comprobar_movimientos((SELECT COUNT(*)=32 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name<>'_prisma_migrations'),'Se conservan 32 tablas de negocio');
CALL comprobar_movimientos((SELECT COUNT(*)=6 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_type='CHECK' AND constraint_name IN ('variantes_version_existencias_positiva','movimientos_recuperacion_completa','movimientos_recuperacion_manual','movimientos_solicitud_uuid','movimientos_solicitud_hash','movimientos_respuesta_objeto')),'Seis restricciones nuevas');
START TRANSACTION;
SET @p=UUID(),@c=UUID(),@t=UUID(),@v=UUID(),@v2=UUID(),@u=UUID(),@u2=UUID(),@m=UUID(),@clave=UUID();
INSERT INTO usuarios(id,nombres,apellidos,correo,clave_hash,rol) VALUES
(@u,'Ana','Movimientos','ana@movimientos-esquema.test',CONCAT('$argon2id$v=19$m=19456,t=2,p=1$',REPEAT('A',22),'$',REPEAT('B',43)),'ADMIN'),
(@u2,'Otra','Administradora','otra@movimientos-esquema.test',CONCAT('$argon2id$v=19$m=19456,t=2,p=1$',REPEAT('C',22),'$',REPEAT('D',43)),'ADMIN');
INSERT INTO productos(id,slug,codigo_interno,nombre) VALUES(@p,'mov-esquema','SHO-MOV-TEST','Producto de movimientos');
INSERT INTO producto_colores(id,producto_id,codigo,nombre,hexadecimal) VALUES(@c,@p,'BL','Blanco','#FFFFFF');
INSERT INTO tallas(id,valor) VALUES(@t,40.5);
INSERT INTO variantes(id,producto_id,producto_color_id,talla_id,sku,existencias,cantidad_reservada)
VALUES(@v,@p,@c,@t,'MOV-TEST-BL-40P5',1,3);
INSERT INTO producto_colores(id,producto_id,codigo,nombre,hexadecimal) VALUES(UUID(),@p,'NG','Negro','#000000');
INSERT INTO variantes(id,producto_id,producto_color_id,talla_id,sku,existencias,cantidad_reservada)
SELECT @v2,NULL,id,@t,'MOV-TEST-NG-40P5',0,0 FROM producto_colores WHERE producto_id=@p AND codigo='NG';
CALL comprobar_movimientos((SELECT version_existencias=1 AND existencias=1 AND cantidad_reservada=3 FROM variantes WHERE id=@v),'Version inicial con deficit conservado');
CALL rechazar_movimientos('UPDATE variantes SET version_existencias=0 WHERE id=@v',3819,'Version cero');
CALL rechazar_movimientos('UPDATE variantes SET version_existencias=-1 WHERE id=@v',1264,'Version negativa');
CALL rechazar_movimientos('UPDATE variantes SET version_existencias=NULL WHERE id=@v',1048,'Version obligatoria');
CALL rechazar_movimientos('UPDATE variantes SET version_existencias=4294967296 WHERE id=@v',1264,'Version fuera de rango');
UPDATE variantes SET version_existencias=4294967295 WHERE id=@v;
CALL comprobar_movimientos((SELECT version_existencias=4294967295 FROM variantes WHERE id=@v),'Version unsigned maxima');
UPDATE variantes SET version_existencias=1 WHERE id=@v;
INSERT INTO movimientos_inventario(id,variante_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen)
VALUES(UUID(),@v,'ENTRADA',1,0,1,0,TRUE,'Historico manual sin responsable','MANUAL'),
(UUID(),@v,'ENTRADA',1,0,1,0,TRUE,'Historico inicial','STOCK_INICIAL');
CALL comprobar_movimientos((SELECT COUNT(*)=2 FROM movimientos_inventario WHERE variante_id=@v AND clave_solicitud IS NULL AND solicitud_hash IS NULL AND respuesta IS NULL),'Varias claves nulas historicas compatibles');
INSERT INTO movimientos_inventario(id,variante_id,usuario_responsable_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen,clave_solicitud,solicitud_hash,respuesta)
VALUES(@m,@v,@u,'ENTRADA',2,1,3,3,TRUE,'Entrada manual recuperable','MANUAL',@clave,REPEAT('a',64),JSON_OBJECT('movimiento',JSON_OBJECT('id',@m,'saldo',3),'operacion',JSON_OBJECT('claveSolicitud',@clave,'versionAnterior',1,'versionPosterior',2)));
CALL comprobar_movimientos((SELECT JSON_UNQUOTE(JSON_EXTRACT(respuesta,'$.movimiento.id'))=@m AND JSON_EXTRACT(respuesta,'$.movimiento.saldo')=3 FROM movimientos_inventario WHERE clave_solicitud=@clave),'Respuesta original por clave');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET clave_solicitud=NULL WHERE id=@m',3819,'Hash y respuesta sin clave');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET solicitud_hash=NULL WHERE id=@m',3819,'Clave y respuesta sin hash');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET respuesta=NULL WHERE id=@m',3819,'Clave y hash sin respuesta');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET solicitud_hash=NULL,respuesta=NULL WHERE id=@m',3819,'Solo clave');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET clave_solicitud=NULL,respuesta=NULL WHERE id=@m',3819,'Solo hash');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET clave_solicitud=NULL,solicitud_hash=NULL WHERE id=@m',3819,'Solo respuesta');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET usuario_responsable_id=NULL WHERE id=@m',3819,'Responsable obligatorio en operacion nueva');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET origen=''STOCK_INICIAL'',saldo_anterior=0,saldo_posterior=2 WHERE id=@m',3819,'Recuperacion reservada a manuales');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET clave_solicitud='''' WHERE id=@m',3819,'Clave vacia');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET clave_solicitud=''00000000-0000-0000-0000-00000000000Z'' WHERE id=@m',3819,'Clave no hexadecimal');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET clave_solicitud=REPEAT(''a'',36) WHERE id=@m',3819,'Clave sin separadores UUID');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET clave_solicitud=''abcd'' WHERE id=@m',3819,'Clave corta');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET solicitud_hash='''' WHERE id=@m',3819,'Hash vacio');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET solicitud_hash=''abcd'' WHERE id=@m',3819,'Hash corto');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET solicitud_hash=REPEAT(''A'',64) WHERE id=@m',3819,'Hash en mayusculas');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET solicitud_hash=REPEAT(''g'',64) WHERE id=@m',3819,'Hash no hexadecimal');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET respuesta=CAST(''null'' AS JSON) WHERE id=@m',3819,'JSON null no es SQL NULL');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET respuesta=JSON_ARRAY() WHERE id=@m',3819,'Respuesta array');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET respuesta=CAST(''1'' AS JSON) WHERE id=@m',3819,'Respuesta numerica');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET respuesta=JSON_QUOTE(''texto'') WHERE id=@m',3819,'Respuesta string');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET respuesta=CAST(''true'' AS JSON) WHERE id=@m',3819,'Respuesta booleana');
CALL rechazar_movimientos('INSERT INTO movimientos_inventario(id,variante_id,usuario_responsable_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen,clave_solicitud,solicitud_hash,respuesta) SELECT UUID(),@v2,@u2,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen,clave_solicitud,solicitud_hash,respuesta FROM movimientos_inventario WHERE id=@m',1062,'Clave unica entre variantes y responsables');
CALL rechazar_movimientos('INSERT INTO movimientos_inventario(id,variante_id,usuario_responsable_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen,clave_solicitud,solicitud_hash,respuesta) SELECT UUID(),variante_id,usuario_responsable_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen,UPPER(clave_solicitud),solicitud_hash,respuesta FROM movimientos_inventario WHERE id=@m',1062,'Mismo UUID con otra capitalizacion');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET cantidad=0,saldo_posterior=saldo_anterior WHERE id=@m',3819,'Se conserva delta no cero');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET saldo_posterior=5 WHERE id=@m',3819,'Se conserva coherencia de saldos');
CALL rechazar_movimientos('UPDATE movimientos_inventario SET tipo=''SALIDA'' WHERE id=@m',3819,'Se conserva signo por tipo');
CALL rechazar_movimientos('UPDATE variantes SET existencias=100000 WHERE id=@v',3819,'Se conserva limite fisico');
CALL rechazar_movimientos('UPDATE variantes SET cantidad_reservada=100000 WHERE id=@v',3819,'Se conserva limite reservado');
UPDATE variantes SET existencias=3,version_existencias=version_existencias+1 WHERE id=@v AND version_existencias=1;
CALL comprobar_movimientos(ROW_COUNT()=1,'Actualizacion con version observada');
UPDATE variantes SET existencias=4,version_existencias=version_existencias+1 WHERE id=@v AND version_existencias=1;
CALL comprobar_movimientos(ROW_COUNT()=0,'Version obsoleta no actualiza');
CALL comprobar_movimientos((SELECT existencias=3 AND version_existencias=2 AND cantidad_reservada=3 FROM variantes WHERE id=@v),'Reserva y version final correctas');
UPDATE movimientos_inventario SET clave_solicitud=UPPER(@clave) WHERE id=@m;
CALL comprobar_movimientos((SELECT COUNT(*)=1 FROM movimientos_inventario WHERE clave_solicitud=@clave),'UUID valido con mayusculas');
ROLLBACK;
CALL comprobar_movimientos((SELECT COUNT(*)=0 FROM productos WHERE id=@p),'Rollback de filas sinteticas');
DROP PROCEDURE rechazar_movimientos;
DROP PROCEDURE comprobar_movimientos;
SELECT @casos_movimientos;
