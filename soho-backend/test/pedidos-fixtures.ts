import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Prisma } from '../src/generated/prisma/client.js';
import type { CreatePedidoDto } from '../src/pedidos/dto/create-pedido.dto.js';

export async function datosPedido(
  sku = 'PED-API-BL-40',
  precio = '99.99',
  cantidad = 2,
): Promise<CreatePedidoDto> {
  const imagen = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  return {
    claveCreacion: randomUUID(),
    contacto: {
      nombres: 'Ana María',
      apellidos: 'De la Cruz',
      correo: 'contacto@pedidos.test',
    },
    entrega: {
      destinatario: 'Otra Persona',
      celular: '987654321',
      distrito: 'la-esperanza',
      direccion: 'Av. Prueba 123',
      referencia: '',
    },
    facturacion: {
      tipo: 'BOLETA',
      tipoDocumento: 'DNI',
      numeroDocumento: '00123456',
    },
    articulos: [{ sku, cantidad, precioUnitarioEsperado: precio }],
    cotizacion: {
      costoEnvio: '0.00',
      plazoEntrega: null,
      total: new Prisma.Decimal(precio).mul(cantidad).toFixed(2),
    },
    metodoPago: 'YAPE',
    comprobante: {
      nombreArchivo: 'recibo.png',
      tipoArchivo: 'image/png',
      contenidoBase64: imagen.toString('base64'),
      numeroOperacion: '001234',
    },
  };
}
