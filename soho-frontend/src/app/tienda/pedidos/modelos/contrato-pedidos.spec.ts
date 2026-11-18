import { adaptarPedido } from './contrato-pedidos';
import { pedidoApi } from '../servicios/pedidos-api.fixtures';

describe('Adaptación de pedidos reales', () => {
  it.each(['PENDIENTE', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO'])(
    'conserva el estado de pago %s',
    (estado) => {
      const p = pedidoApi();
      p.pago.estado = estado;
      expect(adaptarPedido(p).estadoPago).toBe(estado.toLowerCase());
    },
  );
  it.each([
    'PENDIENTE',
    'CONFIRMADO',
    'EN_PREPARACION',
    'INCIDENCIA',
    'ENVIADO',
    'ENTREGADO',
    'CANCELADO',
  ])('conserva el estado de entrega %s', (estado) => {
    const p = pedidoApi();
    p.estadoEntrega = estado;
    expect(adaptarPedido(p).estadoPreparacion).toBe(estado.toLowerCase().replaceAll('_', '-'));
  });
  it('rechaza estados desconocidos en lugar de inventar un pendiente', () => {
    const p = pedidoApi();
    p.pago.estado = 'DESCONOCIDO';
    expect(() => adaptarPedido(p)).toThrow();
  });
  it('conserva ceros, destino histórico y céntimos sin exponer campos internos', () => {
    const p = adaptarPedido(pedidoApi());
    expect(p.total).toBe(199.98);
    expect(p.datos.facturacion?.numero).toBe('00123456');
    expect(p.datos.destinatario).toBe('Otra Persona');
    expect(p.comprobante.numeroOperacion).toBe('001234');
    expect(p).not.toHaveProperty('usuarioId');
  });
});
