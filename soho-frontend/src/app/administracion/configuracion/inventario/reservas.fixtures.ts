import { ConfiguracionReserva, RespuestaReservas } from './contrato-reservas';
export const usuarioReservas = {
  id: 'admin',
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'ana@reservas.test',
  rol: 'ADMIN' as const,
  correoVerificado: true,
};
export function reservasFixture(
  cambios: Partial<ConfiguracionReserva> = {},
  temporal = false,
  modificada?: boolean,
): RespuestaReservas {
  return {
    configuracion: {
      version: 1,
      modo: 'HASTA_DECISION',
      horas: null,
      accionVencimiento: null,
      accionCancelacion: 'LIBERAR',
      creadoEn: '2026-11-14T12:00:00.000Z',
      actualizadoEn: '2026-11-14T12:00:00.000Z',
      actualizadoPor: null,
      ...cambios,
    },
    capacidades: { reservaTemporalDisponible: temporal },
    ...(modificada === undefined ? {} : { modificada }),
  };
}
export const reservasGuardadas = () =>
  reservasFixture(
    {
      version: 2,
      accionCancelacion: 'PREGUNTAR',
      actualizadoEn: '2026-11-14T12:01:00.000Z',
      actualizadoPor: { id: 'admin', nombre: 'Ana Prueba' },
    },
    false,
    true,
  );
