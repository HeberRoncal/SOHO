import {
  adaptarConfiguracionReservas,
  borradorReserva,
  politicaReserva,
} from './contrato-reservas';
import { reservasFixture, reservasGuardadas } from './reservas.fixtures';
describe('Contrato de configuración de reservas', () => {
  it('adopta solo campos permitidos, conserva metadatos y congela la respuesta', () => {
    const r = adaptarConfiguracionReservas(
      {
        ...reservasGuardadas(),
        configuracion: {
          ...reservasGuardadas().configuracion,
          correo: 'privado',
          actualizadoPor: { id: 'admin', nombre: 'Ana', claveHash: 'privada' },
        },
        secreto: 'ignorado',
      },
      true,
    );
    expect(r.configuracion.version).toBe(2);
    expect(r.configuracion.actualizadoPor).toEqual({ id: 'admin', nombre: 'Ana' });
    expect(JSON.stringify(r)).not.toMatch(/privad|secreto/);
    expect(Object.isFrozen(r.configuracion)).toBe(true);
    expect(Object.isFrozen(r.capacidades)).toBe(true);
  });
  it('conserva una política temporal histórica aunque no puedan activarse nuevos cambios', () => {
    const r = adaptarConfiguracionReservas(
      reservasFixture({ modo: 'TIEMPO', horas: 24, accionVencimiento: 'SOLO_ALERTAR' }),
    );
    expect(r.configuracion.horas).toBe(24);
    expect(r.capacidades.reservaTemporalDisponible).toBe(false);
    expect(politicaReserva(borradorReserva(r.configuracion))).toEqual({
      modo: 'TIEMPO',
      horas: 24,
      accionVencimiento: 'SOLO_ALERTAR',
      accionCancelacion: 'LIBERAR',
    });
  });
  it.each([
    { version: 0 },
    { version: '1' },
    { version: 4294967296 },
    { modo: 'hasta' },
    { horas: 24 },
    { accionVencimiento: 'SOLO_ALERTAR' },
    { accionCancelacion: 'CONSERVAR' },
    { actualizadoPor: {} },
    { creadoEn: 'ayer' },
    { actualizadoEn: '2026-11-14T11:00:00.000Z' },
  ])('rechaza configuración incompatible: %j', (c) => {
    expect(() =>
      adaptarConfiguracionReservas({
        ...reservasFixture(),
        configuracion: { ...reservasFixture().configuracion, ...c },
      }),
    ).toThrow();
  });
  it.each([0, 1.5, 1000000, '24', null])('rechaza horas temporales inválidas: %j', (horas) => {
    expect(() =>
      adaptarConfiguracionReservas({
        ...reservasFixture(),
        configuracion: {
          ...reservasFixture().configuracion,
          modo: 'TIEMPO',
          horas,
          accionVencimiento: 'SOLO_ALERTAR',
        },
      }),
    ).toThrow();
  });
  it('rechaza capacidades sin booleano o una respuesta de escritura sin resultado explícito', () => {
    expect(() =>
      adaptarConfiguracionReservas({
        ...reservasFixture(),
        capacidades: { reservaTemporalDisponible: 'false' },
      }),
    ).toThrow();
    expect(() => adaptarConfiguracionReservas(reservasFixture(), true)).toThrow();
  });
});
