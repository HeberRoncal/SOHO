import { IdentidadProducto } from './identidad-producto.js';
describe('Identidad de productos nuevos', () => {
  it.each([
    ['40', '40'],
    ['40.0', '40'],
    ['40.5', '40P5'],
    ['35.5', '35P5'],
    ['48', '48'],
  ])('genera la talla %s como %s', (talla, sufijo) => {
    expect(IdentidadProducto.sku('NK', 'AF107', 'BL', talla)).toBe(
      'NK-AF107-BL-' + sufijo,
    );
  });
  it('rechaza identidades ambiguas y no trunca códigos', () => {
    expect(() => IdentidadProducto.sku('NK', 'AF-107', 'BL', '40')).toThrow();
    expect(() => IdentidadProducto.sku('NK', 'AF107', 'B', '40')).toThrow();
  });
  it('normaliza el slug sin usarlo como identidad del SKU', () => {
    expect(IdentidadProducto.slug('  Edición Ñandú / Blanco ')).toBe(
      'edicion-nandu-blanco',
    );
  });
  it('reconoce claves reordenadas y distingue contenido cambiado', () => {
    expect(IdentidadProducto.huella({ a: 1, b: { y: 2, x: 3 } })).toBe(
      IdentidadProducto.huella({ b: { x: 3, y: 2 }, a: 1 }),
    );
    expect(IdentidadProducto.huella({ a: 1 })).not.toBe(
      IdentidadProducto.huella({ a: 2 }),
    );
  });
});
