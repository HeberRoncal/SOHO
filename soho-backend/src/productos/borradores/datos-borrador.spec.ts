import { DatosBorrador } from './datos-borrador.js';
const claveSolicitud = '113e4567-e89b-42d3-a456-426614174000';
const minimo = () => ({ claveSolicitud, nombre: 'Zapatilla pendiente' });
describe('Validación de borradores', () => {
  it('admite un borrador sin precio, modelo, color ni tallas', () => {
    expect(DatosBorrador.leer(minimo(), false)).toEqual(minimo());
  });
  it('normaliza códigos, hexadecimal, importes y tallas sin redondeos', () => {
    expect(
      DatosBorrador.leer(
        {
          ...minimo(),
          color: { codigo: 'ng', nombre: ' Negro ', hexadecimal: '#aabbcc' },
          precio: '100.5',
          tallas: ['40.5', '40.0'],
        },
        false,
      ),
    ).toMatchObject({
      color: { codigo: 'NG', nombre: 'Negro', hexadecimal: '#AABBCC' },
      precio: '100.50',
      tallas: ['40', '40.5'],
    });
  });
  it.each([
    'sku',
    'codigoInterno',
    'slug',
    'estado',
    'existencias',
    'cantidadReservada',
    'creadoPorId',
    'imagenes',
    'habilitada',
  ])('rechaza el campo protegido %s', (campo) => {
    expect(() =>
      DatosBorrador.leer({ ...minimo(), [campo]: 'valor' }, false),
    ).toThrow();
  });
  it.each([0, '0', 100, '100.000', '1e2', '-1', '1000000', '00.10'])(
    'rechaza el precio %s',
    (precio) => {
      expect(() =>
        DatosBorrador.leer({ ...minimo(), precio }, false),
      ).toThrow();
    },
  );
  it.each([['34.5'], ['48.5'], ['40.25'], [40], ['40,5'], ['40', '40.0']])(
    'rechaza tallas inválidas o duplicadas %j',
    (...tallas) => {
      expect(() =>
        DatosBorrador.leer({ ...minimo(), tallas }, false),
      ).toThrow();
    },
  );
  it('requiere versión y al menos un cambio para editar', () => {
    expect(() =>
      DatosBorrador.leer({ claveSolicitud, nombre: 'Otro' }, true),
    ).toThrow();
    expect(() =>
      DatosBorrador.leer({ claveSolicitud, version: 1 }, true),
    ).toThrow();
    expect(
      DatosBorrador.leer({ claveSolicitud, version: 1, precio: null }, true),
    ).toEqual({ claveSolicitud, version: 1, precio: null });
  });
  it('rechaza objetos de grupo mezclados y claves ajenas en color', () => {
    expect(() =>
      DatosBorrador.leer(
        {
          ...minimo(),
          grupoModelo: {
            id: claveSolicitud,
            version: 1,
            codigoModelo: 'AF107',
          },
        },
        false,
      ),
    ).toThrow();
    expect(() =>
      DatosBorrador.leer(
        {
          ...minimo(),
          color: {
            codigo: 'BL',
            nombre: 'Blanco',
            hexadecimal: '#FFFFFF',
            sku: 'x',
          },
        },
        false,
      ),
    ).toThrow();
  });
  it('rechaza control, listas, nulos y nombre vacío', () => {
    for (const v of [
      null,
      [],
      { ...minimo(), nombre: '  ' },
      { ...minimo(), nombre: 'mal\u200bicioso' },
    ])
      expect(() => DatosBorrador.leer(v, false)).toThrow();
  });
  it('aplica los límites también después de normalizar Unicode y mayúsculas', () => {
    expect(() =>
      DatosBorrador.leer({ ...minimo(), nombre: '\u0344'.repeat(180) }, false),
    ).toThrow();
    expect(() =>
      DatosBorrador.leer(
        {
          ...minimo(),
          grupoModelo: {
            marcaId: claveSolicitud,
            codigoModelo: 'ß'.repeat(60),
            modelo: 'Modelo',
          },
        },
        false,
      ),
    ).toThrow();
  });
});
