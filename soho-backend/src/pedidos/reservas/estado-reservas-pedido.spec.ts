import { EstadoReservasPedido } from './estado-reservas-pedido.js';
import type { PedidoAdmin } from '../dto/respuesta-administracion.js';

describe('EstadoReservasPedido', () => {
  type Reserva = PedidoAdmin['articulos'][number]['reservas'][number];
  const r = (id: string, creadoEn: string, estado = 'LIBERADA') =>
    ({
      id,
      creadoEn: new Date(creadoEn),
      estado,
      modo: 'TIEMPO',
      accionVencimiento: 'LIBERAR_Y_ALERTAR',
      venceEn: new Date('2026-11-14T12:00:00Z'),
      vencimientoAtendidoEn: new Date('2026-11-14T12:01:00Z'),
      cerradaEn: new Date('2026-11-14T12:01:00Z'),
    }) as Reserva;
  it('elige la última reserva sin cambiar el orden del historial recibido', () => {
    const original = [
      r('a', '2026-11-14T10:00:00Z'),
      r('b', '2026-11-14T13:00:00Z', 'ACTIVA'),
    ];
    expect(EstadoReservasPedido.ultima(original)?.id).toBe('b');
    expect(original[0].id).toBe('a');
  });
  it('desempata identificadores cuando las fechas coinciden', () => {
    expect(
      EstadoReservasPedido.ultima([r('a', '2026-11-14'), r('b', '2026-11-14')])
        ?.id,
    ).toBe('b');
  });
  it('no confunde una liberación posterior con la atención por vencimiento', () => {
    const reserva = r('a', '2026-11-14T10:00:00Z');
    expect(EstadoReservasPedido.liberadaPorVencimiento(reserva)).toBe(true);
    reserva.cerradaEn = new Date('2026-11-14T14:00:00Z');
    expect(EstadoReservasPedido.liberadaPorVencimiento(reserva)).toBe(false);
  });
});
