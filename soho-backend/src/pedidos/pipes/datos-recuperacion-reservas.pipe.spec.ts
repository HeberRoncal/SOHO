import { DatosRecuperacionReservasPipe } from './datos-recuperacion-reservas.pipe.js';

describe('DatosRecuperacionReservasPipe', () => {
  const pipe = new DatosRecuperacionReservasPipe();
  const valido = {
    versionPedido: 2,
    versionPago: 1,
    confirmado: true,
    motivo: 'Disponibilidad confirmada con el cliente.',
  };
  it('acepta confirmación, versiones y motivo recortado', () => {
    expect(
      pipe.transform({
        ...valido,
        motivo: '  Motivo de recuperación válido.  ',
      }),
    ).toMatchObject({ motivo: 'Motivo de recuperación válido.' });
  });
  it.each([
    null,
    [],
    {},
    { ...valido, confirmado: false },
    { ...valido, confirmado: 'true' },
    { ...valido, versionPedido: 0 },
    { ...valido, versionPedido: 4294967295 },
    { ...valido, versionPedido: 1.2 },
    { ...valido, versionPago: '1' },
    { ...valido, versionPago: 4294967296 },
    { ...valido, motivo: 'corto' },
    { ...valido, motivo: 'a'.repeat(301) },
    { ...valido, motivo: 'Motivo inválido\u0000' },
    { ...valido, estado: 'PENDIENTE' },
    { ...valido, horas: 24 },
  ])(
    'rechaza cuerpo inválido o campos que decide el servidor: %j',
    (cuerpo) => {
      expect(() => pipe.transform(cuerpo)).toThrow();
    },
  );
});
