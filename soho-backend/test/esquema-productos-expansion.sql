-- Solo MySQL aislado con sufijo _test y nueve migraciones. Sin --force.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_expansion = 0;
DELIMITER //
CREATE PROCEDURE comprobar_expansion(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
  IF RIGHT(DATABASE(),5) <> '_test' OR condicion IS NULL OR NOT condicion THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
  END IF;
  SET @casos_expansion = @casos_expansion + 1;
END//
CREATE PROCEDURE rechazar_expansion(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
  DECLARE recibido INT DEFAULT 0;
  DECLARE mensaje VARCHAR(128);
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
    SET @sql_expansion = sentencia;
    PREPARE consulta_expansion FROM @sql_expansion;
    EXECUTE consulta_expansion;
    DEALLOCATE PREPARE consulta_expansion;
  END;
  IF recibido <> esperado THEN
    SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
  END IF;
  SET @casos_expansion = @casos_expansion + 1;
END//
DELIMITER ;
CALL comprobar_expansion(RIGHT(DATABASE(),5)='_test','Base exclusiva');
CALL comprobar_expansion((SELECT COUNT(*)=31 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name NOT IN ('_prisma_migrations','conversion_catalogo')),'31 tablas de negocio');
CALL comprobar_expansion((SELECT COUNT(*)=0 FROM grupos_modelo),'No se inventaron grupos');
CALL comprobar_expansion((SELECT COUNT(*)=0 FROM secuencia_codigo_producto),'Contador sin inicializar');
START TRANSACTION;
SET @p1=UUID(),@p2=UUID(),@g=UUID(),@u=UUID(),@a=UUID(),@cloud=UUID(),@im=UUID(),@op=UUID(),@alias=UUID();
SET @c1=UUID(),@c2=UUID(),@t=UUID(),@v1=UUID(),@v2=UUID();
INSERT INTO usuarios(id,nombres,apellidos,correo,clave_hash,rol) VALUES(@u,'Ana','Expansion','ana@expansion.test',CONCAT('$argon2id$v=19$m=19456,t=2,p=1$',REPEAT('A',22),'$',REPEAT('B',43)),'ADMIN');
INSERT INTO productos(id,slug,codigo_interno,nombre) VALUES(@p1,'exp-uno','SHO-0900','Producto expansion uno'),(@p2,'exp-dos','SHO-0901','Producto expansion dos');
CALL comprobar_expansion((SELECT grupo_modelo_id IS NULL AND codigo_color IS NULL AND version=1 FROM productos WHERE id=@p1),'Producto anterior compatible');
INSERT INTO producto_colores(id,producto_id,codigo,nombre,hexadecimal) VALUES(@c1,@p1,'BL','Blanco','#FFFFFF'),(@c2,@p2,'NG','Negro','#000000');
INSERT INTO tallas(id,valor) VALUES(@t,40.5);
INSERT INTO variantes(id,producto_color_id,talla_id,sku,existencias,cantidad_reservada) VALUES(@v1,@c1,@t,'EXP-BL-40P5',1,3),(@v2,@c2,@t,'EXP-NG-40P5',0,0);
CALL comprobar_expansion((SELECT producto_id IS NULL AND cantidad_reservada=3 AND existencias=1 FROM variantes WHERE id=@v1),'Reservas mayores que stock intactas');
INSERT INTO grupos_modelo(id,codigo_modelo,modelo,slug_carpeta) VALUES(@g,'AF107','Air Force 1','nike-air-force-1-07');
UPDATE productos SET grupo_modelo_id=@g,codigo_color='BL',color_nombre='Blanco',color_hexadecimal='#FFFFFF' WHERE id=@p1;
UPDATE variantes SET producto_id=@p1 WHERE id=@v1;
UPDATE variantes SET producto_id=@p2 WHERE id=@v2;
INSERT INTO archivos_imagen(id,producto_origen_id,proveedor,estado,clave_carga,solicitud_hash,url_entrega,confirmado_en)
VALUES(@a,@p1,'LEGADO','DISPONIBLE',UUID(),REPEAT('a',64),'/imagenes/historica.webp',NOW(3));
INSERT INTO archivos_imagen(id,producto_origen_id,clave_carga,solicitud_hash,cloud_name,public_id,resource_type,delivery_type,carpeta_cloudinary)
VALUES(@cloud,@p1,UUID(),REPEAT('b',64),'soho-test','archivo-uuid','image','upload','SOHO/productos/nike/SHO-0900-blanco');
UPDATE archivos_imagen SET estado='CONCILIANDO',token_carga=UUID(),bloqueo_carga_hasta=DATE_ADD(NOW(3),INTERVAL 1 MINUTE) WHERE id=@cloud;
UPDATE archivos_imagen SET estado='DISPONIBLE',token_carga=NULL,bloqueo_carga_hasta=NULL,asset_id='asset-test',version_cloudinary=1,url_entrega='https://example.test/v1/foto.webp',formato='webp',ancho=1200,alto=1200,bytes=100,confirmado_en=NOW(3) WHERE id=@cloud;
INSERT INTO imagenes_producto(id,producto_id,ruta,archivo_id,orden) VALUES(@im,@p1,'/imagenes/anterior.webp',@a,0);
INSERT INTO operaciones_producto(id,clave_solicitud,solicitud_hash,producto_id,usuario_responsable_id,tipo,version_posterior,despues,respuesta)
VALUES(@op,UUID(),REPEAT('c',64),@p1,@u,'CREAR',1,JSON_OBJECT('id',@p1),JSON_OBJECT('id',@p1));
INSERT INTO alias_producto(id,slug_anterior,producto_destino_id) VALUES(@alias,'exp-antiguo',@p1);
INSERT INTO secuencia_codigo_producto(id,ultimo_numero) VALUES(1,9999);
CALL rechazar_expansion('UPDATE productos SET codigo_color=''bl'' WHERE id=@p1',3819,'codigo color mayuscula');
CALL rechazar_expansion('UPDATE productos SET color_nombre='''' WHERE id=@p1',3819,'nombre color no vacio');
CALL rechazar_expansion('UPDATE productos SET color_hexadecimal=''#GG0000'' WHERE id=@p1',3819,'hexadecimal valido');
CALL rechazar_expansion('UPDATE productos SET carpeta_imagenes='' '' WHERE id=@p1',3819,'carpeta no vacia');
CALL rechazar_expansion('UPDATE productos SET version=0 WHERE id=@p1',3819,'version positiva');
CALL rechazar_expansion('UPDATE grupos_modelo SET codigo_modelo=''AF-107'' WHERE id=@g',3819,'modelo alfanumerico');
CALL rechazar_expansion('UPDATE grupos_modelo SET modelo='''' WHERE id=@g',3819,'modelo no vacio');
CALL rechazar_expansion('UPDATE grupos_modelo SET slug_carpeta=''Nike/Modelo'' WHERE id=@g',3819,'slug carpeta valido');
CALL rechazar_expansion('UPDATE grupos_modelo SET version=0 WHERE id=@g',3819,'version grupo positiva');
CALL rechazar_expansion('UPDATE archivos_imagen SET solicitud_hash=''XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'' WHERE id=@cloud',3819,'hash valido');
CALL rechazar_expansion('UPDATE archivos_imagen SET hash_contenido=''bad'' WHERE id=@cloud',3819,'hash contenido valido');
CALL rechazar_expansion('UPDATE archivos_imagen SET cloud_name=NULL WHERE id=@cloud',3819,'cloud name requerido');
CALL rechazar_expansion('UPDATE archivos_imagen SET public_id=NULL WHERE id=@cloud',3819,'public id requerido');
CALL rechazar_expansion('UPDATE archivos_imagen SET resource_type=''video'' WHERE id=@cloud',3819,'solo imagen');
CALL rechazar_expansion('UPDATE archivos_imagen SET delivery_type=''private'' WHERE id=@cloud',3819,'entrega catalogo');
CALL rechazar_expansion('UPDATE archivos_imagen SET carpeta_cloudinary=NULL WHERE id=@cloud',3819,'carpeta requerida');
CALL rechazar_expansion('UPDATE archivos_imagen SET asset_id=NULL WHERE id=@cloud',3819,'asset confirmado requerido');
CALL rechazar_expansion('UPDATE archivos_imagen SET version_cloudinary=NULL WHERE id=@cloud',3819,'version externa requerida');
CALL rechazar_expansion('UPDATE archivos_imagen SET version_cloudinary=0 WHERE id=@cloud',3819,'version externa positiva');
CALL rechazar_expansion('UPDATE archivos_imagen SET url_entrega=''http://example.test/foto'' WHERE id=@cloud',3819,'url https');
CALL rechazar_expansion('UPDATE archivos_imagen SET formato=''svg'' WHERE id=@cloud',3819,'formato admitido');
CALL rechazar_expansion('UPDATE archivos_imagen SET ancho=NULL WHERE id=@cloud',3819,'ancho no nulo');
CALL rechazar_expansion('UPDATE archivos_imagen SET alto=0 WHERE id=@cloud',3819,'alto positivo');
CALL rechazar_expansion('UPDATE archivos_imagen SET bytes=5242881 WHERE id=@cloud',3819,'limite archivo');
CALL rechazar_expansion('UPDATE archivos_imagen SET confirmado_en=NULL WHERE id=@cloud',3819,'fecha confirmacion requerida');
CALL rechazar_expansion('UPDATE archivos_imagen SET token_carga=''ffffffffffffffffffffffffffffffffffff'' WHERE id=@cloud',3819,'bloqueo carga coherente');
CALL rechazar_expansion('UPDATE archivos_imagen SET estado=''ELIMINANDO'' WHERE id=@cloud',3819,'limpieza requiere token');
CALL rechazar_expansion('UPDATE archivos_imagen SET token_limpieza=''ffffffffffffffffffffffffffffffffffff'' WHERE id=@cloud',3819,'token solo limpiando');
CALL rechazar_expansion('UPDATE archivos_imagen SET estado=''ELIMINADO'' WHERE id=@cloud',3819,'eliminacion requiere fecha');
CALL rechazar_expansion('UPDATE operaciones_producto SET solicitud_hash=''no-valido'' WHERE id=@op',3819,'hash operacion');
CALL rechazar_expansion('UPDATE operaciones_producto SET version_posterior=2 WHERE id=@op',3819,'creacion empieza version uno');
CALL rechazar_expansion('UPDATE operaciones_producto SET tipo=''ACTUALIZAR'' WHERE id=@op',3819,'edicion requiere antes y version');
CALL rechazar_expansion('UPDATE operaciones_producto SET despues=''[]'' WHERE id=@op',3819,'snapshot objeto');
CALL rechazar_expansion('UPDATE operaciones_producto SET respuesta=''[]'' WHERE id=@op',3819,'respuesta objeto');
CALL rechazar_expansion('UPDATE secuencia_codigo_producto SET id=2 WHERE id=1',3819,'contador unico');
CALL rechazar_expansion('UPDATE alias_producto SET slug_anterior=''UPPER'' WHERE id=@alias',3819,'alias normalizado');
CALL rechazar_expansion('UPDATE alias_producto SET codigo_color=''bL'' WHERE id=@alias',3819,'alias color valido');
CALL rechazar_expansion('UPDATE archivos_imagen SET asset_id=''inventado'' WHERE id=@a',3819,'Legado sin identidad externa inventada');
CALL rechazar_expansion('UPDATE productos SET grupo_modelo_id=UUID() WHERE id=@p2',1452,'FK grupo existente');
CALL rechazar_expansion('UPDATE productos SET grupo_modelo_id=@g,codigo_color=''BL'' WHERE id=@p2',1062,'Un color por grupo');
CALL rechazar_expansion('UPDATE variantes SET producto_id=@p1 WHERE id=@v2',1062,'Una talla por producto destino');
CALL rechazar_expansion('UPDATE imagenes_producto SET producto_id=@p2 WHERE id=@im',1452,'FK compuesta impide archivo ajeno');
CALL rechazar_expansion('DELETE FROM archivos_imagen WHERE id=@a',1451,'No borrar archivo asociado');
CALL comprobar_expansion((SELECT ruta='/imagenes/anterior.webp' AND archivo_id=@a FROM imagenes_producto WHERE id=@im),'Conserva ruta anterior al asociar archivo');
UPDATE archivos_imagen SET estado='ELIMINANDO',token_limpieza=UUID(),bloqueo_limpieza_hasta=DATE_ADD(NOW(3),INTERVAL 1 MINUTE) WHERE id=@cloud;
UPDATE archivos_imagen SET estado='ELIMINADO',token_limpieza=NULL,bloqueo_limpieza_hasta=NULL,eliminado_en=NOW(3) WHERE id=@cloud;
CALL comprobar_expansion((SELECT estado='ELIMINADO' FROM archivos_imagen WHERE id=@cloud),'Transicion de limpieza coherente');
UPDATE operaciones_producto SET tipo='ACTUALIZAR',version_anterior=1,version_posterior=2,antes=JSON_OBJECT('version',1) WHERE id=@op;
CALL comprobar_expansion((SELECT version_posterior=2 FROM operaciones_producto WHERE id=@op),'Auditoria de edicion coherente');
UPDATE secuencia_codigo_producto SET ultimo_numero=10000 WHERE id=1;
CALL comprobar_expansion((SELECT ultimo_numero=10000 FROM secuencia_codigo_producto),'Contador supera cuatro digitos');
CALL comprobar_expansion((SELECT sku='EXP-BL-40P5' AND cantidad_reservada=3 FROM variantes WHERE id=@v1),'Identidad y reservas conservadas');
ROLLBACK;
CALL comprobar_expansion((SELECT COUNT(*)=0 FROM archivos_imagen),'Rollback sin datos externos inventados');
CALL comprobar_expansion((SELECT COUNT(*)=0 FROM secuencia_codigo_producto),'Rollback deja contador sin inicializar');
DROP PROCEDURE rechazar_expansion;
DROP PROCEDURE comprobar_expansion;
SELECT @casos_expansion;
