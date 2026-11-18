import { BadRequestException } from '@nestjs/common';
import { DatosConfiguracionReservasPipe } from './datos-configuracion-reservas.pipe.js';

const valido = () => ({
  version: 1,
  confirmado: true,
  modo: 'HASTA_DECISION',
  horas: null,
  accionVencimiento: null,
  accionCancelacion: 'LIBERAR',
});
const temporal = () => ({
  ...valido(),
  modo: 'TIEMPO',
  horas: 24,
  accionVencimiento: 'SOLO_ALERTAR',
});
describe('Contrato estricto de configuración de reservas', () => {
  const pipe = new DatosConfiguracionReservasPipe();
  it.each(['LIBERAR', 'PREGUNTAR'])(
    'admite la reserva hasta decisión con cancelación %s',
    (accionCancelacion) => {
      expect(pipe.transform({ ...valido(), accionCancelacion })).toEqual({
        ...valido(),
        accionCancelacion,
      });
    },
  );
  it.each(['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'])(
    'valida la forma temporal %s antes de comprobar su disponibilidad',
    (accionVencimiento) => {
      expect(
        pipe.transform({ ...temporal(), accionVencimiento }),
      ).toMatchObject({ modo: 'TIEMPO', horas: 24, accionVencimiento });
    },
  );
  it.each([1, 999999])('admite el límite de %i horas', (horas) => {
    expect(pipe.transform({ ...temporal(), horas }).horas).toBe(horas);
  });
  it('admite la versión máxima para comprobar un guardado sin cambios', () => {
    expect(pipe.transform({ ...valido(), version: 4294967295 }).version).toBe(
      4294967295,
    );
  });
  it.each([null, undefined, [], '', 1, true])(
    'rechaza un cuerpo que no sea objeto: %j',
    (cuerpo) => {
      expect(() => pipe.transform(cuerpo)).toThrow(BadRequestException);
    },
  );
  it.each([
    'version',
    'confirmado',
    'modo',
    'horas',
    'accionVencimiento',
    'accionCancelacion',
  ])('exige el campo %s', (campo) => {
    const cuerpo: Record<string, unknown> = valido();
    delete cuerpo[campo];
    expect(() => pipe.transform(cuerpo)).toThrow(BadRequestException);
  });
  it.each([0, -1, 1.5, '1', null, true, 4294967296, NaN])(
    'rechaza una versión inválida: %j',
    (version) => {
      expect(() => pipe.transform({ ...valido(), version })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each([false, 1, 'true', null])(
    'exige confirmación literal: %j',
    (confirmado) => {
      expect(() => pipe.transform({ ...valido(), confirmado })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each(['hasta', 'tiempo', 'HASTA_DECISION ', null, 1])(
    'rechaza un modo inválido: %j',
    (modo) => {
      expect(() => pipe.transform({ ...valido(), modo })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each(['CONSERVAR', 'liberar', 'LIBERAR ', null, 1])(
    'rechaza una política de cancelación inválida: %j',
    (accionCancelacion) => {
      expect(() => pipe.transform({ ...valido(), accionCancelacion })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each([0, 24, '', '24'])(
    'exige horas nulas al reservar hasta decisión: %j',
    (horas) => {
      expect(() => pipe.transform({ ...valido(), horas })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each(['SOLO_ALERTAR', 'LIBERAR_Y_ALERTAR', ''])(
    'exige acción de vencimiento nula al reservar hasta decisión: %j',
    (accionVencimiento) => {
      expect(() => pipe.transform({ ...valido(), accionVencimiento })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each([0, -1, 0.5, 1000000, '24', null, true])(
    'rechaza horas temporales inválidas: %j',
    (horas) => {
      expect(() => pipe.transform({ ...temporal(), horas })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each([null, '', 'ALERTAR', 'SOLO_ALERTAR ', 1])(
    'rechaza una acción de vencimiento inválida: %j',
    (accionVencimiento) => {
      expect(() =>
        pipe.transform({ ...temporal(), accionVencimiento }),
      ).toThrow(BadRequestException);
    },
  );
  it.each([
    'id',
    'actualizadoPorId',
    'actualizadoEn',
    'capacidades',
    'reservas',
    'versionPedido',
  ])('rechaza el campo ajeno %s', (campo) => {
    expect(() => pipe.transform({ ...valido(), [campo]: 1 })).toThrow(
      BadRequestException,
    );
  });
});
