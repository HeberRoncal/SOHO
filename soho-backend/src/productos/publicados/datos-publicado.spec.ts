import { DatosPublicado } from './datos-publicado.js';

describe('DatosPublicado', () => {
  const clave = '113e4567-e89b-42d3-a456-426614174000';
  const base = { claveSolicitud: clave, version: 1 };
  it('comparte normalización de textos, UUID e importes', () => {
    expect(
      DatosPublicado.leer({
        ...base,
        claveSolicitud: clave.toUpperCase(),
        nombre: ' Nombre ',
        descripcion: 'Detalle',
        precio: '10.5',
        precioAnterior: null,
        esNovedad: false,
        esDestacado: false,
        ordenColor: 0,
      }),
    ).toEqual({
      ...base,
      nombre: 'Nombre',
      descripcion: 'Detalle',
      precio: '10.50',
      precioAnterior: null,
      esNovedad: false,
        esDestacado: false,
      ordenColor: 0,
    });
  });
  it.each([
    null,
    [],
    {},
    base,
    { ...base, version: 4294967295, nombre: 'a' },
    { ...base, nombre: '' },
    { ...base, nombre: 'a'.repeat(181) },
    { ...base, descripcion: 'a'.repeat(601) },
    { ...base, nombre: 'x\u200b' },
    { ...base, precio: 10 },
    { ...base, precio: '0.00' },
    { ...base, precio: '1000000.00' },
    { ...base, precioAnterior: '3.555' },
    { ...base, genero: 'Otro' },
    { ...base, esNovedad: 'true' },
    { ...base, categoriaId: 'SHO-0001' },
    { ...base, ordenCatalogo: -1 },
    { ...base, ordenColor: 1.5 },
  ])('rechaza contratos o datos inválidos %j', (v) => {
    expect(() => DatosPublicado.leer(v)).toThrow();
  });
  it.each([
    'estado',
    'sku',
    'slug',
    'codigoInterno',
    'grupoModelo',
    'marcaId',
    'modelo',
    'codigoModelo',
    'color',
    'colorNombre',
    'colorHexadecimal',
    'tallas',
    'variantes',
    'habilitada',
    'existencias',
    'cantidadReservada',
    'versionExistencias',
    'usuarioResponsableId',
    'actualizadoPorId',
    'imagenes',
  ])('rechaza el campo fuera de alcance %s', (campo) => {
    expect(() =>
      DatosPublicado.leer({ ...base, nombre: 'Nombre', [campo]: 'dato' }),
    ).toThrow();
  });
});
