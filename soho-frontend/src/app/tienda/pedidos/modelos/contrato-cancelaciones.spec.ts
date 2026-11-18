import { adaptarPedido } from './contrato-pedidos';
import { adaptarPagoAdmin } from '../../../administracion/pagos/servicios/pagos-administracion-api';
import { cancelacionApiFixture as fixture } from '../../../administracion/pedidos/servicios/cancelaciones-administracion-api.fixtures';
describe('Contrato de cancelación y privacidad', () => {
  it('el cliente conserva solo la fecha, con pago independiente y sin datos internos', () => {
    const p = adaptarPedido(fixture({ cancelado: true, conservar: true }));
    expect(p.cancelacion).toEqual({ fecha: '2026-11-14T15:00:00.000Z' });
    expect(Object.isFrozen(p.cancelacion)).toBe(true);
    expect(p.estadoPago).toBe('aprobado');
    expect(p.estadoPreparacion).toBe('cancelado');
    expect(JSON.stringify(p)).not.toMatch(
      /Sofía|motivo|registradaPor|reservasCancelacion|CONSERVAR/,
    );
  });
  it('admite cancelados anteriores sin inventar fecha', () => {
    expect(
      adaptarPedido({ ...fixture({ cancelado: true }), cancelacion: null }).cancelacion,
    ).toBeNull();
  });
  it.each(['fecha inválida', '2026-11-14T11:59:59.000Z'])(
    'rechaza una fecha incoherente: %s',
    (fecha) => {
      expect(() =>
        adaptarPedido({ ...fixture({ cancelado: true }), cancelacion: { fecha } }),
      ).toThrow();
    },
  );
  it('rechaza una cancelación en un pedido que aún sigue activo', () => {
    expect(() =>
      adaptarPedido({ ...fixture(), cancelacion: { fecha: '2026-11-14T15:00:00Z' } }),
    ).toThrow();
  });
  it('admin recibe responsable, decisión histórica y cantidades sin rutas de archivo', () => {
    const p = adaptarPagoAdmin(fixture({ cancelado: true, conservar: true })).pedido;
    expect(p.cancelacion).toMatchObject({
      responsableId: 'admin',
      autor: 'Sofía Admin',
      versionPedido: 3,
      decisionReservasConsultadas: 'CONSERVAR',
    });
    expect(p.reservasCancelacion?.unidadesRetenidas).toBe(2);
    expect(JSON.stringify(p)).not.toContain('ruta-no-confiable');
  });
  it.each([
    { versionPedido: 4 },
    { versionPedido: 0 },
    { decisionReservasConsultadas: 'PREGUNTAR' },
    { estadoEntregaAnterior: 'ENVIADO' },
  ])('rechaza una cancelación administrativa inválida: %j', (c) => {
    const p = fixture({ cancelado: true, conservar: true });
    expect(() => adaptarPagoAdmin({ ...p, cancelacion: { ...p.cancelacion, ...c } })).toThrow();
  });
  it('rechaza cantidades negativas o un permiso de liberar sin reservas retenidas', () => {
    const p = fixture({ cancelado: true, conservar: true });
    expect(() =>
      adaptarPagoAdmin({
        ...p,
        reservasCancelacion: { ...p.reservasCancelacion, unidadesConsultables: -1 },
      }),
    ).toThrow();
    expect(() =>
      adaptarPagoAdmin({
        ...fixture(),
        reservasCancelacion: {
          unidadesConsultables: 0,
          unidadesLiberacionAutomatica: 0,
          unidadesRetenidas: 0,
          puedeLiberarRetenidas: true,
        },
      }),
    ).toThrow();
  });
  it('conserva al responsable solo en eventos internos', () => {
    const p = fixture({ cancelado: true, conservar: true, liberado: true });
    const admin = adaptarPagoAdmin({ ...p, eventos: p.eventosInternos }).pedido;
    expect(admin.eventos.find((e) => e.interna)?.responsable?.id).toBe('admin');
    expect(admin.eventos.find((e) => !e.interna)?.responsable).toBeNull();
  });
});
