import { ConsultaVariantes } from './consulta-variantes.js';
describe('Filtros remotos de variantes', () => {
  it('pagina y admite SKU exacto', () => {
    expect(
      ConsultaVariantes.leer({
        sku: ' NK-AF107-BL-40P5 ',
        pagina: '2',
        limite: '50',
      }),
    ).toEqual({
      sku: 'NK-AF107-BL-40P5',
      producto: '',
      busqueda: '',
      pagina: 2,
      limite: 50,
    });
  });
  it('define valores iniciales', () => {
    expect(ConsultaVariantes.leer({})).toEqual({
      sku: '',
      producto: '',
      busqueda: '',
      pagina: 1,
      limite: 20,
    });
  });
  it.each([
    { sku: ['a', 'b'] },
    { sku: {} },
    { producto: 'SHO-001' },
    { busqueda: ['a'] },
    { busqueda: 'a\nb' },
    { busqueda: 'a'.repeat(121) },
    { sku: 'a'.repeat(97) },
    { pagina: '0' },
    { pagina: '1.5' },
    { pagina: 1 },
    { pagina: '100001' },
    { limite: '51' },
    { limite: ['2', '3'] },
    { estado: 'publicado' },
  ])('rechaza consulta inválida %j', (q) => {
    expect(() => ConsultaVariantes.leer(q)).toThrow();
  });
});
