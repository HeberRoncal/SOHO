import { DatosDireccionPipe } from './datos-direccion.pipe.js';
import { IdDireccionPipe } from './id-direccion.pipe.js';

const datos = {
  etiqueta: ' Casa ',
  destinatario: ' María O’Connor ',
  celular: '987654321',
  distrito: 'la-esperanza',
  direccion: ' Av. Perú 123 ',
};
describe('Validación de los contratos de direcciones', () => {
  const crear = new DatosDireccionPipe();
  const actualizar = new DatosDireccionPipe('actualizar');
  it('normaliza texto y completa únicamente los valores opcionales', () => {
    expect(crear.transform(datos)).toEqual({
      ...datos,
      etiqueta: 'Casa',
      destinatario: 'María O’Connor',
      direccion: 'Av. Perú 123',
      referencia: '',
      predeterminada: false,
    });
    expect(actualizar.transform({ referencia: '' })).toEqual({
      referencia: '',
    });
  });
  it.each([
    null,
    [],
    'texto',
    {},
    { ...datos, usuarioId: 'otra' },
    { ...datos, id: 'inventado' },
    { ...datos, rol: 'ADMIN' },
    { ...datos, etiqueta: 'A' },
    { ...datos, destinatario: 'a'.repeat(141) },
    { ...datos, celular: '887654321' },
    { ...datos, celular: '9abcdefgh' },
    { ...datos, distrito: 'Trujillo' },
    { ...datos, distrito: 'la--esperanza' },
    { ...datos, direccion: '12345' },
    { ...datos, referencia: null },
    { ...datos, predeterminada: 1 },
    { ...datos, destinatario: 'Ana\u200bPérez' },
    { ...datos, distrito: 'trujillo\n' + 'x' },
  ])('rechaza datos inválidos o atributos ajenos: %o', (valor) => {
    expect(() => crear.transform(valor)).toThrow();
  });
  it('admite Unicode hasta el límite y referencias de varias líneas', () => {
    expect(
      crear.transform({
        ...datos,
        destinatario: '😀'.repeat(140),
        referencia: 'Puerta azul\nSegundo piso',
      }),
    ).toMatchObject({
      destinatario: '😀'.repeat(140),
      referencia: 'Puerta azul\nSegundo piso',
    });
  });
  it('rechaza actualizaciones vacías y valores nulos sin convertirlos', () => {
    for (const valor of [{}, { celular: null }, { predeterminada: 'true' }])
      expect(() => actualizar.transform(valor)).toThrow();
  });
  it('la selección de predeterminada no acepta otros atributos', () => {
    const pipe = new DatosDireccionPipe('predeterminar');
    expect(pipe.transform({})).toEqual({});
    expect(() => pipe.transform({ usuarioId: 'otra' })).toThrow();
  });
  it('exige UUID antes de consultar la dirección', async () => {
    const pipe = new IdDireccionPipe();
    await expect(
      pipe.transform('no-es-un-uuid', { type: 'param' }),
    ).rejects.toThrow();
    const id = '12345678-1234-4234-8234-123456789abc';
    await expect(pipe.transform(id, { type: 'param' })).resolves.toBe(id);
  });
});
