-- SOLO en MySQL temporal con las siete migraciones. Sin --force.
-- Las filas se revierten; no habilita operaciones de despacho.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_envios = 0;
DELIMITER //
CREATE PROCEDURE comprobar_envios(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF RIGHT(DATABASE(),5) <> '_test' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo base temporal de pruebas'; END IF;
    IF condicion IS NULL OR NOT condicion THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje; END IF;
    SET @casos_envios = @casos_envios + 1;
END//
CREATE PROCEDURE rechazar_envios(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sql_envios = sentencia;
        PREPARE consulta_envios FROM @sql_envios;
        EXECUTE consulta_envios;
        DEALLOCATE PREPARE consulta_envios;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_envios = @casos_envios + 1;
END//
DELIMITER ;

CALL comprobar_envios(RIGHT(DATABASE(),5) = '_test','Base de pruebas');
CALL comprobar_envios((SELECT COUNT(*)=25 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name NOT IN ('_prisma_migrations','cancelaciones_pedido','grupos_modelo','archivos_imagen','operaciones_producto','secuencia_codigo_producto','alias_producto','conversion_catalogo')),'Veinticinco tablas previas a cancelaciones');
CALL comprobar_envios((SELECT COUNT(*)=3 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_type='CHECK' AND enforced='YES' AND constraint_name IN ('envios_despacho_coherente','envios_entrega_coherente','movimientos_envio_coherente')),'Restricciones nuevas activas');
START TRANSACTION;
SET @admin_e=UUID(), @cliente_e=UUID(), @marca_e=UUID(), @categoria_e=UUID(), @producto_e=UUID(), @color_e=UUID(), @talla_e=UUID(), @variante_e=UUID();
SET @pedido_e=UUID(), @pedido_otro_e=UUID(), @envio_e=UUID(), @envio_otro_e=UUID();
SET @inicio_e=TIMESTAMP('2026-11-14 09:00:00.000'), @despacho_e=TIMESTAMP('2026-11-14 10:00:00.000'), @entrega_e=TIMESTAMP('2026-11-14 11:00:00.000');
INSERT INTO usuarios(id,nombres,apellidos,correo,clave_hash,rol) VALUES
(@admin_e,'Ana','Envios','ana@envios.test',CONCAT('$argon2id$v=19$m=19456,t=2,p=1$',REPEAT('A',22),'$',REPEAT('B',43)),'ADMIN'),
(@cliente_e,'Luis','Compra','luis@envios.test',CONCAT('$argon2id$v=19$m=19456,t=2,p=1$',REPEAT('C',22),'$',REPEAT('D',43)),'CLIENTE');
INSERT INTO marcas(id,codigo,nombre,slug) VALUES (@marca_e,'ENV','Marca envios','marca-envios');
INSERT INTO categorias(id,nombre,slug) VALUES (@categoria_e,'Categoria envios','categoria-envios');
INSERT INTO productos(id,slug,codigo_interno,nombre,modelo,precio,marca_id,categoria_id) VALUES (@producto_e,'producto-envios','ENV-001','Producto envios','Modelo envios',50,@marca_e,@categoria_e);
INSERT INTO producto_colores(id,producto_id,codigo,nombre,hexadecimal) VALUES (@color_e,@producto_e,'BL','Blanco','#FFFFFF');
INSERT INTO tallas(id,valor) VALUES (@talla_e,40.5);
INSERT INTO variantes(id,producto_color_id,talla_id,sku,existencias) VALUES (@variante_e,@color_e,@talla_e,'ENV-001-BL-40P5',10);
INSERT INTO pedidos(id,codigo,usuario_id,clave_creacion,solicitud_hash,nombres,apellidos,correo,destinatario,celular,distrito_codigo,distrito_nombre,direccion,subtotal,costo_envio,total) VALUES
(@pedido_e,'SOHO-ENVIOS0001',@cliente_e,UUID(),REPEAT('a',64),'Luis','Compra','luis@envios.test','Luis Compra','987654321','la-esperanza','La Esperanza','Av. Envios 123',100,0,100),
(@pedido_otro_e,'SOHO-ENVIOS0002',@cliente_e,UUID(),REPEAT('b',64),'Luis','Compra','luis@envios.test','Luis Compra','987654321','trujillo','Trujillo','Av. Envios 456',100,7.25,107.25);
INSERT INTO envios_pedido(id,pedido_id,preparacion_iniciada_por_id,preparacion_iniciada_en) VALUES (@envio_e,@pedido_e,@admin_e,@inicio_e);
CALL comprobar_envios((SELECT transportista IS NULL AND referencia_seguimiento IS NULL AND despachado_en IS NULL AND despachado_por_id IS NULL AND entregado_en IS NULL AND entrega_registrada_por_id IS NULL FROM envios_pedido WHERE id=@envio_e),'Preparacion sin despacho inventado');
CALL comprobar_envios((SELECT estado_entrega='PENDIENTE' AND version=1 FROM pedidos WHERE id=@pedido_e),'El esquema no cambia estados automaticamente');
CALL rechazar_envios(CONCAT('INSERT INTO envios_pedido(id,pedido_id,preparacion_iniciada_por_id) VALUES (UUID(),',QUOTE(@pedido_e),',',QUOTE(@admin_e),')'),1062,'Segundo envio para el mismo pedido');
CALL rechazar_envios(CONCAT('INSERT INTO envios_pedido(id,pedido_id,preparacion_iniciada_por_id) VALUES (UUID(),',QUOTE(UUID()),',',QUOTE(@admin_e),')'),1452,'Pedido inexistente');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET preparacion_iniciada_por_id=',QUOTE(UUID()),' WHERE id=',QUOTE(@envio_e)),1452,'Preparador inexistente');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET preparacion_iniciada_por_id=NULL WHERE id=',QUOTE(@envio_e)),1048,'Preparador nulo');
CALL rechazar_envios(CONCAT('DELETE FROM pedidos WHERE id=',QUOTE(@pedido_e)),1451,'Borrar pedido con envio');
CALL rechazar_envios(CONCAT('DELETE FROM usuarios WHERE id=',QUOTE(@admin_e)),1451,'Borrar responsable de preparacion');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista=''Reparto local'' WHERE id=',QUOTE(@envio_e)),3819,'Transportista sin despacho');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento=''LOCAL-001'' WHERE id=',QUOTE(@envio_e)),3819,'Seguimiento sin despacho');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET despachado_por_id=',QUOTE(@admin_e),' WHERE id=',QUOTE(@envio_e)),3819,'Responsable sin fecha de despacho');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET despachado_en=',QUOTE(@despacho_e),' WHERE id=',QUOTE(@envio_e)),3819,'Fecha de despacho sin datos');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET entregado_en=',QUOTE(@entrega_e),', entrega_registrada_por_id=',QUOTE(@admin_e),' WHERE id=',QUOTE(@envio_e)),3819,'Entrega sin despacho');

