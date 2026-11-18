import { BadRequestException } from '@nestjs/common';
import { datosPedido } from '../../../test/pedidos-fixtures.js';
import { DatosPedidoPipe } from './datos-pedido.pipe.js';

describe('Contrato estricto de creación de pedidos', () => {
  const pipe = new DatosPedidoPipe();
  it('normaliza datos y conserva ceros iniciales e importes exactos', async () => {
    const d = await datosPedido();
    d.contacto.nombres = '  Ana María  ';
    d.contacto.correo = 'CONTACTO@PEDIDOS.TEST';
    expect(pipe.transform(d)).toMatchObject({
      contacto: { nombres: 'Ana María', correo: 'contacto@pedidos.test' },
      facturacion: { numeroDocumento: '00123456' },
      comprobante: { numeroOperacion: '001234' },
    });
  });
  it('admite factura y boleta con documentos alfanuméricos', async () => {
    const d = await datosPedido();
    d.facturacion = {
      tipo: 'FACTURA',
      tipoDocumento: 'RUC',
      numeroDocumento: '20123456789',
      razonSocial: 'Empresa de prueba',
      domicilioFiscal: 'Av. Fiscal 123',
    };
    expect(pipe.transform(d).facturacion).toEqual(d.facturacion);
    d.facturacion = {
      tipo: 'BOLETA',
      tipoDocumento: 'PAS',
      numeroDocumento: 'AB012345',
    };
    expect(pipe.transform(d).facturacion?.numeroDocumento).toBe('AB012345');
  });
  it('usa el nombre del contacto si no se indica destinatario y conserva referencias multilínea', async () => {
    const d = await datosPedido();
    const entrada = JSON.parse(JSON.stringify(d)) as Record<string, any>;
    delete entrada.entrega.destinatario;
    entrada.entrega.referencia = 'Puerta azul\nSegundo piso';
    expect(pipe.transform(entrada).entrega).toMatchObject({
      destinatario: 'Ana María De la Cruz',
      referencia: 'Puerta azul\nSegundo piso',
    });
    entrada.contacto.nombres = 'A'.repeat(80);
    entrada.contacto.apellidos = 'B'.repeat(80);
    expect(() => pipe.transform(entrada)).toThrow(BadRequestException);
  });
  it.each([
    [
      'propietario elegido por cliente',
      (d: Record<string, any>) => {
        d.usuarioId = 'otro';
      },
    ],
    [
      'estado elegido por cliente',
      (d: Record<string, any>) => {
        d.estadoEntrega = 'CONFIRMADO';
      },
    ],
    [
      'cupón de demostración',
      (d: Record<string, any>) => {
        d.cupon = 'DEMO10';
      },
    ],
    [
      'clave inválida',
      (d: Record<string, any>) => {
        d.claveCreacion = 'invalida';
      },
    ],
    [
      'contacto adicional',
      (d: Record<string, any>) => {
        d.contacto.rol = 'ADMIN';
      },
    ],
    [
      'celular inválido',
      (d: Record<string, any>) => {
        d.entrega.celular = '887654321';
      },
    ],
    [
      'distrito no canónico',
      (d: Record<string, any>) => {
        d.entrega.distrito = 'La Esperanza';
      },
    ],
    [
      'control invisible',
      (d: Record<string, any>) => {
        d.entrega.direccion = 'Calle\u200b 123';
      },
    ],
    [
      'carrito vacío',
      (d: Record<string, any>) => {
        d.articulos = [];
      },
    ],
    [
      'cantidad fraccionaria',
      (d: Record<string, any>) => {
        d.articulos[0].cantidad = 1.5;
      },
    ],
    [
      'cantidad como texto',
      (d: Record<string, any>) => {
        d.articulos[0].cantidad = '2';
      },
    ],
    [
      'cien pares como máximo',
      (d: Record<string, any>) => {
        d.articulos[0].cantidad = 101;
      },
    ],
    [
      'SKU repetido',
      (d: Record<string, any>) => {
        d.articulos.push({ ...d.articulos[0] });
      },
    ],
    [
      'SKU repetido con otra caja',
      (d: Record<string, any>) => {
        d.articulos.push({
          ...d.articulos[0],
          sku: d.articulos[0].sku.toLowerCase(),
        });
      },
    ],
    [
      'precio numérico',
      (d: Record<string, any>) => {
        d.articulos[0].precioUnitarioEsperado = 99.99;
      },
    ],
    [
      'importe exponencial',
      (d: Record<string, any>) => {
        d.cotizacion.total = '1e2';
      },
    ],
    [
      'importe negativo',
      (d: Record<string, any>) => {
        d.cotizacion.costoEnvio = '-1.00';
      },
    ],
    [
      'importe con demasiados decimales',
      (d: Record<string, any>) => {
        d.cotizacion.total = '199.980';
      },
    ],
    [
      'plazo ausente',
      (d: Record<string, any>) => {
        delete d.cotizacion.plazoEntrega;
      },
    ],
    [
      'método desconocido',
      (d: Record<string, any>) => {
        d.metodoPago = 'TARJETA';
      },
    ],
    [
      'archivo PDF',
      (d: Record<string, any>) => {
        d.comprobante.tipoArchivo = 'application/pdf';
      },
    ],
    [
      'prefijo data',
      (d: Record<string, any>) => {
        d.comprobante.contenidoBase64 =
          'data:image/png;base64,' + d.comprobante.contenidoBase64;
      },
    ],
    [
      'ruta en nombre',
      (d: Record<string, any>) => {
        d.comprobante.nombreArchivo = '../recibo.png';
      },
    ],
    [
      'operación no numérica',
      (d: Record<string, any>) => {
        d.comprobante.numeroOperacion = 'ab123';
      },
    ],
    [
      'factura incompleta',
      (d: Record<string, any>) => {
        d.facturacion = {
          tipo: 'FACTURA',
          tipoDocumento: 'RUC',
          numeroDocumento: '20123456789',
        };
      },
    ],
    [
      'boleta con datos fiscales ocultos',
      (d: Record<string, any>) => {
        d.facturacion.razonSocial = 'Empresa';
      },
    ],
  ])('rechaza %s', async (_nombre, cambiar) => {
    const d = await datosPedido();
    cambiar(d);
    expect(() => pipe.transform(d)).toThrow(BadRequestException);
  });
  it('limita el total de pares aunque estén repartidos en distintas líneas', async () => {
    const d = await datosPedido();
    d.articulos = [
      { sku: 'UNO', cantidad: 60, precioUnitarioEsperado: '1.00' },
      { sku: 'DOS', cantidad: 60, precioUnitarioEsperado: '1.00' },
    ];
    expect(() => pipe.transform(d)).toThrow(BadRequestException);
  });
});
