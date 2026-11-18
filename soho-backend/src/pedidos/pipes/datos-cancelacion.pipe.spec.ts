import { BadRequestException } from '@nestjs/common';
import { DatosCancelacionPipe } from './datos-cancelacion.pipe.js';

describe('Contratos estrictos de cancelación y liberación', () => {
  const cancelar = new DatosCancelacionPipe('CANCELAR'),
    liberar = new DatosCancelacionPipe('LIBERAR');
  const base = {
    versionPedido: 2,
    versionPago: 1,
    confirmado: true,
    motivo: 'Solicitud del cliente de cancelar.',
  };
  it('recorta el motivo y admite notas con saltos y decisiones explícitas', () => {
    expect(
      cancelar.transform({
        ...base,
        motivo: '  Solicitud del cliente\nNo será enviado.  ',
        decisionReservasConsultadas: 'CONSERVAR',
      }),
    ).toEqual({
      ...base,
      motivo: 'Solicitud del cliente\nNo será enviado.',
      decisionReservasConsultadas: 'CONSERVAR',
    });
    expect(
      liberar.transform({
        versionPedido: 2,
        versionPago: 4294967295,
        confirmado: true,
      }),
    ).toEqual({ versionPedido: 2, versionPago: 4294967295, confirmado: true });
  });
  it.each([null, [], 'texto', {}])('rechaza raíz inválida: %j', (v) =>
    expect(() => cancelar.transform(v)).toThrow(BadRequestException),
  );
  it.each([0, -1, 1.5, '2', null, 4294967296])(
    'rechaza versión inválida: %j',
    (version) => {
      for (const campo of ['versionPedido', 'versionPago'])
        expect(() => cancelar.transform({ ...base, [campo]: version })).toThrow(
          BadRequestException,
        );
    },
  );
  it('impide incrementar un pedido en el límite de versión', () =>
    expect(() =>
      cancelar.transform({ ...base, versionPedido: 4294967295 }),
    ).toThrow(BadRequestException));
  it.each([false, 'true', 1, undefined])(
    'requiere confirmación literal: %j',
    (confirmado) =>
      expect(() => cancelar.transform({ ...base, confirmado })).toThrow(
        BadRequestException,
      ),
  );
  it.each([
    '',
    'corto',
    'a'.repeat(301),
    'Motivo con\tcontrol',
    'Motivo con\u0000control',
    'Motivo con\u200bformato',
    5,
  ])('rechaza motivo inválido: %j', (motivo) =>
    expect(() => cancelar.transform({ ...base, motivo })).toThrow(
      BadRequestException,
    ),
  );
  it.each(['PREGUNTAR', 'liberar', null, true])(
    'no confunde política y decisión: %j',
    (decisionReservasConsultadas) =>
      expect(() =>
        cancelar.transform({ ...base, decisionReservasConsultadas }),
      ).toThrow(BadRequestException),
  );
  it.each([
    'estadoEntrega',
    'registradaPorId',
    'canceladaEn',
    'existencias',
    'reservas',
    'reembolso',
  ])('rechaza el campo controlado por el servidor: %s', (campo) =>
    expect(() => cancelar.transform({ ...base, [campo]: true })).toThrow(
      BadRequestException,
    ),
  );
  it('la liberación posterior no admite motivo ni decisiones para otra acción', () => {
    for (const campo of ['motivo', 'decisionReservasConsultadas'])
      expect(() =>
        liberar.transform({
          versionPedido: 3,
          versionPago: 2,
          confirmado: true,
          [campo]: 'LIBERAR',
        }),
      ).toThrow(BadRequestException);
  });
});
