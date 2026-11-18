export function pedidoApi(codigo = 'SOHO-TEST0001') {
  return {
    codigo,
    fecha: '2026-11-14T12:00:00.000Z',
    version: 1,
    moneda: 'PEN',
    contacto: { nombres: 'Ana', apellidos: 'Prueba', correo: 'compra@pedidos.test' },
    entrega: {
      destinatario: 'Otra Persona',
      celular: '987654321',
      distrito: 'la-esperanza',
      nombreDistrito: 'La Esperanza',
      direccion: 'Av. Prueba 123',
      referencia: '',
      plazo: null,
    },
    subtotal: '199.98',
    descuento: '0.00',
    costoEnvio: '0.00',
    total: '199.98',
    estadoEntrega: 'PENDIENTE',
    facturacion: {
      tipo: 'BOLETA',
      tipoDocumento: 'DNI',
      numeroDocumento: '00123456',
      razonSocial: null,
      domicilioFiscal: null,
    },
    articulos: [
      {
        sku: 'TEST-BL-40',
        nombreProducto: 'Zapatilla de prueba',
        color: 'Blanco',
        talla: '40',
        imagen: '/imagenes/prueba.webp',
        cantidad: 2,
        precioUnitario: '99.99',
        importeNeto: '199.98',
      },
    ],
    pago: {
      version: 1,
      metodo: 'YAPE',
      estado: 'PENDIENTE',
      comprobantes: [
        {
          id: '32093077-3e17-4197-b8ba-1aa940f6beaa',
          version: 1,
          nombreArchivo: 'recibo.png',
          tipoArchivo: 'image/png',
          tamanoBytes: 123,
          numeroOperacion: '001234',
          mensaje: null,
          ruta: '/ruta-no-confiable-ignorada',
        },
      ],
    },
  };
}
