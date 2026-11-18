export class CreatePedidoDto {
  claveCreacion: string;
  contacto: { nombres: string; apellidos: string; correo: string };
  entrega: {
    destinatario: string;
    celular: string;
    distrito: string;
    direccion: string;
    referencia: string;
  };
  facturacion?: {
    tipo: 'BOLETA' | 'FACTURA';
    tipoDocumento: 'DNI' | 'CE' | 'PAS' | 'RUC';
    numeroDocumento: string;
    razonSocial?: string;
    domicilioFiscal?: string;
  };
  articulos: Array<{
    sku: string;
    cantidad: number;
    precioUnitarioEsperado: string;
  }>;
  cotizacion: {
    costoEnvio: string;
    plazoEntrega: string | null;
    total: string;
  };
  metodoPago: 'YAPE' | 'PLIN';
  comprobante: {
    nombreArchivo: string;
    tipoArchivo: 'image/png' | 'image/jpeg' | 'image/webp';
    contenidoBase64: string;
    numeroOperacion?: string;
  };
}
