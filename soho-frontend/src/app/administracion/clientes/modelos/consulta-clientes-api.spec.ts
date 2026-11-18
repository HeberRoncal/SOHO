import {
  comprasCliente,
  detalleCliente,
  direccionesCliente,
  importeCliente,
  listadoClientes,
  paginaClientes,
} from './consulta-clientes-api';
import {
  detalleClienteFixture,
  direccionesClienteFixture,
  ID_CLIENTE,
  ID_OTRO,
  listadoClienteFixture,
  pedidosClienteFixture,
} from './consulta-clientes.fixtures';
describe('Contrato remoto de Clientes', () => {
  it('mantiene conteos globales, contacto de entrega y agregados del servidor', () => {
    expect(listadoClientes(listadoClienteFixture()).resumen.total).toBe(3);
    expect(detalleCliente(detalleClienteFixture(), ID_CLIENTE).resumen.pagosAprobados).toBe(
      '10.30',
    );
  });
  it('conserva el total aprobado decimal incluso por encima del rango seguro de Number', () => {
    const f = detalleClienteFixture();
    f.cliente.resumen.pagosAprobados = '9007199254740993123.05';
    expect(importeCliente(detalleCliente(f, ID_CLIENTE).resumen.pagosAprobados)).toBe(
      'S/\u00a09,007,199,254,740,993,123.05',
    );
  });
  it('admite la página máxima del API sin limitarla al contrato anterior de Pedidos', () => {
    expect(paginaClientes({ pagina: 100000, limite: 20, total: 0, paginas: 0 }).pagina).toBe(
      100000,
    );
  });
  it('conserva el pago aprobado de un cancelado y snapshots de Moche', () => {
    const p = comprasCliente(pedidosClienteFixture()).pedidos[0];
    expect(p).toMatchObject({
      total: '10.30',
      estadoPago: 'aprobado',
      estadoEntrega: 'cancelado',
      direccion: { distritoCodigo: 'moche' },
      articulos: [{ talla: '40.5', sku: 'NK-AF107-BL-40P5' }],
    });
    expect(direccionesCliente(direccionesClienteFixture()).direcciones[0].distritoNombre).toBe(
      'Moche',
    );
  });
  it('conserva ausencia de pago sin convertirla en pendiente', () => {
    const f = pedidosClienteFixture();
    (f.pedidos[0] as { estadoPago: unknown }).estadoPago = null;
    expect(comprasCliente(f).pedidos[0].estadoPago).toBeNull();
  });
  it('rechaza una ficha de otra identidad', () => {
    expect(() => detalleCliente(detalleClienteFixture(), ID_OTRO)).toThrow();
  });
  it('rechaza el correo usado como identificador invitado', () => {
    const f = listadoClienteFixture();
    f.clientes[0].identificador = 'invitado:lucia@example.test';
    expect(() => listadoClientes(f)).toThrow();
  });
  it.each(['totales', 'tipo', 'telefono', 'fecha', 'capacidad', 'pagina', 'duplicado'])(
    'rechaza listado incoherente: %s',
    (caso) => {
      const f = listadoClienteFixture();
      if (caso === 'totales') f.resumen.total = 99;
      if (caso === 'tipo') f.clientes[0].tipo = 'invitado';
      if (caso === 'telefono') f.clientes[0].telefonoEntrega.pedidoCodigo = 'SOHO-999999';
      if (caso === 'fecha') f.clientes[0].ultimoPedido.fecha = 'ayer';
      if (caso === 'capacidad') f.capacidades.escrituraDisponible = true;
      if (caso === 'pagina') f.paginacion.total = 2;
      if (caso === 'duplicado') {
        f.clientes.push(f.clientes[0]);
        f.paginacion.total = 2;
      }
      expect(() => listadoClientes(f)).toThrow();
    },
  );
  it.each(['cuenta', 'moneda', 'direcciones', 'primero', 'importe'])(
    'rechaza detalle incoherente: %s',
    (caso) => {
      const f = detalleClienteFixture();
      if (caso === 'cuenta') (f.cliente as { cuenta: unknown }).cuenta = null;
      if (caso === 'moneda') f.cliente.resumen.moneda = 'USD';
      if (caso === 'direcciones') f.cliente.resumen.direccionesTotal = 2;
      if (caso === 'primero') f.cliente.resumen.primerPedido.fecha = '2027-11-01T15:00:00.000Z';
      if (caso === 'importe') f.cliente.resumen.pagosAprobados = '10.3';
      expect(() => detalleCliente(f, ID_CLIENTE)).toThrow();
    },
  );
  it.each(['pago', 'entrega', 'imagen', 'talla', 'cantidad', 'importe'])(
    'rechaza historial mal formado: %s',
    (caso) => {
      const f = pedidosClienteFixture(),
        p = f.pedidos[0],
        a = p.articulos[0];
      if (caso === 'pago') p.estadoPago = 'PAGADO';
      if (caso === 'entrega') p.estadoEntrega = 'ERROR';
      if (caso === 'imagen') a.imagen = 'javascript:alert(1)';
      if (caso === 'talla') a.talla = '99';
      if (caso === 'cantidad') a.cantidad = 0;
      if (caso === 'importe') p.total = 'NaN';
      expect(() => comprasCliente(f)).toThrow();
    },
  );
  it('rechaza direcciones duplicadas sin perder diferencias históricas de mayúsculas', () => {
    const f = direccionesClienteFixture();
    f.direcciones.push({ ...f.direcciones[0] });
    f.paginacion.total = 2;
    expect(() => direccionesCliente(f)).toThrow();
    f.direcciones[1].direccion = 'av. histórica 123';
    expect(direccionesCliente(f).direcciones).toHaveLength(2);
  });
});
