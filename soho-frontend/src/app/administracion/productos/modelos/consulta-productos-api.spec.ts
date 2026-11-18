import {
  adaptarProductoAdmin,
  adaptarMovimientos,
  adaptarResumenInventario,
  adaptarListadoProductos,
} from './consulta-productos-api';
import {
  listadoProductosFixture,
  productoAdminFixture,
  resumenInventarioFixture,
  ID_PRODUCTO_PRUEBA,
  ID_VARIANTE_PRUEBA,
} from './consulta-productos.fixtures';
describe('Contratos administrativos de inventario', () => {
  it('conserva el precio pendiente, UUID y SKU históricos separados', () => {
    const p = adaptarProductoAdmin(productoAdminFixture());
    expect(p).toMatchObject({
      precio: null,
      identificador: ID_PRODUCTO_PRUEBA,
      slug: 'zapatilla-real',
    });
    expect(p.variantes[0]).toMatchObject({
      identificador: ID_VARIANTE_PRUEBA,
      sku: 'NK-AF107-NG-40',
      existencias: 5,
      cantidadReservada: 3,
    });
  });
  it.each([
    { precio: '0.00' },
    { precio: 99.99 },
    { precio: '-1.00' },
    { estado: 'PUBLICADO' },
    { id: 'SHO-0001' },
    { imagenes: ['javascript:alert(1)'] },
  ])('rechaza un producto inválido: %j', (cambio) => {
    expect(() => adaptarProductoAdmin({ ...productoAdminFixture(), ...cambio })).toThrow();
  });
  it('rechaza disponibilidad falsa y cantidades reservadas negativas', () => {
    for (const cambio of [{ disponible: 5 }, { cantidadReservada: -1 }, { existencias: '5' }]) {
      const p = productoAdminFixture();
      p.variantes = [{ ...p.variantes[0], ...cambio } as (typeof p.variantes)[number]];
      expect(() => adaptarProductoAdmin(p)).toThrow();
    }
  });
  it('conserva faltantes sin eliminar reservas ni permitir disponibilidad negativa', () => {
    const p = productoAdminFixture();
    p.variantes[0] = { ...p.variantes[0], existencias: 1, disponible: 0, faltante: 2 };
    p.inventario = { ...p.inventario, fisico: 1, disponible: 0, bajo: 0, agotadas: 1, faltante: 2 };
    expect(adaptarProductoAdmin(p).variantes[0]).toMatchObject({
      existencias: 1,
      cantidadReservada: 3,
    });
  });
  it('los conteos y alertas globales no dependen de las filas de una página', () => {
    expect(adaptarListadoProductos(listadoProductosFixture()).paginacion.total).toBe(30);
    expect(adaptarResumenInventario(resumenInventarioFixture())).toMatchObject({
      alertasTotal: 30,
      agotadasTotal: 20,
    });
  });
  it('rechaza respuestas que habilitan escrituras o inventan un resumen de stock', () => {
    const p = productoAdminFixture();
    p.inventario.reservado = 0;
    expect(() => adaptarProductoAdmin(p)).toThrow();
    expect(() =>
      adaptarListadoProductos({
        ...listadoProductosFixture(),
        capacidades: { escrituraDisponible: true },
      }),
    ).toThrow();
  });
  it('conserva el origen de despacho, sus reservas históricas y el pedido asociado', () => {
    const r = adaptarMovimientos({
      movimientos: [
        {
          id: ID_VARIANTE_PRUEBA,
          fecha: '2026-11-14T12:00:00Z',
          responsable: null,
          productoId: ID_PRODUCTO_PRUEBA,
          producto: 'Zapatilla',
          sku: 'NK-AF107-NG-40',
          color: 'Negro',
          talla: '40',
          tipo: 'salida',
          cantidad: -2,
          saldoAnterior: 5,
          saldo: 3,
          reservado: 1,
          habilitada: true,
          disponible: 2,
          motivo: 'Despacho',
          referencia: null,
          origen: 'envio-pedido',
          pedido: 'SOHO-ABC123',
        },
      ],
      paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
      capacidades: { escrituraDisponible: false },
    });
    expect(r.movimientos[0]).toMatchObject({
      origen: 'envio-pedido',
      pedido: 'SOHO-ABC123',
      saldo: 3,
      reservado: 1,
      disponible: 2,
    });
  });
});
