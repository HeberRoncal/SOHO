import { DatosMovimientoManual } from './datos-movimiento-manual.js';
const base = () => ({
  claveSolicitud: '12345678-1234-1234-1234-123456789ABC',
  versionExistencias: 1,
  reservadoEsperado: 0,
  habilitadaEsperada: true,
  tipo: 'ENTRADA',
  cantidad: 2,
  motivo: ' Reposición ',
  referencia: '  ',
});
describe('Contrato de movimientos manuales', () => {
  it('normaliza la solicitud sin fabricar saldos', () => {
    expect(DatosMovimientoManual.leer(base())).toEqual({
      ...base(),
      claveSolicitud: base().claveSolicitud.toLowerCase(),
      motivo: 'Reposición',
      referencia: null,
    });
  });
  it.each([
    { tipo: 'ENTRADA', cantidad: 1 },
    { tipo: 'SALIDA', cantidad: -1 },
    { tipo: 'AJUSTE', cantidad: 2 },
    { tipo: 'AJUSTE', cantidad: -2 },
  ])('admite tipo y delta coherentes %j', (d) => {
    expect(DatosMovimientoManual.leer({ ...base(), ...d })).toMatchObject(d);
  });
  it.each([0, -0, 1.5, NaN, Infinity, -100000, 100000, '2', null, undefined])(
    'rechaza cantidad %s',
    (cantidad) => {
      expect(() =>
        DatosMovimientoManual.leer({ ...base(), cantidad }),
      ).toThrow();
    },
  );
  it.each([
    { tipo: 'ENTRADA', cantidad: -1 },
    { tipo: 'SALIDA', cantidad: 1 },
    { tipo: 'entrada' },
    { tipo: 'OTRO' },
    { versionExistencias: 0 },
    { versionExistencias: '1' },
    { versionExistencias: 4294967296 },
    { reservadoEsperado: -1 },
    { reservadoEsperado: 100000 },
    { reservadoEsperado: '2' },
    { habilitadaEsperada: 1 },
    { habilitadaEsperada: 'true' },
    { habilitadaEsperada: null },
    { claveSolicitud: 'x' },
    { motivo: ' ' },
    { motivo: 'x'.repeat(161) },
    { motivo: 'a\nb' },
    { referencia: 'x'.repeat(81) },
    { referencia: 'a\u0000b' },
  ])('rechaza datos inválidos %j', (d) => {
    expect(() => DatosMovimientoManual.leer({ ...base(), ...d })).toThrow();
  });
  it.each([
    'saldoPosterior',
    'usuarioResponsableId',
    'origen',
    'fecha',
    'sku',
    'envioPedidoId',
    'productoId',
    'confirmado',
  ])('rechaza campo protegido %s', (campo) => {
    expect(() =>
      DatosMovimientoManual.leer({ ...base(), [campo]: 'elegido' }),
    ).toThrow();
  });
  it.each([null, [], 1, 'texto'])('rechaza cuerpo no objeto %j', (c) => {
    expect(() => DatosMovimientoManual.leer(c)).toThrow();
  });
  it('conserva ceros iniciales y normaliza Unicode', () => {
    expect(
      DatosMovimientoManual.leer({
        ...base(),
        referencia: ' 00123 ',
        motivo: 'Reposicio\u0301n',
      }),
    ).toMatchObject({ referencia: '00123', motivo: 'Reposición' });
  });
});
