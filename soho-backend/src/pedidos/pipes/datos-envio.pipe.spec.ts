import { BadRequestException } from '@nestjs/common';
import { DatosEnvioPipe } from './datos-envio.pipe.js';

describe('Contrato de preparación, envío y entrega', () => {
  const preparar = new DatosEnvioPipe('PREPARAR');
  const enviar = new DatosEnvioPipe('ENVIAR');
  const entregar = new DatosEnvioPipe('ENTREGAR');
  it('normaliza la nota y conserva ceros iniciales de seguimiento', () => {
    expect(
      enviar.transform({
        versionPedido: 2,
        transportista: ' SOHO ',
        referenciaSeguimiento: ' 000123 ',
        nota: ' Revisar\n paquete ',
      }),
    ).toEqual({
      versionPedido: 2,
      transportista: 'SOHO',
      referenciaSeguimiento: '000123',
      nota: 'Revisar\n paquete',
    });
    expect(preparar.transform({ versionPedido: 1 })).toEqual({
      versionPedido: 1,
      nota: '',
    });
  });
  it.each([
    null,
    [],
    'texto',
    {},
    { versionPedido: 0 },
    { versionPedido: '1' },
    { versionPedido: 1.5 },
    { versionPedido: 4294967295 },
  ])('rechaza raíz o versión inválida: %j', (value) => {
    expect(() => preparar.transform(value)).toThrow(BadRequestException);
  });
  it.each(['estadoEntrega', 'responsableId', 'transportista', 'confirmado'])(
    'preparación rechaza el campo %s',
    (campo) => {
      expect(() =>
        preparar.transform({ versionPedido: 1, [campo]: true }),
      ).toThrow(BadRequestException);
    },
  );
  it.each([null, 'x', 'a'.repeat(81), 'SO\u0000HO', 'SO\u200bHO', '\tSOHO'])(
    'rechaza transportista inválido: %j',
    (transportista) => {
      expect(() =>
        enviar.transform({
          versionPedido: 1,
          transportista,
          referenciaSeguimiento: '001',
        }),
      ).toThrow(BadRequestException);
    },
  );
  it.each([undefined, 123, 'ab', 'a'.repeat(81), '001\n234'])(
    'rechaza referencia inválida: %j',
    (referenciaSeguimiento) => {
      expect(() =>
        enviar.transform({
          versionPedido: 1,
          transportista: 'SOHO',
          referenciaSeguimiento,
        }),
      ).toThrow(BadRequestException);
    },
  );
  it.each([false, 'true', 1, undefined])(
    'exige confirmación literal de entrega: %j',
    (confirmado) => {
      expect(() =>
        entregar.transform({ versionPedido: 1, confirmado }),
      ).toThrow(BadRequestException);
    },
  );
  it('rechaza notas excesivas, controles y datos de despacho en entrega', () => {
    for (const nota of ['a'.repeat(301), '\u0000', '\u200b', 5])
      expect(() => preparar.transform({ versionPedido: 1, nota })).toThrow(
        BadRequestException,
      );
    expect(() =>
      entregar.transform({
        versionPedido: 1,
        confirmado: true,
        transportista: 'SOHO',
      }),
    ).toThrow(BadRequestException);
    expect(entregar.transform({ versionPedido: 1, confirmado: true })).toEqual({
      versionPedido: 1,
      confirmado: true,
      nota: '',
    });
  });
});
