import { FACTURACION_INICIAL, erroresFacturacion } from './facturacion';

describe('Facturación del checkout', () => {
  it('valida DNI, carné y pasaporte según el documento elegido', () => {
    expect(erroresFacturacion({ ...FACTURACION_INICIAL, numero: '12345678' })).toEqual({});
    expect(erroresFacturacion({ ...FACTURACION_INICIAL, numero: '1234567' }).numero).toBeTruthy();
    expect(
      erroresFacturacion({ ...FACTURACION_INICIAL, documento: 'CE', numero: 'AB1234567' }),
    ).toEqual({});
    expect(
      erroresFacturacion({ ...FACTURACION_INICIAL, documento: 'PAS', numero: 'AB1234' }),
    ).toEqual({});
  });
  it('exige RUC, razón social y domicilio fiscal solo para factura', () => {
    const factura = { ...FACTURACION_INICIAL, tipo: 'factura' as const };
    expect(Object.keys(erroresFacturacion(factura))).toEqual([
      'ruc',
      'razonSocial',
      'domicilioFiscal',
    ]);
    expect(
      erroresFacturacion({
        ...factura,
        ruc: '20123456789',
        razonSocial: 'Empresa SAC',
        domicilioFiscal: 'Av. Perú 123',
      }),
    ).toEqual({});
  });
});
