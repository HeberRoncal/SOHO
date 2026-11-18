import { PRODUCTOS_ADMIN_PRUEBA } from '../pruebas/productos.fixtures';
import {
  EDICION_PRODUCTO_VACIA,
  editarDatosProducto,
  importeProducto,
  validarEdicionProducto,
} from './edicion-producto';

describe('Edición de producto administrativo', () => {
  const producto = PRODUCTOS_ADMIN_PRUEBA[0];
  it('admite un borrador con nombre, exige datos y variantes para publicar y detecta duplicados', () => {
    const datos = { ...EDICION_PRODUCTO_VACIA, nombre: 'Modelo de prueba' };
    expect(validarEdicionProducto(datos, 'borrador', PRODUCTOS_ADMIN_PRUEBA)).toEqual({});
    const errores = validarEdicionProducto(datos, 'publicado', PRODUCTOS_ADMIN_PRUEBA);
    expect(errores).toMatchObject({
      marca: expect.any(String),
      imagenes: expect.any(String),
      variantes: expect.any(String),
      precio: expect.any(String),
    });
    expect(
      validarEdicionProducto(
        { ...datos, nombre: '  NÍKE DUNK LOW RETRO  ' },
        'borrador',
        PRODUCTOS_ADMIN_PRUEBA,
      ).nombre,
    ).toBeTruthy();
    expect(
      validarEdicionProducto(
        editarDatosProducto(producto),
        'publicado',
        PRODUCTOS_ADMIN_PRUEBA,
        producto,
      ),
    ).toEqual({});
    expect(
      validarEdicionProducto(
        { ...datos, codigoModelo: producto.codigoModelo.toLowerCase() },
        'borrador',
        PRODUCTOS_ADMIN_PRUEBA,
      ).codigoModelo,
    ).toBeTruthy();
  });
  it('conserva centavos y rechaza signos, decimales de más, importes no finitos y descuentos inconsistentes', () => {
    expect(importeProducto(' 499,90 ')).toBe(499.9);
    for (const precio of ['-1', '0', '1.234', '1.2.3', 'Infinity', 'NaN', '1e3', '1000000'])
      expect(importeProducto(precio)).toBeNull();
    const datos = { ...editarDatosProducto(producto), precio: '499.90', precioAnterior: '499,90' };
    expect(
      validarEdicionProducto(datos, 'borrador', PRODUCTOS_ADMIN_PRUEBA, producto).precioAnterior,
    ).toBeTruthy();
    datos.precioAnterior = '599.90';
    expect(validarEdicionProducto(datos, 'publicado', PRODUCTOS_ADMIN_PRUEBA, producto)).toEqual(
      {},
    );
  });
});
