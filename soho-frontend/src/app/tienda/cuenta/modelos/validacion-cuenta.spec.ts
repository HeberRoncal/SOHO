import { claveValida, correoValido, destinoCuenta } from './validacion-cuenta';
describe('Validación de cuenta', () => {
  it('valida correo y los requisitos de la contraseña', () => {
    expect(correoValido('ana@ejemplo.com')).toBe(true);
    expect(correoValido('incorrecto')).toBe(false);
    expect(claveValida('una frase larga y segura')).toBe(true);
    expect(claveValida('😀'.repeat(128))).toBe(true);
    expect(claveValida('x'.repeat(129))).toBe(false);
    for (const clave of ['corta', 'sinnumeros', 'SINMINUSCULAS1', 'SinNumeros'])
      expect(claveValida(clave)).toBe(false);
  });
  it('conserva los destinos de compra y cuenta y rechaza redirecciones externas', () => {
    for (const ruta of [
      '/finalizar-compra',
      '/mi-cuenta/direcciones',
      '/pedido/DEM-00001',
      '/admin/productos/nuevo',
      '/admin/productos?estado=activo',
    ])
      expect(destinoCuenta(ruta)).toBe(ruta);
    for (const ruta of [
      'https://ajeno.example',
      '//ajeno.example',
      'javascript:alert(1)',
      '/mi-cuenta/../../ajeno',
      '/admin/../../ajeno',
      '/admin/%2F%2Fajeno',
      null,
    ])
      expect(destinoCuenta(ruta)).toBe('/mi-cuenta');
  });
});
