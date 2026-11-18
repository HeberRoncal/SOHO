-- SOLO en una base temporal de pruebas con al menos las seis primeras migraciones.
-- Sin --force. La prueba revierte sus filas; no habilita operaciones comerciales.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET @casos_pedidos = 0;
DELIMITER //
CREATE PROCEDURE comprobar_pedidos(IN condicion BOOLEAN, IN mensaje VARCHAR(128))
BEGIN
    IF DATABASE() NOT LIKE '%\_test' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo se permite una base de pruebas'; END IF;
    IF condicion IS NULL OR NOT condicion THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje; END IF;
    SET @casos_pedidos = @casos_pedidos + 1;
END//
CREATE PROCEDURE rechazar_pedidos(IN sentencia TEXT, IN esperado INT, IN caso VARCHAR(64))
BEGIN
    DECLARE recibido INT DEFAULT 0;
    DECLARE mensaje VARCHAR(128);
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION, SQLWARNING GET DIAGNOSTICS CONDITION 1 recibido = MYSQL_ERRNO;
        SET @sql_pedidos = sentencia;
        PREPARE consulta_pedidos FROM @sql_pedidos;
        EXECUTE consulta_pedidos;
        DEALLOCATE PREPARE consulta_pedidos;
    END;
    IF recibido <> esperado THEN
        SET mensaje = CONCAT(caso, ': esperado ', esperado, ', recibido ', recibido);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = mensaje;
    END IF;
    SET @casos_pedidos = @casos_pedidos + 1;
END//
DELIMITER ;
CALL comprobar_pedidos(TRUE,'Base exclusivamente de pruebas');
START TRANSACTION;
CALL comprobar_pedidos((SELECT COUNT(*) = 24 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name NOT IN ('_prisma_migrations','envios_pedido','cancelaciones_pedido','grupos_modelo','archivos_imagen','operaciones_producto','secuencia_codigo_producto','alias_producto','conversion_catalogo')), 'Quince tablas previas y nueve de pedidos');
CALL comprobar_pedidos((SELECT COUNT(*) = 7 FROM zonas_entrega), 'Conserva los siete distritos');
CALL comprobar_pedidos((SELECT COUNT(*) = 1 FROM configuracion_reserva), 'Una configuracion inicial');
CALL comprobar_pedidos((SELECT modo = 'HASTA_DECISION' AND horas IS NULL AND accion_vencimiento IS NULL AND accion_cancelacion = 'LIBERAR' AND version = 1 AND actualizado_por_id IS NULL FROM configuracion_reserva WHERE id = 1), 'Politica inicial sin duracion inventada');
CALL comprobar_pedidos((SELECT COUNT(*) = 0 FROM pedidos), 'La migracion no crea compras');

