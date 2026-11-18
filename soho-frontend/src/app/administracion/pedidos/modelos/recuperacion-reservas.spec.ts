import { adaptarPagoAdmin } from '../../pagos/servicios/pagos-administracion-api';
import { adaptarPlanRecuperacion } from './recuperacion-reservas';
import {
  planRecuperacionFixture,
  recuperacionApiFixture,
} from '../servicios/recuperacion-reservas.fixtures';

describe('Contrato de recuperación de reservas', () => {
  const pedido = () => adaptarPagoAdmin(recuperacionApiFixture()).pedido;
  it('conserva política histórica y datos de disponibilidad sin recalcular precios', () => {
    const p = adaptarPlanRecuperacion(planRecuperacionFixture(), pedido());
    expect(p.articulos[0]).toMatchObject({
      configuracionVersion: 7,
      horas: 24,
      accionCancelacion: 'PREGUNTAR',
    });
    expect(Object.isFrozen(p.articulos)).toBe(true);
  });
  it.each(['codigo', 'versionPedido', 'versionPago'])(
    'rechaza un plan que no corresponde al %s consultado',
    (campo) => {
      expect(() =>
        adaptarPlanRecuperacion({ ...planRecuperacionFixture(), [campo]: 'otro' }, pedido()),
      ).toThrow();
    },
  );
  it.each([0, -1, 1.5, 1000000])('rechaza duración inválida %s', (horas) => {
    const p = planRecuperacionFixture();
    p.articulos[0].horas = horas;
    expect(() => adaptarPlanRecuperacion(p, pedido())).toThrow();
  });
  it('rechaza cantidades duplicadas o que exceden la compra', () => {
    const p = planRecuperacionFixture();
    p.articulos.push(p.articulos[0]);
    expect(() => adaptarPlanRecuperacion(p, pedido())).toThrow();
  });
  it('admite un bloqueo por falta de stock sin inventar disponibilidad suficiente', () => {
    const p = planRecuperacionFixture();
    p.puedeRecuperar = false;
    const bloqueado = {
      ...p,
      motivoBloqueo: 'No hay stock.',
      articulos: [{ ...p.articulos[0], disponibles: 0 }],
    };
    expect(adaptarPlanRecuperacion(bloqueado, pedido()).puedeRecuperar).toBe(false);
  });
  it('valida metadatos privados de la última recuperación', () => {
    const p = recuperacionApiFixture(true);
    p.recuperacionReservas.ultima!.versionPedido = 999;
    expect(() => adaptarPagoAdmin(p)).toThrow('Historial');
  });
});
