import { InstruccionCompra, PreparacionCompra, RecepcionCompra } from './contrato-checkout';
export const idPruebaCompra = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const preparacionPruebaCompra = (): PreparacionCompra => ({
  contacto: { nombres: 'Ana', apellidos: 'Prueba', correo: 'ana@checkout.test' },
  entrega: {
    destinatario: 'Ana Prueba',
    celular: '987654321',
    distrito: 'la-esperanza',
    direccion: 'Av. Prueba 123',
    referencia: '',
  },
  articulos: [{ sku: 'TEST-BL-40', cantidad: 2, precioUnitarioEsperado: '99.99' }],
  cotizacion: { costoEnvio: '0.00', plazoEntrega: null, total: '199.98' },
});
export function instruccionPruebaCompra(clave = idPruebaCompra(1)): InstruccionCompra {
  return {
    versionContrato: 1,
    instruccionId: idPruebaCompra(2),
    claveCreacionPedido: clave,
    metodo: 'YAPE',
    versionConfiguracion: 1,
    emitidaEn: '2026-11-16T10:00:00.000Z',
    moneda: 'PEN',
    importeReferencia: '199.98',
    preparacion: preparacionPruebaCompra(),
    verificacion: {
      distritoNombre: 'La Esperanza',
      subtotal: '199.98',
      costoEnvio: '0.00',
      plazoEntrega: null,
      total: '199.98',
      articulos: [
        {
          sku: 'TEST-BL-40',
          nombreProducto: 'Zapatilla de prueba',
          color: 'Blanco',
          talla: '40',
          cantidad: 2,
          precioUnitario: '99.99',
          importe: '199.98',
        },
      ],
    },
    destino: { celular: '987654321', titular: 'SOHO prueba', qr: null },
    accesoExpiraEn: '2026-12-16T10:00:00.000Z',
  };
}
export function recepcionPruebaCompra(
  i = instruccionPruebaCompra(),
  clave = idPruebaCompra(3),
): RecepcionCompra {
  return {
    versionContrato: 1,
    id: idPruebaCompra(4),
    referencia: 'REC-1234567890ABCDEF',
    claveSolicitud: clave,
    claveCreacionPedido: i.claveCreacionPedido,
    estado: 'RECIBIDA',
    version: 2,
    creadoEn: '2026-11-16T10:01:00.000Z',
    recibidaEn: '2026-11-16T10:01:00.000Z',
    accesoExpiraEn: '2026-12-16T10:01:00.000Z',
    instruccion: i,
    comprobante: {
      id: idPruebaCompra(5),
      version: 1,
      nombreArchivo: 'recibo.png',
      formato: 'image/png',
      tamanoBytes: 6,
      numeroOperacion: '001234',
      estadoArchivo: 'DISPONIBLE',
      confirmadoEn: '2026-11-16T10:01:00.000Z',
    },
    motivos: [],
    pedido: null,
  };
}
export const imagenPruebaCompra = () => ({
  nombreArchivo: 'recibo.png',
  tipoArchivo: 'image/png',
  tamanoBytes: 6,
  vistaPrevia: 'data:image/png;base64,aW1hZ2Vu',
  numeroOperacion: '001234',
});
