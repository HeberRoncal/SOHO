import { randomUUID } from 'node:crypto';
import { DatosPagoPipe, datosCorreccion } from './datos-pago.pipe.js';

describe('Contratos de revisión y corrección', () => {
  const pipe = new DatosPagoPipe();
  const base = {
    versionPedido: 1,
    versionPago: 1,
    comprobanteId: randomUUID(),
  };
  const observar = {
    ...base,
    accion: 'OBSERVADO',
    motivo: 'ILEGIBLE',
    mensaje: 'Adjunta una imagen legible.',
    solicitud: 'LEGIBLE',
  };
  it('permite aprobar únicamente con confirmación explícita', () => {
    expect(
      pipe.transform({ ...base, accion: 'APROBADO', confirmado: true }),
    ).toMatchObject({ accion: 'APROBADO' });
    for (const confirmado of [false, 'true', undefined, 1])
      expect(() =>
        pipe.transform({ ...base, accion: 'APROBADO', confirmado }),
      ).toThrow();
    expect(() =>
      pipe.transform({
        ...base,
        accion: 'APROBADO',
        confirmado: true,
        mensaje: 'texto oculto',
      }),
    ).toThrow();
  });
  it('normaliza el mensaje y valida las cinco categorías de motivo', () => {
    for (const motivo of ['ILEGIBLE', 'MONTO', 'INGRESO', 'DATOS', 'OTRO'])
      expect(
        pipe.transform({
          ...observar,
          motivo,
          mensaje: '  Adjunta una imagen legible.  ',
        }).mensaje,
      ).toBe('Adjunta una imagen legible.');
  });
  it.each([
    { motivo: 'inventado' },
    { solicitud: 'otro' },
    { mensaje: 'corto' },
    { mensaje: 'a'.repeat(501) },
    { mensaje: 'Mensaje con\ncontrol' },
    { revisadoPorId: randomUUID() },
    { versionPedido: 0 },
    { versionPago: '1' },
    { accion: 'ANULADO' },
    { comprobanteId: 'otro' },
  ])('rechaza observaciones inválidas %j', (cambio) =>
    expect(() => pipe.transform({ ...observar, ...cambio })).toThrow(),
  );
  it('rechazar exige confirmación y no acepta solicitud de corrección', () => {
    const d = {
      ...base,
      accion: 'RECHAZADO',
      motivo: 'MONTO',
      mensaje: 'El ingreso no corresponde.',
    };
    expect(() => pipe.transform(d)).toThrow();
    expect(pipe.transform({ ...d, confirmado: true })).toMatchObject({
      accion: 'RECHAZADO',
    });
    expect(() =>
      pipe.transform({ ...d, confirmado: true, solicitud: 'LEGIBLE' }),
    ).toThrow();
  });
  it('la corrección reutiliza el contrato de archivos y conserva ceros de operación', () => {
    const comprobante = {
      nombreArchivo: 'captura.png',
      tipoArchivo: 'image/png',
      contenidoBase64: 'AA==',
      numeroOperacion: '001234',
    };
    expect(
      datosCorreccion({ ...base, comprobante }).comprobante.numeroOperacion,
    ).toBe('001234');
    for (const cambio of [
      { nombreArchivo: '../captura.png' },
      { numeroOperacion: 'DEMO-1' },
      { contenidoBase64: 'data:image/png;base64,AA==' },
      { tipoArchivo: 'image/svg+xml' },
    ])
      expect(() =>
        datosCorreccion({
          ...base,
          comprobante: { ...comprobante, ...cambio },
        }),
      ).toThrow();
    expect(() =>
      datosCorreccion({ ...base, comprobante, usuarioId: randomUUID() }),
    ).toThrow();
  });
});
