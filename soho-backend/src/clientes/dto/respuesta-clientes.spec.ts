import { Prisma } from '../../generated/prisma/client.js';
import {
  filaCliente,
  pedidoCliente,
  telefonoEntrega,
} from './respuesta-clientes.js';
describe('Proyección mínima de Clientes', () => {
  it('preserva ausencia de teléfono y fechas para cuentas sin compras', () => {
    expect(
      filaCliente({
        identificador: 'cuenta',
        tipo: 'registrado',
        nombre: 'Ana',
        correo: 'a@test.example',
        celular: null,
        destinatario: null,
        pedido_codigo: null,
        fecha: null,
        pedidos_total: 0n,
      }),
    ).toMatchObject({
      telefonoEntrega: null,
      ultimoPedido: null,
      pedidosTotal: 0,
    });
    expect(telefonoEntrega(null)).toBeNull();
  });
  it('proyecta snapshots y decimales sin exponer los datos de autenticación o facturación', () => {
    const pedido = {
      codigo: 'SOHO-1',
      creadoEn: new Date('2026-11-01T14:00:00Z'),
      nombres: 'Nombre histórico',
      apellidos: 'Original',
      correo: 'historico@prueba.test',
      celular: '987654321',
      destinatario: 'Otra persona',
      direccion: 'Av. Histórica',
      distritoCodigo: 'moche',
      distritoNombre: 'Moche histórico',
      provincia: 'Trujillo',
      departamento: 'La Libertad',
      referencia: '',
      moneda: 'PEN',
      total: new Prisma.Decimal('0.30'),
      estadoEntrega: 'CANCELADO',
      pago: { estado: 'APROBADO', comprobantes: ['privado'] },
      accesoInvitadoHash: 'secreto',
      facturacion: { numeroDocumento: '12345678' },
      articulos: [
        {
          sku: 'SKU-ANTIGUO',
          nombreProducto: 'Producto histórico',
          imagen: '/imagen-antigua.png',
          color: 'Blanco',
          talla: new Prisma.Decimal('40.5'),
          cantidad: 1,
        },
      ],
    };
    const r = pedidoCliente(
      pedido as unknown as Parameters<typeof pedidoCliente>[0],
    );
    expect(r).toMatchObject({
      total: '0.30',
      estadoPago: 'APROBADO',
      estadoEntrega: 'CANCELADO',
      contacto: { nombres: 'Nombre histórico' },
      articulos: [
        { nombre: 'Producto histórico', talla: '40.5', sku: 'SKU-ANTIGUO' },
      ],
    });
    expect(JSON.stringify(r)).not.toMatch(
      /secreto|12345678|comprobantes|privado/,
    );
    expect(
      pedidoCliente({ ...pedido, pago: null } as unknown as Parameters<
        typeof pedidoCliente
      >[0]).estadoPago,
    ).toBeNull();
  });
});
