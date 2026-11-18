import { ValidacionEntrega } from './validacion-entrega';
import { DatosEntrega } from './datos-entrega';

describe('ValidacionEntrega', () => {
  const datos: DatosEntrega = {
    nombres: ' Ana ',
    apellidos: ' Pérez ',
    correo: ' ana@ejemplo.com ',
    celular: '987654321',
    distrito: 'la-esperanza',
    direccion: ' Calle Los Pinos 123 ',
    referencia: '',
  };
  it('debe normalizar datos válidos sin alterar el original', () => {
    expect(ValidacionEntrega.errores(datos)).toEqual({});
    expect(ValidacionEntrega.normalizar(datos).nombres).toBe('Ana');
    expect(datos.nombres).toBe(' Ana ');
  });
  it('debe rechazar espacios, correos inválidos, teléfonos incompletos y direcciones vacías', () => {
    const errores = ValidacionEntrega.errores({
      ...datos,
      nombres: '   ',
      correo: 'incorrecto',
      celular: '123',
      direccion: ' ',
      distrito: '',
    });
    expect(Object.keys(errores)).toEqual(
      expect.arrayContaining(['nombres', 'correo', 'celular', 'direccion', 'distrito']),
    );
  });
  it('debe limitar la longitud de las referencias', () => {
    expect(
      ValidacionEntrega.errores({ ...datos, referencia: 'x'.repeat(201) }).referencia,
    ).toBeTruthy();
  });
});
