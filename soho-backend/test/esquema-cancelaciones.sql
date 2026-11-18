-- SOLO en MySQL temporal con las ocho migraciones. Sin --force.
-- El registro de estructura no ejecuta la cancelacion comercial.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_cancelaciones = 0;
DELIMITER //
CREATE PROCEDURE comprobar_cancelaciones(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF RIGHT(DATABASE(),5) <> '_test' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo base temporal de pruebas'; END IF;
    IF condicion IS NULL OR NOT condicion THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje; END IF;
    SET @casos_cancelaciones = @casos_cancelaciones + 1;
END//
CREATE PROCEDURE rechazar_cancelaciones(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sql_cancelaciones = sentencia;
        PREPARE consulta_cancelaciones FROM @sql_cancelaciones;
        EXECUTE consulta_cancelaciones;
        DEALLOCATE PREPARE consulta_cancelaciones;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_cancelaciones = @casos_cancelaciones + 1;
END//
DELIMITER ;
CALL comprobar_cancelaciones(RIGHT(DATABASE(),5)='_test','Base exclusiva de pruebas');
CALL comprobar_cancelaciones((SELECT COUNT(*)=26 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name NOT IN ('_prisma_migrations','grupos_modelo','archivos_imagen','operaciones_producto','secuencia_codigo_producto','alias_producto','conversion_catalogo')),'Veintiseis tablas previas a productos por color');
CALL comprobar_cancelaciones((SELECT COUNT(*)=3 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='cancelaciones_pedido' AND constraint_type='CHECK' AND enforced='YES'),'Tres CHECK activos');
CALL comprobar_cancelaciones((SELECT COUNT(*)=2 FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name='cancelaciones_pedido' AND delete_rule='RESTRICT' AND update_rule='RESTRICT'),'Dos relaciones restrictivas');
CALL comprobar_cancelaciones((SELECT COUNT(*)=2 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='cancelaciones_pedido' AND non_unique=0),'Identificador y pedido unicos');

START TRANSACTION;
SET @admin_c=UUID(), @cliente_c=UUID(), @pedido_c=UUID(), @pedido_otro_c=UUID(), @cancelacion_c=UUID(), @pago_c=UUID();
SET @fecha_c=TIMESTAMP('2026-11-14 12:00:00.123');
INSERT INTO usuarios(id,nombres,apellidos,correo,clave_hash,rol) VALUES
(@admin_c,'Ana','Cancelaciones','ana@cancelaciones.test',CONCAT('$argon2id$v=19$m=19456,t=2,p=1$',REPEAT('A',22),'$',REPEAT('B',43)),'ADMIN'),
(@cliente_c,'Luis','Compra','luis@cancelaciones.test',CONCAT('$argon2id$v=19$m=19456,t=2,p=1$',REPEAT('C',22),'$',REPEAT('D',43)),'CLIENTE');
INSERT INTO pedidos(id,codigo,usuario_id,clave_creacion,solicitud_hash,nombres,apellidos,correo,destinatario,celular,distrito_codigo,distrito_nombre,direccion,subtotal,costo_envio,total,estado_entrega,version) VALUES
(@pedido_c,'SOHO-CANCELACION01',@cliente_c,UUID(),REPEAT('a',64),'Luis','Compra','luis@cancelaciones.test','Luis Compra','987654321','trujillo','Trujillo','Av. Historica 123',100,7.25,107.25,'CONFIRMADO',2),
(@pedido_otro_c,'SOHO-CANCELACION02',@cliente_c,UUID(),REPEAT('b',64),'Luis','Compra','luis@cancelaciones.test','Luis Compra','987654321','la-esperanza','La Esperanza','Av. Historica 456',100,0,100,'PENDIENTE',1);
INSERT INTO pagos_pedido(id,pedido_id,metodo,estado,version) VALUES (@pago_c,@pedido_c,'YAPE','APROBADO',2);
INSERT INTO cancelaciones_pedido(id,pedido_id,motivo,cancelada_en,registrada_por_id,estado_entrega_anterior,estado_pago_anterior,version_pedido)
VALUES(@cancelacion_c,@pedido_c,'Solicitud de cancelación del cliente.',@fecha_c,@admin_c,'CONFIRMADO','APROBADO',3);
CALL comprobar_cancelaciones((SELECT decision_reservas_consultadas IS NULL FROM cancelaciones_pedido WHERE id=@cancelacion_c),'No inventa una decision consultada');
CALL comprobar_cancelaciones((SELECT cancelada_en=@fecha_c FROM cancelaciones_pedido WHERE id=@cancelacion_c),'Conserva fecha con milisegundos');
CALL comprobar_cancelaciones((SELECT estado_entrega='CONFIRMADO' AND version=2 AND direccion='Av. Historica 123' AND total=107.25 FROM pedidos WHERE id=@pedido_c),'No cambia pedido ni importes automaticamente');
CALL comprobar_cancelaciones((SELECT estado='APROBADO' AND version=2 FROM pagos_pedido WHERE id=@pago_c),'No anula ni reembolsa el pago automaticamente');
CALL comprobar_cancelaciones((SELECT COUNT(*)=0 FROM eventos_pedido WHERE pedido_id=@pedido_c),'No inventa eventos');
CALL rechazar_cancelaciones(CONCAT('INSERT INTO cancelaciones_pedido(id,pedido_id,motivo,registrada_por_id,estado_entrega_anterior,estado_pago_anterior,version_pedido) VALUES(UUID(),',QUOTE(@pedido_c),',''Cancelacion duplicada'',',QUOTE(@admin_c),',''CONFIRMADO'',''APROBADO'',3)'),1062,'Una cancelacion por pedido');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET pedido_id=',QUOTE(UUID()),' WHERE id=',QUOTE(@cancelacion_c)),1452,'Pedido inexistente');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET registrada_por_id=',QUOTE(UUID()),' WHERE id=',QUOTE(@cancelacion_c)),1452,'Responsable inexistente');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET registrada_por_id=NULL WHERE id=',QUOTE(@cancelacion_c)),1048,'Responsable obligatorio');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo=NULL WHERE id=',QUOTE(@cancelacion_c)),1048,'Motivo obligatorio');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET cancelada_en=NULL WHERE id=',QUOTE(@cancelacion_c)),1048,'Fecha obligatoria');
CALL rechazar_cancelaciones(CONCAT('DELETE FROM pedidos WHERE id=',QUOTE(@pedido_c)),1451,'No borra pedido con historial');
CALL rechazar_cancelaciones(CONCAT('DELETE FROM usuarios WHERE id=',QUOTE(@admin_c)),1451,'No borra responsable');
CALL rechazar_cancelaciones(CONCAT('UPDATE usuarios SET id=',QUOTE(UUID()),' WHERE id=',QUOTE(@admin_c)),1451,'No cambia identificador del responsable');
CALL rechazar_cancelaciones(CONCAT('UPDATE pedidos SET id=',QUOTE(UUID()),' WHERE id=',QUOTE(@pedido_c)),1451,'No cambia identificador del pedido');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo='''' WHERE id=',QUOTE(@cancelacion_c)),3819,'Motivo vacio');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo=REPEAT('' '',10) WHERE id=',QUOTE(@cancelacion_c)),3819,'Motivo solo espacios');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo=REPEAT(''a'',9) WHERE id=',QUOTE(@cancelacion_c)),3819,'Motivo menor a diez caracteres');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo=REPEAT(''a'',301) WHERE id=',QUOTE(@cancelacion_c)),1406,'Motivo mayor a trescientos caracteres');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo='' Motivo con espacio inicial'' WHERE id=',QUOTE(@cancelacion_c)),3819,'Motivo sin recortar al inicio');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo=''Motivo con espacio final '' WHERE id=',QUOTE(@cancelacion_c)),3819,'Motivo sin recortar al final');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo=CONCAT(''Motivo con tabulador'',CHAR(9)) WHERE id=',QUOTE(@cancelacion_c)),3819,'Tabulador prohibido');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET motivo=CONCAT(''Motivo con control'',CHAR(0)) WHERE id=',QUOTE(@cancelacion_c)),3819,'Control nulo prohibido');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET estado_entrega_anterior=''ENVIADO'' WHERE id=',QUOTE(@cancelacion_c)),3819,'No parte de un envio realizado');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET estado_entrega_anterior=''ENTREGADO'' WHERE id=',QUOTE(@cancelacion_c)),3819,'No parte de entrega realizada');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET estado_entrega_anterior=''CANCELADO'' WHERE id=',QUOTE(@cancelacion_c)),3819,'No parte de cancelacion anterior');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET version_pedido=0 WHERE id=',QUOTE(@cancelacion_c)),3819,'Version cero');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET version_pedido=1 WHERE id=',QUOTE(@cancelacion_c)),3819,'Cancelacion posterior a creacion');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET version_pedido=-1 WHERE id=',QUOTE(@cancelacion_c)),1264,'Version negativa');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET version_pedido=4294967296 WHERE id=',QUOTE(@cancelacion_c)),1264,'Version mayor a unsigned int');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET decision_reservas_consultadas=''PREGUNTAR'' WHERE id=',QUOTE(@cancelacion_c)),1265,'Politica no es decision');
CALL rechazar_cancelaciones(CONCAT('UPDATE cancelaciones_pedido SET decision_reservas_consultadas=''REEMBOLSAR'' WHERE id=',QUOTE(@cancelacion_c)),1265,'No registra reembolso');

UPDATE cancelaciones_pedido SET motivo=REPEAT('á',10),estado_entrega_anterior='PENDIENTE',estado_pago_anterior='PENDIENTE',version_pedido=2,decision_reservas_consultadas='LIBERAR' WHERE id=@cancelacion_c;
CALL comprobar_cancelaciones((SELECT CHAR_LENGTH(motivo)=10 AND decision_reservas_consultadas='LIBERAR' FROM cancelaciones_pedido WHERE id=@cancelacion_c),'Longitud minima Unicode y decision liberar');
UPDATE cancelaciones_pedido SET motivo=REPEAT('🙂',300),estado_entrega_anterior='EN_PREPARACION',estado_pago_anterior='OBSERVADO',version_pedido=4294967295,decision_reservas_consultadas='CONSERVAR' WHERE id=@cancelacion_c;
CALL comprobar_cancelaciones((SELECT CHAR_LENGTH(motivo)=300 AND version_pedido=4294967295 AND decision_reservas_consultadas='CONSERVAR' FROM cancelaciones_pedido WHERE id=@cancelacion_c),'Longitud maxima Unicode y conservar');
UPDATE cancelaciones_pedido SET motivo=CONCAT('Motivo primera linea',CHAR(13),CHAR(10),'Motivo segunda linea'),estado_entrega_anterior='INCIDENCIA',estado_pago_anterior='RECHAZADO' WHERE id=@cancelacion_c;
CALL comprobar_cancelaciones((SELECT estado_entrega_anterior='INCIDENCIA' AND estado_pago_anterior='RECHAZADO' FROM cancelaciones_pedido WHERE id=@cancelacion_c),'Permite motivo multilinea y conserva estados anteriores');
UPDATE cancelaciones_pedido SET estado_pago_anterior='ANULADO',decision_reservas_consultadas=NULL WHERE id=@cancelacion_c;
CALL comprobar_cancelaciones((SELECT estado_pago_anterior='ANULADO' AND decision_reservas_consultadas IS NULL FROM cancelaciones_pedido WHERE id=@cancelacion_c),'Pago ya anulado y sin pregunta');
INSERT INTO cancelaciones_pedido(id,pedido_id,motivo,registrada_por_id,estado_entrega_anterior,estado_pago_anterior,version_pedido)
VALUES(UUID(),@pedido_otro_c,'Otra cancelación independiente.',@admin_c,'PENDIENTE','PENDIENTE',2);
CALL comprobar_cancelaciones((SELECT COUNT(*)=2 FROM cancelaciones_pedido WHERE registrada_por_id=@admin_c),'Un administrador puede registrar distintos pedidos');
CALL comprobar_cancelaciones((SELECT COUNT(*)=0 FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND event_object_table='cancelaciones_pedido'),'No ejecuta automatismos por trigger');
ROLLBACK;
CALL comprobar_cancelaciones((SELECT COUNT(*)=0 FROM cancelaciones_pedido),'Rollback retira todos los datos sinteticos');
DROP PROCEDURE rechazar_cancelaciones;
DROP PROCEDURE comprobar_cancelaciones;
SELECT @casos_cancelaciones;
