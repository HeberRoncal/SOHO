import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type InstruccionPago } from '../../generated/prisma/client.js';
import { ConfiguracionCheckoutPagos } from '../../pedidos/preparacion/configuracion-checkout-pagos.js';
import { DatosInstruccionPago } from './datos-instruccion-pago.js';
import { RespuestaInstruccionPago } from './respuesta-instruccion-pago.js';

const duracion = 30 * 86400000;
function entrada() {
  return {
    claveSolicitud: randomUUID() as string,
    claveCreacionPedido: randomUUID(),
    metodo: 'PLIN',
    versionConfiguracionEsperada: 7,
    preparacion: {
      contacto: {
        nombres: 'Ana María',
        apellidos: 'De la Cruz',
        correo: 'ana@prueba.test',
      },
      entrega: {
        destinatario: 'Ana María',
        celular: '987654321',
        distrito: 'la-esperanza',
        direccion: 'Calle de prueba 123',
        referencia: '',
      },
      articulos: [
        {
          sku: 'NK-AF107-BL-40P5',
          cantidad: 2,
          precioUnitarioEsperado: '99.99',
        },
      ],
      cotizacion: { costoEnvio: '0.00', plazoEntrega: null, total: '199.98' },
    },
  };
}
function guardada(invitado = false): InstruccionPago {
  const d = DatosInstruccionPago.emision(entrada()),
    id = randomUUID(),
    emitidaEn = new Date('2026-11-15T10:00:00.123Z');
  return {
    id,
    metodoConfiguradoId: randomUUID(),
    metodo: 'PLIN',
    claveSolicitud: d.claveSolicitud,
    solicitudHash: 'a'.repeat(64),
    preparacionHash: DatosInstruccionPago.huellaPreparacion(d.preparacion),
    claveCreacionPedido: d.claveCreacionPedido,
    usuarioId: invitado ? null : randomUUID(),
    accesoInvitadoHash: invitado ? 'b'.repeat(64) : null,
    moneda: 'PEN',
    importeReferencia: new Prisma.Decimal('199.98'),
    emitidaEn,
    pedidoId: null,
    respuesta: {
      versionContrato: 1,
      instruccionId: id,
      claveCreacionPedido: d.claveCreacionPedido,
      metodo: 'PLIN',
      versionConfiguracion: 7,
      emitidaEn: emitidaEn.toISOString(),
      moneda: 'PEN',
      importeReferencia: '199.98',
      preparacion: JSON.parse(
        JSON.stringify(d.preparacion),
      ) as Prisma.JsonValue,
      verificacion: {
        distritoNombre: 'La Esperanza',
        subtotal: '199.98',
        costoEnvio: '0.00',
        plazoEntrega: null,
        total: '199.98',
        articulos: [
          {
            varianteId: randomUUID(),
            productoId: randomUUID(),
            sku: 'NK-AF107-BL-40P5',
            nombreProducto: 'Air Force 1',
            color: 'Blanco',
            sistemaTalla: 'EU',
            talla: '40.5',
            cantidad: 2,
            precioUnitario: '99.99',
            importe: '199.98',
          },
        ],
      },
      destino: {
        celular: '987654321',
        titular: 'Tienda de prueba',
        qr: {
          id: randomUUID(),
          url: 'https://res.cloudinary.com/prueba/image/upload/v1/qr.png',
          formato: 'png',
          ancho: 128,
          alto: 128,
        },
      },
      accesoExpiraEn: invitado
        ? new Date(emitidaEn.getTime() + duracion).toISOString()
        : null,
    },
  };
}

