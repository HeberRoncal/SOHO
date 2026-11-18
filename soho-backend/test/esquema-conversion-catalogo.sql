-- SOLO MySQL exclusivo con sufijo _test y diez migraciones.
SET @casos_conversion=0;
DELIMITER //
CREATE PROCEDURE comprobar_conversion(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
  IF RIGHT(DATABASE(),5) <> '_test' OR condicion IS NULL OR NOT condicion THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
  END IF;
  SET @casos_conversion = @casos_conversion + 1;
END//
CREATE PROCEDURE rechazar_conversion(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
  DECLARE recibido INT DEFAULT 0;
  DECLARE mensaje VARCHAR(128);
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
    SET @sql_conversion = sentencia;
    PREPARE consulta_conversion FROM @sql_conversion;
    EXECUTE consulta_conversion;
    DEALLOCATE PREPARE consulta_conversion;
  END;
  IF recibido <> esperado THEN
    SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
  END IF;
  SET @casos_conversion = @casos_conversion + 1;
END//
DELIMITER ;
CALL comprobar_conversion(RIGHT(DATABASE(),5)='_test','Base aislada');
CALL comprobar_conversion((SELECT COUNT(*)=32 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name<>'_prisma_migrations'),'32 tablas de negocio');
CALL comprobar_conversion((SELECT COUNT(*)=1 FROM conversion_catalogo WHERE id=1 AND realizada_en IS NULL AND huella_origen IS NULL AND manifiesto IS NULL),'Punto inicial pendiente');
START TRANSACTION;
CALL rechazar_conversion('UPDATE conversion_catalogo SET id=2 WHERE id=1',3819,'Un solo punto');
CALL rechazar_conversion('UPDATE conversion_catalogo SET huella_origen=REPEAT(CHAR(97),64) WHERE id=1',3819,'No permite metadatos parciales');
CALL rechazar_conversion('UPDATE conversion_catalogo SET realizada_en=NOW(3) WHERE id=1',3819,'Fecha sola no confirma conversion');
UPDATE conversion_catalogo SET huella_origen=REPEAT('a',64),huella_manifiesto=REPEAT('b',64),manifiesto=JSON_OBJECT('version',1),realizada_en=NOW(3) WHERE id=1;
CALL comprobar_conversion((SELECT realizada_en IS NOT NULL FROM conversion_catalogo WHERE id=1),'Confirmacion completa');
CALL rechazar_conversion('UPDATE conversion_catalogo SET manifiesto=JSON_ARRAY() WHERE id=1',3819,'Manifiesto objeto');
CALL rechazar_conversion('UPDATE conversion_catalogo SET huella_manifiesto=NULL WHERE id=1',3819,'Hash no nulo al confirmar');
INSERT INTO productos(id,slug,codigo_interno,nombre,codigo_modelo) VALUES(UUID(),'conversion-uno','SHO-8000','Nombre compartido','MODELO'),(UUID(),'conversion-dos','SHO-8001','Nombre compartido','MODELO');
CALL comprobar_conversion((SELECT COUNT(*)=2 FROM productos WHERE codigo_modelo='MODELO'),'Modelo puede compartir varios colores');
INSERT INTO productos(id,slug,codigo_interno,nombre) VALUES(UUID(),'conversion-largo','SHO-8002',REPEAT('N',180));
CALL comprobar_conversion((SELECT CHAR_LENGTH(nombre)=180 FROM productos WHERE slug='conversion-largo'),'Nombre completo sin truncar');
ROLLBACK;
CALL comprobar_conversion((SELECT realizada_en IS NULL FROM conversion_catalogo WHERE id=1),'Rollback del punto');
DROP PROCEDURE rechazar_conversion;
DROP PROCEDURE comprobar_conversion;
SELECT @casos_conversion;
