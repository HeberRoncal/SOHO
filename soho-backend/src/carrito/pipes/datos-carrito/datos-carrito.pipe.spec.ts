import { DatosCarritoPipe } from './datos-carrito.pipe.js';
const valido = () => ({
  clave: '11111111-1111-4111-8111-111111111111',
  version: 0,
  tipo: 'GUARDAR',
  articulos: [{ sku: 'NK-AF107-BL-40', cantidad: 2 }],
});
describe('Contrato privado del carrito', () => {
  const pipe = new DatosCarritoPipe();
  it('acepta guardar, vaciar y combinar', () => {
    expect(pipe.transform(valido()).articulos).toHaveLength(1);
    expect(pipe.transform({ ...valido(), articulos: [] }).articulos).toEqual(
      [],
    );
    expect(pipe.transform({ ...valido(), tipo: 'COMBINAR' }).tipo).toBe(
      'COMBINAR',
    );
  });
  it.each([
    null,
    [],
    {},
    { ...valido(), usuarioId: 'otra-cuenta' },
    { ...valido(), version: -1 },
    { ...valido(), clave: 'invalida' },
    { ...valido(), tipo: 'BORRAR_TODO' },
    ...[0, -1, 100, 1.2, '2'].map((cantidad) => ({
      ...valido(),
      articulos: [{ sku: 'SKU', cantidad }],
    })),
    { ...valido(), articulos: [valido().articulos[0], valido().articulos[0]] },
    { ...valido(), articulos: [{ sku: 'SKU', cantidad: 1, precio: 1 }] },
  ])('rechaza datos ajenos o fuera de límites: %j', (datos) => {
    expect(() => pipe.transform(datos)).toThrow();
  });
});
