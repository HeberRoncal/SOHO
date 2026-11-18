import { PEDIDOS_ADMIN_DEMO } from '../../cambios/datos/pedidos-posventa-demo';
import {
  FILTROS_PEDIDOS_VACIOS,
  coincidePedidoAdmin,
  diaPedidoAdmin,
  fechaFiltroPedido,
  ordenarPedidosAdmin,
} from './pedido-admin';

describe('Pedidos administrativos de demostración', () => {
  it('calcula importes en céntimos y mantiene separados pago y entrega', () => {
    expect(new Set(PEDIDOS_ADMIN_DEMO.map((p) => p.codigo)).size).toBe(PEDIDOS_ADMIN_DEMO.length);
    for (const p of PEDIDOS_ADMIN_DEMO) {
      const subtotal = p.articulos.reduce(
        (s, a) => s + Math.round(a.precioUnitario * 100) * a.cantidad,
        0,
      );
      expect(Math.round(p.subtotal * 100)).toBe(subtotal);
      expect(Math.round(p.total * 100)).toBe(
        subtotal + Math.round(p.envio * 100) - Math.round(p.descuento * 100),
      );
      expect(
        p.articulos.every(
          (a) => a.cantidad > 0 && Number.isInteger(a.cantidad) && a.sku.endsWith('-' + a.talla),
        ),
      ).toBe(true);
      if (p.direccion.distrito === 'La Esperanza') expect(p.envio).toBe(0);
      if (
        ['confirmado', 'en-preparacion', 'enviado', 'entregado', 'incidencia'].includes(
          p.estadoEntrega,
        )
      )
        expect(p.estadoPago).toBe('aprobado');
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.articulos)).toBe(true);
      expect(Object.isFrozen(p.cliente)).toBe(true);
    }
    expect(
      PEDIDOS_ADMIN_DEMO.some(
        (p) => p.estadoPago === 'aprobado' && p.estadoEntrega === 'cancelado',
      ),
    ).toBe(true);
  });
  it('normaliza búsqueda y combina filtros sin confundir aprobado con por preparar', () => {
    const buscar = { ...FILTROS_PEDIDOS_VACIOS, busqueda: ' LUCIA FERNANDEZ ' };
    const encontrados = PEDIDOS_ADMIN_DEMO.filter((p) => coincidePedidoAdmin(p, buscar));
    expect(encontrados.length).toBe(2);
    expect(
      PEDIDOS_ADMIN_DEMO.filter((p) =>
        coincidePedidoAdmin(p, { ...FILTROS_PEDIDOS_VACIOS, entrega: 'por-preparar' }),
      ),
    ).toHaveLength(2);
    expect(
      PEDIDOS_ADMIN_DEMO.filter((p) =>
        coincidePedidoAdmin(p, {
          ...FILTROS_PEDIDOS_VACIOS,
          pago: 'aprobado',
          entrega: 'cancelado',
        }),
      ),
    ).toHaveLength(1);
    expect(
      PEDIDOS_ADMIN_DEMO.filter((p) => coincidePedidoAdmin(p, { ...buscar, cliente: 'invitado' })),
    ).toHaveLength(0);
    expect(
      PEDIDOS_ADMIN_DEMO.filter((p) =>
        coincidePedidoAdmin(p, { ...FILTROS_PEDIDOS_VACIOS, busqueda: 'soho-000128' }),
      ),
    ).toHaveLength(1);
  });
  it('filtra días de Perú y rechaza fechas mal formadas o inexistentes', () => {
    expect(diaPedidoAdmin('2026-11-09T02:30:00Z')).toBe('2026-11-08');
    for (const fecha of ['2026-02-30', '2026-2-01', 'no-fecha', '2026-13-01'])
      expect(fechaFiltroPedido(fecha)).toBe('');
    expect(fechaFiltroPedido('2028-02-29')).toBe('2028-02-29');
    expect(
      PEDIDOS_ADMIN_DEMO.filter((p) =>
        coincidePedidoAdmin(p, {
          ...FILTROS_PEDIDOS_VACIOS,
          desde: '2026-11-08',
          hasta: '2026-11-08',
        }),
      ),
    ).toHaveLength(2);
  });
  it('ordena sin mutar los pedidos y conserva sus importes históricos', () => {
    const ordenados = ordenarPedidosAdmin(PEDIDOS_ADMIN_DEMO, 'total-menor');
    expect(ordenados.every((p, i) => !i || ordenados[i - 1].total <= p.total)).toBe(true);
    expect(ordenarPedidosAdmin(PEDIDOS_ADMIN_DEMO, 'antiguos')[0].codigo).toBe('SOHO-000117');
    expect(PEDIDOS_ADMIN_DEMO[0].codigo).toBe('SOHO-000128');
  });
});