UPDATE envios_pedido SET transportista='Reparto local',referencia_seguimiento='LOCAL-001',despachado_en=@despacho_e,despachado_por_id=@admin_e WHERE id=@envio_e;
CALL comprobar_envios((SELECT transportista='Reparto local' AND referencia_seguimiento='LOCAL-001' AND despachado_en=@despacho_e FROM envios_pedido WHERE id=@envio_e),'Despacho local valido');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista=NULL WHERE id=',QUOTE(@envio_e)),3819,'Despacho sin transportista');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento=NULL WHERE id=',QUOTE(@envio_e)),3819,'Despacho sin referencia');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET despachado_por_id=NULL WHERE id=',QUOTE(@envio_e)),3819,'Despacho sin responsable');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET despachado_en=NULL WHERE id=',QUOTE(@envio_e)),3819,'Datos de despacho sin fecha');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista='''' WHERE id=',QUOTE(@envio_e)),3819,'Transportista vacio');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista=''A'' WHERE id=',QUOTE(@envio_e)),3819,'Transportista corto');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista=REPEAT(''A'',81) WHERE id=',QUOTE(@envio_e)),1406,'Transportista largo');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista='' Reparto'' WHERE id=',QUOTE(@envio_e)),3819,'Transportista espacio inicial');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista=''Reparto '' WHERE id=',QUOTE(@envio_e)),3819,'Transportista espacio final');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET transportista=CONCAT(''Reparto'',CHAR(9),''local'') WHERE id=',QUOTE(@envio_e)),3819,'Transportista con control');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento='''' WHERE id=',QUOTE(@envio_e)),3819,'Referencia vacia');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento=''AB'' WHERE id=',QUOTE(@envio_e)),3819,'Referencia corta');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento=REPEAT(''A'',81) WHERE id=',QUOTE(@envio_e)),1406,'Referencia larga');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento='' REF'' WHERE id=',QUOTE(@envio_e)),3819,'Referencia espacio inicial');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento=''REF '' WHERE id=',QUOTE(@envio_e)),3819,'Referencia espacio final');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET referencia_seguimiento=CONCAT(''REF'',CHAR(10),''001'') WHERE id=',QUOTE(@envio_e)),3819,'Referencia con control');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET despachado_por_id=',QUOTE(UUID()),' WHERE id=',QUOTE(@envio_e)),1452,'Despachador inexistente');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET despachado_en=DATE_SUB(preparacion_iniciada_en,INTERVAL 1000 MICROSECOND) WHERE id=',QUOTE(@envio_e)),3819,'Despacho anterior a preparacion');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET entregado_en=',QUOTE(@entrega_e),' WHERE id=',QUOTE(@envio_e)),3819,'Entrega sin responsable');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET entrega_registrada_por_id=',QUOTE(@admin_e),' WHERE id=',QUOTE(@envio_e)),3819,'Responsable sin fecha de entrega');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET entregado_en=DATE_SUB(despachado_en,INTERVAL 1000 MICROSECOND),entrega_registrada_por_id=',QUOTE(@admin_e),' WHERE id=',QUOTE(@envio_e)),3819,'Entrega anterior al despacho');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET entregado_en=',QUOTE(@entrega_e),',entrega_registrada_por_id=',QUOTE(UUID()),' WHERE id=',QUOTE(@envio_e)),1452,'Registrador de entrega inexistente');
UPDATE envios_pedido SET entregado_en=@entrega_e,entrega_registrada_por_id=@admin_e WHERE id=@envio_e;
CALL comprobar_envios((SELECT preparacion_iniciada_en<=despachado_en AND despachado_en<=entregado_en FROM envios_pedido WHERE id=@envio_e),'Orden temporal valido');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET entregado_en=NULL WHERE id=',QUOTE(@envio_e)),3819,'Entrega con fecha retirada');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET entrega_registrada_por_id=NULL WHERE id=',QUOTE(@envio_e)),3819,'Entrega con responsable retirado');
CALL rechazar_envios(CONCAT('UPDATE envios_pedido SET preparacion_iniciada_en=DATE_ADD(despachado_en,INTERVAL 1 HOUR) WHERE id=',QUOTE(@envio_e)),3819,'Preparacion posterior a despacho');
UPDATE envios_pedido SET entregado_en=despachado_en WHERE id=@envio_e;
CALL comprobar_envios((SELECT entregado_en=despachado_en FROM envios_pedido WHERE id=@envio_e),'Igualdad de tiempos permitida');
INSERT INTO envios_pedido(id,pedido_id,preparacion_iniciada_por_id,preparacion_iniciada_en,transportista,referencia_seguimiento,despachado_en,despachado_por_id)
VALUES (@envio_otro_e,@pedido_otro_e,@admin_e,@inicio_e,REPEAT('T',80),REPEAT('0',80),@inicio_e,@admin_e);
CALL comprobar_envios((SELECT CHAR_LENGTH(transportista)=80 AND CHAR_LENGTH(referencia_seguimiento)=80 FROM envios_pedido WHERE id=@envio_otro_e),'Limites y ceros del seguimiento');