SET @usuario_p = UUID(), @admin_p = UUID(), @producto_p = UUID(), @color_p = UUID(), @talla_p = UUID(), @variante_p = UUID();
INSERT INTO usuarios(id,nombres,apellidos,correo,rol) VALUES (@usuario_p,'Ana Maria','De la Cruz','ana@pedidos.test','CLIENTE'),(@admin_p,'Admin','Prueba','admin@pedidos.test','ADMIN');
INSERT INTO productos(id,slug,codigo_interno,nombre,precio) VALUES (@producto_p,'pedidos-prueba','PED-001','Zapatilla de prueba',99.99);
INSERT INTO producto_colores(id,producto_id,codigo,nombre,hexadecimal) VALUES (@color_p,@producto_p,'AZ','Azul','#0000FF');
INSERT INTO tallas(id,valor) VALUES (@talla_p,40.5);
INSERT INTO variantes(id,producto_color_id,talla_id,sku,existencias) VALUES (@variante_p,@color_p,@talla_p,'PED-001-AZ-40P5',5);
SET @pedido_p = UUID(), @invitado_p = UUID(), @clave_p = UUID();
INSERT INTO pedidos(id,codigo,usuario_id,clave_creacion,solicitud_hash,nombres,apellidos,correo,destinatario,celular,distrito_codigo,distrito_nombre,direccion,subtotal,descuento,costo_envio,total)
VALUES (@pedido_p,'SOHO-000001',@usuario_p,@clave_p,REPEAT('a',64),'Ana Maria','De la Cruz','contacto@pedidos.test','Maria del Carmen De la Cruz','987654321','trujillo','Trujillo','Av. Prueba 123',199.98,0.01,7.25,207.22);
INSERT INTO pedidos(id,codigo,clave_creacion,solicitud_hash,acceso_invitado_hash,acceso_invitado_expira_en,nombres,apellidos,correo,destinatario,celular,distrito_codigo,distrito_nombre,direccion,subtotal,costo_envio,total)
VALUES (@invitado_p,'SOHO-000002',UUID(),REPEAT('b',64),REPEAT('c',64),DATE_ADD(NOW(3),INTERVAL 1 DAY),'Invitado','Prueba','invitado@pedidos.test','Invitado Prueba','987654321','la-esperanza','La Esperanza','Calle Prueba 456',99.99,0,99.99);
CALL comprobar_pedidos((SELECT moneda = 'PEN' AND estado_entrega = 'PENDIENTE' AND version = 1 AND provincia = 'Trujillo' AND departamento = 'La Libertad' FROM pedidos WHERE id = @pedido_p), 'Defaults de pedido');
CALL comprobar_pedidos((SELECT usuario_id IS NULL AND acceso_invitado_hash = REPEAT('c',64) FROM pedidos WHERE id = @invitado_p), 'Invitado con hash sin cuenta artificial');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET codigo = ''SOHO-000001'' WHERE id = ',QUOTE(@invitado_p)),1062,'Codigo duplicado');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET clave_creacion = ',QUOTE(@clave_p),' WHERE id = ',QUOTE(@invitado_p)),1062,'Creacion idempotente');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET codigo = ''DEM-00001'' WHERE id = ',QUOTE(@pedido_p)),3819,'Codigo de demostracion');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET codigo = ''soho-000001'' WHERE id = ',QUOTE(@pedido_p)),3819,'Codigo minusculo');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET clave_creacion = ''invalida'' WHERE id = ',QUOTE(@pedido_p)),3819,'Clave de creacion invalida');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET solicitud_hash = REPEAT(''G'',64) WHERE id = ',QUOTE(@pedido_p)),3819,'Hash de solicitud invalido');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET usuario_id = ',QUOTE(UUID()),' WHERE id = ',QUOTE(@pedido_p)),1452,'Usuario inexistente');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET acceso_invitado_hash = NULL WHERE id = ',QUOTE(@invitado_p)),3819,'Invitado sin acceso privado');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET acceso_invitado_expira_en = NULL WHERE id = ',QUOTE(@invitado_p)),3819,'Invitado sin vencimiento');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET acceso_invitado_expira_en = creado_en WHERE id = ',QUOTE(@invitado_p)),3819,'Acceso sin vigencia inicial');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET acceso_invitado_hash = REPEAT(''G'',64) WHERE id = ',QUOTE(@invitado_p)),3819,'Hash de acceso invalido');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET acceso_invitado_hash = REPEAT(''d'',64), acceso_invitado_expira_en = DATE_ADD(NOW(3),INTERVAL 1 DAY) WHERE id = ',QUOTE(@pedido_p)),3819,'Mezcla cuenta con acceso de invitado');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET nombres = '' '' WHERE id = ',QUOTE(@pedido_p)),3819,'Nombre vacio');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET destinatario = ''A'' WHERE id = ',QUOTE(@pedido_p)),3819,'Destinatario demasiado corto');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET celular = ''887654321'' WHERE id = ',QUOTE(@pedido_p)),3819,'Celular no peruano');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET correo = ''invalido'' WHERE id = ',QUOTE(@pedido_p)),3819,'Correo invalido');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET distrito_codigo = ''Trujillo'' WHERE id = ',QUOTE(@pedido_p)),3819,'Codigo de distrito invalido');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET direccion = ''123'' WHERE id = ',QUOTE(@pedido_p)),3819,'Direccion corta');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET plazo_entrega = '''' WHERE id = ',QUOTE(@pedido_p)),3819,'Plazo pendiente como cadena vacia');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET subtotal = 0 WHERE id = ',QUOTE(@pedido_p)),3819,'Subtotal cero');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET descuento = -0.01 WHERE id = ',QUOTE(@pedido_p)),3819,'Descuento negativo');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET descuento = 200 WHERE id = ',QUOTE(@pedido_p)),3819,'Descuento mayor al subtotal');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET costo_envio = -1 WHERE id = ',QUOTE(@pedido_p)),3819,'Envio negativo');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET total = 207.23 WHERE id = ',QUOTE(@pedido_p)),3819,'Total no reconcilia');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET costo_envio = 1,total = 100.99 WHERE id = ',QUOTE(@invitado_p)),3819,'Cobro en La Esperanza');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET cupon_codigo = '' '' WHERE id = ',QUOTE(@pedido_p)),3819,'Cupon vacio');
CALL rechazar_pedidos(CONCAT('UPDATE pedidos SET version = 0 WHERE id = ',QUOTE(@pedido_p)),3819,'Version cero');
UPDATE pedidos SET nombres = REPEAT('A',80) WHERE id = @pedido_p;
CALL comprobar_pedidos((SELECT CHAR_LENGTH(nombres) = 80 FROM pedidos WHERE id = @pedido_p), 'Nombres compatibles con cuenta de hasta 80 caracteres');

SET @articulo_p = UUID(), @articulo_invitado_p = UUID();
INSERT INTO pedido_articulos(id,pedido_id,variante_id,sku,nombre_producto,color,talla,imagen,cantidad,precio_unitario,importe_bruto,descuento,importe_neto)
VALUES (@articulo_p,@pedido_p,@variante_p,'PED-001-AZ-40P5','Zapatilla de prueba','Azul',40.5,'/imagenes/prueba.webp',2,99.99,199.98,0.01,199.97),(@articulo_invitado_p,@invitado_p,@variante_p,'PED-001-AZ-40P5','Zapatilla de prueba','Azul',40.5,'/imagenes/prueba.webp',1,99.99,99.99,0,99.99);
CALL comprobar_pedidos((SELECT COUNT(*) = 2 FROM pedido_articulos WHERE sku = 'PED-001-AZ-40P5'), 'Un SKU puede aparecer en varios pedidos');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET pedido_id = ',QUOTE(@pedido_p),' WHERE id = ',QUOTE(@articulo_invitado_p)),1062,'Variante repetida en mismo pedido');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET cantidad = 0 WHERE id = ',QUOTE(@articulo_p)),3819,'Cantidad cero');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET cantidad = 100000 WHERE id = ',QUOTE(@articulo_p)),3819,'Cantidad fuera del limite');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET precio_unitario = 0 WHERE id = ',QUOTE(@articulo_p)),3819,'Precio cero');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET importe_bruto = 199.99 WHERE id = ',QUOTE(@articulo_p)),3819,'Multiplicacion incorrecta');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET importe_neto = 199.96 WHERE id = ',QUOTE(@articulo_p)),3819,'Neto de articulo incorrecto');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET talla = 40.2 WHERE id = ',QUOTE(@articulo_p)),3819,'Talla fuera de pasos EU');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET sku = '' '' WHERE id = ',QUOTE(@articulo_p)),3819,'SKU vacio');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_articulos SET variante_id = ',QUOTE(UUID()),' WHERE id = ',QUOTE(@articulo_p)),1452,'Variante inexistente');
CALL rechazar_pedidos(CONCAT('DELETE FROM variantes WHERE id = ',QUOTE(@variante_p)),1451,'Proteccion de variante vendida');
INSERT INTO pedido_articulo_unidades(id,pedido_articulo_id,numero,importe_bruto,descuento,importe_neto) VALUES (UUID(),@articulo_p,1,99.99,0.01,99.98),(UUID(),@articulo_p,2,99.99,0,99.99);
CALL comprobar_pedidos((SELECT SUM(importe_neto) = 199.97 AND SUM(descuento) = 0.01 FROM pedido_articulo_unidades WHERE pedido_articulo_id = @articulo_p), 'Reparto exacto de un centimo entre dos pares');
CALL rechazar_pedidos(CONCAT('INSERT INTO pedido_articulo_unidades(id,pedido_articulo_id,numero,importe_bruto,importe_neto) VALUES (UUID(),',QUOTE(@articulo_p),',1,99.99,99.99)'),1062,'Unidad repetida');
CALL rechazar_pedidos('UPDATE pedido_articulo_unidades SET numero = 0',3819,'Numero de unidad cero');
CALL rechazar_pedidos('UPDATE pedido_articulo_unidades SET importe_neto = 100',3819,'Neto de unidad incoherente');
CALL rechazar_pedidos('UPDATE pedido_articulo_unidades SET descuento = -1',3819,'Descuento de unidad negativo');

SET @factura_p = UUID();
INSERT INTO pedido_facturacion(id,pedido_id,tipo,tipo_documento,numero_documento) VALUES (@factura_p,@pedido_p,'BOLETA','DNI','01234567');
CALL comprobar_pedidos((SELECT numero_documento = '01234567' FROM pedido_facturacion WHERE id = @factura_p), 'Documento conserva ceros iniciales');
CALL rechazar_pedidos(CONCAT('INSERT INTO pedido_facturacion(id,pedido_id,tipo,tipo_documento,numero_documento) VALUES (UUID(),',QUOTE(@pedido_p),',''BOLETA'',''DNI'',''12345678'')'),1062,'Facturacion duplicada');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_facturacion SET numero_documento = ''123'' WHERE id = ',QUOTE(@factura_p)),3819,'DNI corto');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_facturacion SET tipo_documento = ''RUC'' WHERE id = ',QUOTE(@factura_p)),3819,'RUC en boleta');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_facturacion SET tipo = ''FACTURA'' WHERE id = ',QUOTE(@factura_p)),3819,'Factura sin datos fiscales');
UPDATE pedido_facturacion SET tipo_documento = 'CE',numero_documento = 'ABC123456' WHERE id = @factura_p;
UPDATE pedido_facturacion SET tipo_documento = 'PAS',numero_documento = 'AB1234' WHERE id = @factura_p;
CALL comprobar_pedidos((SELECT tipo_documento = 'PAS' FROM pedido_facturacion WHERE id = @factura_p), 'Boleta admite CE y pasaporte');
UPDATE pedido_facturacion SET tipo = 'FACTURA',tipo_documento = 'RUC',numero_documento = '20123456789',razon_social = 'Empresa de prueba SAC',domicilio_fiscal = 'Av. Fiscal 123' WHERE id = @factura_p;
CALL comprobar_pedidos((SELECT razon_social = 'Empresa de prueba SAC' FROM pedido_facturacion WHERE id = @factura_p), 'Factura con datos fiscales completos');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_facturacion SET razon_social = NULL WHERE id = ',QUOTE(@factura_p)),3819,'Factura sin razon social');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_facturacion SET domicilio_fiscal = NULL WHERE id = ',QUOTE(@factura_p)),3819,'Factura sin domicilio');
CALL rechazar_pedidos(CONCAT('UPDATE pedido_facturacion SET numero_documento = ''99123456789'' WHERE id = ',QUOTE(@factura_p)),3819,'Formato RUC incoherente');

SET @pago_p = UUID(), @comprobante_p = UUID();
INSERT INTO pagos_pedido(id,pedido_id,metodo) VALUES (@pago_p,@pedido_p,'YAPE');
CALL comprobar_pedidos((SELECT estado = 'PENDIENTE' AND version = 1 FROM pagos_pedido WHERE id = @pago_p), 'Pago inicial pendiente');
CALL rechazar_pedidos(CONCAT('INSERT INTO pagos_pedido(id,pedido_id,metodo) VALUES (UUID(),',QUOTE(@pedido_p),',''PLIN'')'),1062,'Pago duplicado por pedido');
CALL rechazar_pedidos(CONCAT('UPDATE pagos_pedido SET version = 0 WHERE id = ',QUOTE(@pago_p)),3819,'Version de pago cero');
INSERT INTO comprobantes_pago(id,pago_id,version,archivo_clave,archivo_sha256,nombre_archivo,formato,tamano_bytes,numero_operacion) VALUES (@comprobante_p,@pago_p,1,'comprobantes/prueba/v1.png',REPEAT('d',64),'captura.png','image/png',1024,'000123');
CALL comprobar_pedidos((SELECT estado_revision = 'PENDIENTE' AND monto_informado IS NULL AND revisado_por_id IS NULL AND numero_operacion = '000123' FROM comprobantes_pago WHERE id = @comprobante_p), 'Comprobante pendiente sin monto inventado');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET version = 0 WHERE id = ',QUOTE(@comprobante_p)),3819,'Version de comprobante cero');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET archivo_clave = ''https://publico.test/imagen.png'' WHERE id = ',QUOTE(@comprobante_p)),3819,'URL publica en lugar de clave privada');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET archivo_clave = ''comprobantes/../imagen.png'' WHERE id = ',QUOTE(@comprobante_p)),3819,'Ruta de objeto con traversal');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET archivo_sha256 = REPEAT(''Z'',64) WHERE id = ',QUOTE(@comprobante_p)),3819,'Hash de archivo invalido');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET formato = ''image/svg+xml'' WHERE id = ',QUOTE(@comprobante_p)),3819,'Formato no admitido');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET formato = ''IMAGE/PNG'' WHERE id = ',QUOTE(@comprobante_p)),3819,'MIME no canonico');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET tamano_bytes = 0 WHERE id = ',QUOTE(@comprobante_p)),3819,'Archivo vacio');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET tamano_bytes = 5242881 WHERE id = ',QUOTE(@comprobante_p)),3819,'Archivo mayor a cinco MB');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET numero_operacion = ''ABC'' WHERE id = ',QUOTE(@comprobante_p)),3819,'Operacion invalida');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET monto_informado = -0.01 WHERE id = ',QUOTE(@comprobante_p)),3819,'Monto informado negativo');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET estado_revision = ''APROBADO'' WHERE id = ',QUOTE(@comprobante_p)),3819,'Aprobacion sin revisor ni fecha');
UPDATE comprobantes_pago SET estado_revision = 'OBSERVADO',motivo = 'ILEGIBLE',mensaje = 'Adjunta una imagen legible completa.',solicitud_correccion = 'LEGIBLE',revisado_por_id = @admin_p,revisado_en = NOW(3) WHERE id = @comprobante_p;
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET solicitud_correccion = NULL WHERE id = ',QUOTE(@comprobante_p)),3819,'Observacion sin solicitud de correccion');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET mensaje = ''corto'' WHERE id = ',QUOTE(@comprobante_p)),3819,'Mensaje de revision insuficiente');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET revisado_en = DATE_SUB(creado_en,INTERVAL 1 SECOND) WHERE id = ',QUOTE(@comprobante_p)),3819,'Revision anterior a carga');
INSERT INTO comprobantes_pago(id,pago_id,version,archivo_clave,archivo_sha256,nombre_archivo,formato,tamano_bytes) VALUES (UUID(),@pago_p,2,'comprobantes/prueba/v2.png',REPEAT('e',64),'correccion.png','image/png',1024);
CALL comprobar_pedidos((SELECT COUNT(*) = 2 AND SUM(estado_revision = 'OBSERVADO') = 1 AND SUM(estado_revision = 'PENDIENTE') = 1 FROM comprobantes_pago WHERE pago_id = @pago_p), 'Correccion conserva primera revision');
CALL rechazar_pedidos(CONCAT('UPDATE comprobantes_pago SET version = 1 WHERE pago_id = ',QUOTE(@pago_p),' AND version = 2'),1062,'Version duplicada en pago');
UPDATE comprobantes_pago SET estado_revision = 'RECHAZADO',solicitud_correccion = NULL WHERE id = @comprobante_p;
CALL comprobar_pedidos((SELECT estado_revision = 'RECHAZADO' FROM comprobantes_pago WHERE id = @comprobante_p), 'Rechazo conserva motivo y revisor');
UPDATE comprobantes_pago SET estado_revision = 'APROBADO',motivo = NULL,mensaje = NULL,solicitud_correccion = NULL,revisado_por_id = @admin_p,revisado_en = NOW(3) WHERE pago_id = @pago_p AND version = 2;
UPDATE pagos_pedido SET estado = 'APROBADO' WHERE id = @pago_p;
UPDATE pedidos SET estado_entrega = 'CANCELADO' WHERE id = @pedido_p;
CALL comprobar_pedidos((SELECT estado = 'APROBADO' FROM pagos_pedido WHERE id = @pago_p), 'Cancelar no reescribe pago aprobado');
CALL comprobar_pedidos((SELECT COUNT(*) = 2 FROM comprobantes_pago WHERE pago_id = @pago_p), 'Cancelar conserva comprobantes');
CALL rechazar_pedidos(CONCAT('DELETE FROM usuarios WHERE id = ',QUOTE(@admin_p)),1451,'Conserva responsable de revision');

CALL rechazar_pedidos('INSERT INTO configuracion_reserva(id) VALUES (2)',3819,'Configuracion unica');
CALL rechazar_pedidos('UPDATE configuracion_reserva SET version = 0 WHERE id = 1',3819,'Version de politica cero');
CALL rechazar_pedidos('UPDATE configuracion_reserva SET modo = ''TIEMPO'' WHERE id = 1',3819,'Politica temporal incompleta');
UPDATE configuracion_reserva SET modo = 'TIEMPO',horas = 24,accion_vencimiento = 'SOLO_ALERTAR',accion_cancelacion = 'PREGUNTAR',version = 2 WHERE id = 1;
CALL rechazar_pedidos('UPDATE configuracion_reserva SET horas = 0 WHERE id = 1',3819,'Duracion cero');
CALL rechazar_pedidos('UPDATE configuracion_reserva SET horas = 1000000 WHERE id = 1',3819,'Duracion fuera de limite');
SET @reserva_p = UUID();
INSERT INTO reservas_inventario(id,pedido_articulo_id,cantidad,configuracion_version,modo,accion_cancelacion) VALUES (@reserva_p,@articulo_p,2,1,'HASTA_DECISION','LIBERAR');
CALL comprobar_pedidos((SELECT estado = 'ACTIVA' AND vence_en IS NULL AND modo = 'HASTA_DECISION' AND configuracion_version = 1 FROM reservas_inventario WHERE id = @reserva_p), 'Reserva conserva politica anterior');
CALL rechazar_pedidos(CONCAT('INSERT INTO reservas_inventario(id,pedido_articulo_id,cantidad,configuracion_version,modo,accion_cancelacion) VALUES (UUID(),',QUOTE(@articulo_p),',2,1,''HASTA_DECISION'',''LIBERAR'')'),1062,'Dos reservas activas en articulo');
CALL rechazar_pedidos(CONCAT('UPDATE reservas_inventario SET cantidad = 0 WHERE id = ',QUOTE(@reserva_p)),3819,'Reserva de cero unidades');
CALL rechazar_pedidos(CONCAT('UPDATE reservas_inventario SET configuracion_version = 0 WHERE id = ',QUOTE(@reserva_p)),3819,'Reserva sin version de politica');
CALL rechazar_pedidos(CONCAT('UPDATE reservas_inventario SET modo = ''TIEMPO'' WHERE id = ',QUOTE(@reserva_p)),3819,'Reserva temporal incompleta');
CALL rechazar_pedidos(CONCAT('UPDATE reservas_inventario SET estado = ''LIBERADA'' WHERE id = ',QUOTE(@reserva_p)),3819,'Reserva cerrada sin motivo ni fecha');
CALL rechazar_pedidos(CONCAT('UPDATE reservas_inventario SET cerrada_en = NOW(3),motivo_cierre = ''Cancelacion'' WHERE id = ',QUOTE(@reserva_p)),3819,'Reserva activa con datos de cierre');
UPDATE reservas_inventario SET estado = 'LIBERADA',cerrada_en = NOW(3),motivo_cierre = 'Cancelacion' WHERE id = @reserva_p;
SET @reserva_nueva_p = UUID(), @fecha_reserva_p = DATE_SUB(NOW(3),INTERVAL 25 HOUR);
INSERT INTO reservas_inventario(id,pedido_articulo_id,cantidad,configuracion_version,modo,horas,accion_vencimiento,accion_cancelacion,creado_en,vence_en,vencimiento_atendido_en)
VALUES (@reserva_nueva_p,@articulo_p,2,2,'TIEMPO',24,'SOLO_ALERTAR','PREGUNTAR',@fecha_reserva_p,DATE_ADD(@fecha_reserva_p,INTERVAL 24 HOUR),NOW(3));
CALL comprobar_pedidos((SELECT estado = 'ACTIVA' AND vence_en < NOW(3) AND vencimiento_atendido_en IS NOT NULL FROM reservas_inventario WHERE id = @reserva_nueva_p), 'Vencer y alertar no libera implicitamente');
CALL rechazar_pedidos(CONCAT('UPDATE reservas_inventario SET vence_en = creado_en WHERE id = ',QUOTE(@reserva_nueva_p)),3819,'Vencimiento no concuerda con duracion');
CALL rechazar_pedidos(CONCAT('UPDATE reservas_inventario SET vencimiento_atendido_en = creado_en WHERE id = ',QUOTE(@reserva_nueva_p)),3819,'Atencion anterior a vencimiento');
UPDATE reservas_inventario SET estado = 'CONSUMIDA',cerrada_en = NOW(3),motivo_cierre = 'Envio' WHERE id = @reserva_nueva_p;
CALL comprobar_pedidos((SELECT COUNT(*) = 2 AND SUM(estado = 'LIBERADA') = 1 AND SUM(estado = 'CONSUMIDA') = 1 FROM reservas_inventario WHERE pedido_articulo_id = @articulo_p), 'Historial de reservas cerradas sin colisiones');

INSERT INTO eventos_pedido(id,pedido_id,secuencia,version_pedido,tipo,actor,titulo,descripcion) VALUES (UUID(),@pedido_p,1,1,'CREADO','SISTEMA','Pedido registrado','Registro de la compra de prueba.');
CALL comprobar_pedidos((SELECT visibilidad = 'INTERNA' FROM eventos_pedido WHERE pedido_id = @pedido_p), 'Historial privado por defecto');
CALL rechazar_pedidos(CONCAT('INSERT INTO eventos_pedido(id,pedido_id,secuencia,version_pedido,tipo,actor,titulo,descripcion) VALUES (UUID(),',QUOTE(@pedido_p),',1,1,''CREADO'',''SISTEMA'',''Duplicado'',''Evento duplicado'')'),1062,'Secuencia duplicada');
CALL rechazar_pedidos('UPDATE eventos_pedido SET secuencia = 0',3819,'Secuencia de evento cero');
CALL rechazar_pedidos('UPDATE eventos_pedido SET actor = ''ADMIN''',3819,'Actor sin responsable');
CALL rechazar_pedidos('UPDATE eventos_pedido SET titulo = '' ''',3819,'Titulo de evento vacio');
INSERT INTO eventos_pedido(id,pedido_id,secuencia,version_pedido,tipo,actor,responsable_id,titulo,descripcion) VALUES (UUID(),@pedido_p,2,2,'NOTA_INTERNA','ADMIN',@admin_p,'Nota interna','Coordinar el pedido de prueba.');
CALL rechazar_pedidos('UPDATE eventos_pedido SET visibilidad = ''CLIENTE'' WHERE tipo = ''NOTA_INTERNA''',3819,'Exposicion de nota interna');
CALL rechazar_pedidos(CONCAT('DELETE FROM pedidos WHERE id = ',QUOTE(@pedido_p)),1451,'Borrado de pedido con historial');
CALL rechazar_pedidos(CONCAT('DELETE FROM pedido_articulos WHERE id = ',QUOTE(@articulo_p)),1451,'Borrado de linea con unidades y reservas');
CALL rechazar_pedidos(CONCAT('DELETE FROM pagos_pedido WHERE id = ',QUOTE(@pago_p)),1451,'Borrado de pago con comprobantes');
CALL rechazar_pedidos('DELETE FROM configuracion_reserva WHERE id = 1',1451,'Borrado de politica referenciada');
CALL comprobar_pedidos((SELECT existencias = 5 AND cantidad_reservada = 0 FROM variantes WHERE id = @variante_p), 'El esquema no altera stock mediante automatismos');

ROLLBACK;
DROP PROCEDURE rechazar_pedidos;
DROP PROCEDURE comprobar_pedidos;
SELECT @casos_pedidos;