describe('Contrato de instrucciones de pago', () => {
  it.each([undefined, '', 'false', '1', 'TRUE', ' true '])(
    'no activa cobros con %s',
    (v) => {
      expect(
        new ConfiguracionCheckoutPagos({ PAGOS_CHECKOUT_ACTIVO: v }).habilitada,
      ).toBe(false);
    },
  );
  it('habilita únicamente la opción explícita true', () => {
    expect(
      new ConfiguracionCheckoutPagos({ PAGOS_CHECKOUT_ACTIVO: 'true' })
        .habilitada,
    ).toBe(true);
  });
  it('acepta preparación sin facturación y conserva importes como texto', () => {
    const p = DatosInstruccionPago.emision(entrada()).preparacion;
    expect(p.facturacion).toBeUndefined();
    expect(p.cotizacion).toEqual({
      costoEnvio: '0.00',
      plazoEntrega: null,
      total: '199.98',
    });
  });
  it('iguala NFC, orden de claves/líneas y UUID sin modificar la entrada', () => {
    const a = entrada();
    a.preparacion.articulos.push({
      sku: 'AA-PRUEBA-BL-41',
      cantidad: 1,
      precioUnitarioEsperado: '1.00',
    });
    const b = structuredClone(a);
    b.claveSolicitud = a.claveSolicitud.toUpperCase();
    b.preparacion.contacto.nombres = 'Ana Mari\u0301a';
    b.preparacion.articulos.reverse();
    b.preparacion.entrega = Object.fromEntries(
      Object.entries(b.preparacion.entrega).reverse(),
    ) as typeof b.preparacion.entrega;
    expect(DatosInstruccionPago.emision(b)).toEqual(
      DatosInstruccionPago.emision(a),
    );
    expect(b.preparacion.contacto.nombres).toBe('Ana Mari\u0301a');
    expect(a.preparacion.articulos[0].sku).toBe('NK-AF107-BL-40P5');
  });
  it('distingue cambios del contacto, dirección y cantidades en la huella', () => {
    const a = entrada(),
      original = DatosInstruccionPago.huellaPreparacion(a.preparacion);
    for (const cambiar of [
      (b: ReturnType<typeof entrada>) => {
        b.preparacion.contacto.correo = 'otro@prueba.test';
      },
      (b: ReturnType<typeof entrada>) => {
        b.preparacion.entrega.direccion = 'Otra calle 123';
      },
      (b: ReturnType<typeof entrada>) => {
        b.preparacion.articulos[0].cantidad = 1;
      },
    ]) {
      const b = structuredClone(a);
      cambiar(b);
      expect(DatosInstruccionPago.huellaPreparacion(b.preparacion)).not.toBe(
        original,
      );
    }
  });
  it('limita profundidad antes de recorrer una estructura no admitida', () => {
    let cuerpo: unknown = 'texto';
    for (let n = 0; n < 12; n++) cuerpo = { extra: cuerpo };
    expect(() => DatosInstruccionPago.preparacion(cuerpo)).toThrow(
      BadRequestException,
    );
  });
  it.each([0, -1, 1.5, '1', 4294967296, NaN, Infinity])(
    'rechaza versión %s',
    (v) => {
      expect(() =>
        DatosInstruccionPago.emision({
          ...entrada(),
          versionConfiguracionEsperada: v,
        }),
      ).toThrow(BadRequestException);
    },
  );
});

describe('Lectura del snapshot histórico de instrucciones', () => {
  it.each([false, true])(
    'recupera la respuesta completa de cuenta/invitado (%s)',
    (invitado) => {
      const i = guardada(invitado);
      expect(RespuestaInstruccionPago.leer(i, duracion)).toEqual(i.respuesta);
    },
  );
  it('tolera el orden de claves de MySQL sin alterar el contrato', () => {
    const i = guardada();
    i.respuesta = Object.fromEntries(
      Object.entries(i.respuesta as object).reverse(),
    );
    expect(RespuestaInstruccionPago.leer(i, duracion)).toEqual(i.respuesta);
  });
  it.each([
    [
      'beneficiario vacío',
      (q: any) => {
        q.destino.titular = ' ';
      },
    ],
    [
      'propiedades adicionales',
      (q: any) => {
        q.secreto = 'no exponer';
      },
    ],
    [
      'versión incompatible',
      (q: any) => {
        q.versionContrato = 2;
      },
    ],
    [
      'método distinto',
      (q: any) => {
        q.metodo = 'YAPE';
      },
    ],
    [
      'importe numérico',
      (q: any) => {
        q.importeReferencia = 199.98;
      },
    ],
    [
      'otra preparación',
      (q: any) => {
        q.preparacion.contacto.nombres = 'Otra persona';
      },
    ],
    [
      'caducidad inventada',
      (q: any) => {
        q.accesoExpiraEn = new Date().toISOString();
      },
    ],
    [
      'sin verificación',
      (q: any) => {
        delete q.verificacion;
      },
    ],
    [
      'subtotal distinto',
      (q: any) => {
        q.verificacion.subtotal = '199.99';
      },
    ],
    [
      'cantidad distinta',
      (q: any) => {
        q.verificacion.articulos[0].cantidad = 1;
      },
    ],
    [
      'precio distinto',
      (q: any) => {
        q.verificacion.articulos[0].precioUnitario = '99.98';
      },
    ],
    [
      'otro SKU',
      (q: any) => {
        q.verificacion.articulos[0].sku = 'OTRO';
      },
    ],
    [
      'QR ajeno',
      (q: any) => {
        q.destino.qr.url = 'https://otro.test/qr.png';
      },
    ],
    [
      'QR HTTP',
      (q: any) => {
        q.destino.qr.url = 'http://res.cloudinary.com/prueba/qr.png';
      },
    ],
    [
      'QR con credenciales',
      (q: any) => {
        q.destino.qr.url = 'https://clave@res.cloudinary.com/prueba/qr.png';
      },
    ],
    [
      'QR con query',
      (q: any) => {
        q.destino.qr.url += '?destino=otro';
      },
    ],
    [
      'QR demasiado grande',
      (q: any) => {
        q.destino.qr.ancho = 4097;
      },
    ],
  ])('bloquea un registro dañado: %s', (_caso, cambiar) => {
    const i = guardada();
    cambiar(i.respuesta);
    expect(() => RespuestaInstruccionPago.leer(i, duracion)).toThrow(
      ServiceUnavailableException,
    );
  });
  it('no incorpora claves de sesión ni hashes de acceso en el JSON entregado', () => {
    const i = guardada(true),
      respuesta = JSON.stringify(RespuestaInstruccionPago.leer(i, duracion));
    expect(respuesta).not.toContain(i.accesoInvitadoHash);
    expect(respuesta).not.toContain(i.solicitudHash);
  });
});
