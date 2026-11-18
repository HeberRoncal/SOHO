import {
  adaptarInstruccionCompra,
  adaptarMetodosCompra,
  adaptarOperacionCompra,
  adaptarRecepcionCompra,
} from './contrato-checkout';
import {
  idPruebaCompra,
  instruccionPruebaCompra,
  recepcionPruebaCompra,
} from './checkout.fixtures';
describe('Contratos privados del checkout', () => {
  it('el catálogo público contiene solamente métodos y disponibilidad', () => {
    expect(adaptarMetodosCompra({ version: 0, disponible: false, metodos: [] })).toEqual({
      version: 0,
      disponible: false,
      metodos: [],
    });
    expect(() =>
      adaptarMetodosCompra({
        version: 1,
        disponible: false,
        metodos: [{ metodo: 'YAPE', nombre: 'Yape' }],
      }),
    ).toThrow();
  });
  it('rechaza métodos duplicados y no reconocidos', () => {
    for (const metodos of [
      [
        { metodo: 'YAPE', nombre: 'Yape' },
        { metodo: 'YAPE', nombre: 'Yape' },
      ],
      [{ metodo: 'OTRO', nombre: 'Otro' }],
    ])
      expect(() => adaptarMetodosCompra({ version: 1, disponible: true, metodos })).toThrow();
  });
  it('reconstruye destino, líneas y gratuidad históricos', () => {
    const i = instruccionPruebaCompra();
    expect(adaptarInstruccionCompra(i)).toEqual(i);
  });
  it.each(['importeReferencia', 'moneda', 'versionContrato'])(
    'rechaza un cambio incoherente de %s',
    (campo) => {
      expect(() =>
        adaptarInstruccionCompra({ ...instruccionPruebaCompra(), [campo]: '0.00' }),
      ).toThrow();
    },
  );
  it('rechaza precios, cantidades o total inconsistentes', () => {
    const i = instruccionPruebaCompra();
    i.verificacion.articulos[0].cantidad = 3;
    expect(() => adaptarInstruccionCompra(i)).toThrow();
    i.verificacion.articulos[0].cantidad = 2;
    i.preparacion.articulos[0].sku = 'OTRO';
    expect(() => adaptarInstruccionCompra(i)).toThrow();
  });
  it.each([
    'http://res.cloudinary.com/a',
    'https://evil.test/a',
    'https://res.cloudinary.com.evil.test/a',
    'https://user@res.cloudinary.com/a',
  ])('rechaza QR fuera del destino permitido: %s', (url) => {
    const i = instruccionPruebaCompra();
    i.destino.qr = { id: idPruebaCompra(7), url, formato: 'png', ancho: 256, alto: 256 };
    expect(() => adaptarInstruccionCompra(i)).toThrow();
  });
  it('acepta QR seguro y no copia propiedades internas', () => {
    const i = instruccionPruebaCompra();
    i.destino.qr = {
      id: idPruebaCompra(7),
      url: 'https://res.cloudinary.com/test/image/upload/qr.png',
      formato: 'png',
      ancho: 256,
      alto: 256,
    };
    expect(adaptarInstruccionCompra(i).destino.qr).toEqual(i.destino.qr);
    const r = recepcionPruebaCompra(i);
    expect(adaptarRecepcionCompra({ recepcion: r, secreto: 'oculto' })).toEqual({ recepcion: r });
  });
  it('rechaza recibos de otro checkout y pedidos incoherentes', () => {
    const r = recepcionPruebaCompra();
    r.claveCreacionPedido = idPruebaCompra(8);
    expect(() => adaptarRecepcionCompra({ recepcion: r })).toThrow();
    r.claveCreacionPedido = r.instruccion.claveCreacionPedido;
    r.estado = 'PEDIDO_CREADO';
    expect(() => adaptarRecepcionCompra({ recepcion: r })).toThrow();
  });
  it('conserva solo mensaje público y versión de corrección', () => {
    const r = recepcionPruebaCompra(),
      c = {
        solicitudId: idPruebaCompra(9),
        mensaje: 'Imagen más clara',
        pendiente: true,
        versionEsperada: 3,
      };
    expect(
      adaptarRecepcionCompra({ recepcion: r, correccion: { ...c, motivoInterno: 'privado' } })
        .correccion,
    ).toEqual(c);
  });
  it('un resultado pendiente no se interpreta como confirmación', () => {
    expect(() =>
      adaptarOperacionCompra({
        recepcion: recepcionPruebaCompra(),
        operacion: { claveSolicitud: idPruebaCompra(9), estado: 'PENDIENTE' },
        resultado: 'PEDIDO_CREADO',
      }),
    ).toThrow();
  });
});
