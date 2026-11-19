-- Amplía la galería a posiciones 0..9 sin modificar fotografías existentes.
ALTER TABLE `imagenes_producto`
    DROP CHECK `imagenes_producto_maximo_ocho`,
    ADD CONSTRAINT `imagenes_producto_maximo_diez` CHECK (`orden` <= 9);