SET @movimiento_e=UUID();
INSERT INTO movimientos_inventario(id,variante_id,usuario_responsable_id,envio_pedido_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,referencia,origen)
VALUES (@movimiento_e,@variante_e,@admin_e,@envio_e,'SALIDA',-2,10,8,0,TRUE,'Despacho de pedido','SOHO-ENVIOS0001','ENVIO_PEDIDO');
CALL comprobar_envios((SELECT origen='ENVIO_PEDIDO' AND envio_pedido_id=@envio_e AND cantidad=-2 FROM movimientos_inventario WHERE id=@movimiento_e),'Salida vinculada al envio');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET envio_pedido_id=NULL WHERE id=',QUOTE(@movimiento_e)),3819,'Salida de pedido sin envio');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET usuario_responsable_id=NULL WHERE id=',QUOTE(@movimiento_e)),3819,'Salida de pedido sin responsable');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET tipo=''ENTRADA'',cantidad=2,saldo_posterior=12 WHERE id=',QUOTE(@movimiento_e)),3819,'Envio con entrada');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET tipo=''AJUSTE'' WHERE id=',QUOTE(@movimiento_e)),3819,'Envio con ajuste');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET origen=''MANUAL'' WHERE id=',QUOTE(@movimiento_e)),3819,'Manual con envio');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET origen=''STOCK_INICIAL'',tipo=''ENTRADA'',cantidad=2,saldo_anterior=0,saldo_posterior=2 WHERE id=',QUOTE(@movimiento_e)),3819,'Stock inicial con envio');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET envio_pedido_id=',QUOTE(UUID()),' WHERE id=',QUOTE(@movimiento_e)),1452,'Envio inexistente en movimiento');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET cantidad=2,saldo_posterior=12 WHERE id=',QUOTE(@movimiento_e)),3819,'Salida positiva');
CALL rechazar_envios(CONCAT('UPDATE movimientos_inventario SET saldo_posterior=9 WHERE id=',QUOTE(@movimiento_e)),3819,'Salida con saldo incoherente');
CALL rechazar_envios(CONCAT('INSERT INTO movimientos_inventario(id,variante_id,usuario_responsable_id,envio_pedido_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen) VALUES (UUID(),',QUOTE(@variante_e),',',QUOTE(@admin_e),',',QUOTE(@envio_e),',''SALIDA'',-2,10,8,0,TRUE,''Duplicado'',''ENVIO_PEDIDO'')'),1062,'Segunda salida del mismo SKU y envio');
INSERT INTO movimientos_inventario(id,variante_id,usuario_responsable_id,envio_pedido_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen)
VALUES (UUID(),@variante_e,@admin_e,@envio_otro_e,'SALIDA',-1,8,7,0,FALSE,'Otro pedido','ENVIO_PEDIDO');
CALL comprobar_envios((SELECT COUNT(*)=2 FROM movimientos_inventario WHERE variante_id=@variante_e AND origen='ENVIO_PEDIDO'),'Mismo SKU en pedidos diferentes');
INSERT INTO movimientos_inventario(id,variante_id,tipo,cantidad,saldo_anterior,saldo_posterior,cantidad_reservada,variante_habilitada,motivo,origen) VALUES
(UUID(),@variante_e,'ENTRADA',1,8,9,0,TRUE,'Entrada manual conservada','MANUAL'),
(UUID(),@variante_e,'SALIDA',-1,9,8,0,TRUE,'Salida manual conservada','MANUAL'),
(UUID(),@variante_e,'ENTRADA',10,0,10,0,TRUE,'Stock inicial conservado','STOCK_INICIAL');
CALL comprobar_envios((SELECT COUNT(*)=3 FROM movimientos_inventario WHERE variante_id=@variante_e AND envio_pedido_id IS NULL),'Multiples movimientos sin envio');
CALL comprobar_envios((SELECT COUNT(*)=3 FROM movimientos_inventario WHERE variante_id=@variante_e AND usuario_responsable_id IS NULL),'Responsables nulos anteriores permitidos');
CALL rechazar_envios(CONCAT('DELETE FROM envios_pedido WHERE id=',QUOTE(@envio_e)),1451,'Borrar envio con movimientos');
CALL comprobar_envios((SELECT existencias=10 AND cantidad_reservada=0 FROM variantes WHERE id=@variante_e),'No hay automatismos de inventario');
CALL comprobar_envios((SELECT COUNT(*)=2 FROM envios_pedido WHERE pedido_id IN (@pedido_e,@pedido_otro_e)),'Un envio por pedido');

ROLLBACK;
DROP PROCEDURE rechazar_envios;
DROP PROCEDURE comprobar_envios;
SELECT @casos_envios;
