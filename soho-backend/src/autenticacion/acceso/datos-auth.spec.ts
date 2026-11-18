import { leerLogin, leerRegistro } from './datos-auth.js';

const registro = {
  nombres: ' Ana ',
  apellidos: ' Pérez ',
  correo: ' ANA@SOHO.TEST ',
  clave: ' contraseña con espacios ',
};
describe('Validación de credenciales', () => {
  it('normaliza datos y conserva la contraseña y los acentos', () => {
    expect(leerRegistro(registro)).toEqual({
      nombres: 'Ana',
      apellidos: 'Pérez',
      correo: 'ana@soho.test',
      clave: registro.clave,
    });
  });
  it.each([{ rol: 'ADMIN' }, { activo: true }, { claveHash: 'hash' }])(
    'rechaza atributos privilegiados: %o',
    (extra) => {
      expect(() => leerRegistro({ ...registro, ...extra })).toThrow();
    },
  );
  it.each([
    null,
    [],
    'texto',
    {},
    { ...registro, nombres: 'A' },
    { ...registro, apellidos: 'x'.repeat(81) },
    { ...registro, correo: 'sin-arroba' },
    { ...registro, nombres: 'Ana\0' },
    { ...registro, clave: 'corta' },
    { ...registro, clave: 'x'.repeat(129) },
  ])('rechaza entradas inválidas: %o', (entrada) => {
    expect(() => leerRegistro(entrada)).toThrow();
  });
  it('admite Unicode y mide caracteres completos', () => {
    expect(
      leerRegistro({ ...registro, clave: '😀'.repeat(128) }).clave,
    ).toHaveLength(256);
  });
  it('el login valida la forma sin imponer retrospectivamente el mínimo de alta', () => {
    expect(leerLogin({ correo: ' ANA@SOHO.TEST ', clave: ' x ' })).toEqual({
      correo: 'ana@soho.test',
      clave: ' x ',
    });
    expect(() => leerLogin({ correo: 'ana@soho.test', clave: '' })).toThrow();
  });
});
