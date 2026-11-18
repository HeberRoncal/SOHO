export const ID_CLIENTE = '11111111-1111-4111-8111-111111111111';
export const ID_OTRO = '22222222-2222-4222-8222-222222222222';
export const FECHA_CLIENTE = '2026-11-01T15:00:00.000Z';
export function filaClienteFixture() {
  return {
    identificador: ID_CLIENTE,
    tipo: 'registrado',
    nombre: 'Lucía Fernández',
    correo: 'lucia@example.test',
    telefonoEntrega: {
      celular: '987654321',
      destinatario: 'Otra persona',
      pedidoCodigo: 'SOHO-000123',
      fecha: FECHA_CLIENTE,
    },
    pedidosTotal: 1,
    ultimoPedido: { codigo: 'SOHO-000123', fecha: FECHA_CLIENTE },
  };
}
export function listadoClienteFixture() {
  return {
    clientes: [filaClienteFixture()],
    paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
    resumen: { total: 3, registrados: 1, invitados: 2, unidadInvitados: 'pedido' },
    capacidades: { escrituraDisponible: false },
  };
}
export function detalleClienteFixture() {
  const c = filaClienteFixture();
  return {
    cliente: {
      ...c,
      cuenta: { creadaEn: FECHA_CLIENTE, activa: true, correoVerificado: false },
      capacidades: { escrituraDisponible: false },
      resumen: {
        pedidosTotal: 1,
        direccionesTotal: 1,
        primerPedido: c.ultimoPedido,
        ultimoPedido: c.ultimoPedido,
        pagosAprobados: '10.30',
        moneda: 'PEN',
      },
    },
  };
}
export function direccionClienteFixture() {
  return {
    direccion: 'Av. Histórica 123',
    distritoCodigo: 'moche',
    distritoNombre: 'Moche',
    provincia: 'Trujillo',
    departamento: 'La Libertad',
    referencia: '',
    pedidosTotal: 1,
    ultimaUtilizacionEn: FECHA_CLIENTE,
    pedidoReferencia: 'SOHO-000123',
  };
}
export function pedidosClienteFixture() {
  const d = direccionClienteFixture();
  return {
    pedidos: [
      {
        codigo: 'SOHO-000123',
        fecha: FECHA_CLIENTE,
        contacto: { nombres: 'Contacto', apellidos: 'Histórico', correo: 'historia@example.test' },
        direccion: { ...d, destinatario: 'Otra persona', celular: '987654321' },
        estadoPago: 'APROBADO',
        estadoEntrega: 'CANCELADO',
        moneda: 'PEN',
        total: '10.30',
        articulos: [
          {
            sku: 'NK-AF107-BL-40P5',
            nombre: 'Zapatilla histórica',
            imagen: '/imagenes/productos/af1.png',
            color: 'Blanco',
            talla: '40.5',
            cantidad: 1,
          },
        ],
      },
    ],
    paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
  };
}
export function direccionesClienteFixture() {
  return {
    direcciones: [direccionClienteFixture()],
    paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
  };
}
