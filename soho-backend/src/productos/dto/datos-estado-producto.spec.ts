import { DatosEstadoProducto } from './datos-estado-producto.js';

describe('DatosEstadoProducto compartidos por publicación, archivo y restauración', () => {
  const clave = '113e4567-e89b-42d3-a456-426614174000';
  it('exige la clave y versión y normaliza el UUID', () => {
    expect(
      DatosEstadoProducto.leer({
        claveSolicitud: clave.toUpperCase(),
        version: 2,
      }),
    ).toEqual({ claveSolicitud: clave, version: 2 });
  });
  it.each([
    {},
    null,
    [],
    { claveSolicitud: clave },
    { claveSolicitud: clave, version: '1' },
    { claveSolicitud: clave, version: 0 },
    { claveSolicitud: clave, version: -1 },
    { claveSolicitud: clave, version: 1.5 },
    { claveSolicitud: clave, version: Number.NaN },
    { claveSolicitud: clave, version: Number.MAX_SAFE_INTEGER + 1 },
    { claveSolicitud: clave, version: 4294967295 },
    { claveSolicitud: 'SHO-0001', version: 1 },
  ])('rechaza una solicitud incompleta o inválida %j', (valor) => {
    expect(() => DatosEstadoProducto.leer(valor)).toThrow();
  });
  it.each([
    'estado',
    'nombre',
    'sku',
    'precio',
    'existencias',
    'usuarioResponsableId',
    'cantidadReservada',
    'versionExistencias',
    'fecha',
    'confirmado',
  ])('rechaza el campo no previsto %s', (campo) => {
    expect(() =>
      DatosEstadoProducto.leer({
        claveSolicitud: clave,
        version: 1,
        [campo]: 'dato',
      }),
    ).toThrow();
  });
});
