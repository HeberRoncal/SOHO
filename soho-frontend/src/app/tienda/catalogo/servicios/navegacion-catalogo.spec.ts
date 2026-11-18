import { convertToParamMap } from '@angular/router';
import { NavegacionCatalogo } from './navegacion-catalogo';
describe('Parámetros del catálogo', () => {
  const navegacion = new NavegacionCatalogo();
  it.each([
    [{ soloNovedades: true }, '/zapatillas-novedades', 'novedades'],
    [{ soloOfertas: true }, '/zapatillas-ofertas', 'ofertas'],
  ] as const)(
    'debe construir la sección promocional sin repetir su filtro en la URL',
    (filtros, ruta, parametro) => {
      const destino = navegacion.crearDestino({ ...filtros, genero: 'Mujer', marcas: ['Nike'] });
      expect(destino.ruta).toBe(ruta);
      expect(destino.parametros[parametro]).toBeNull();
      expect(destino.parametros['genero']).toBe('Mujer');
      expect(destino.parametros['marca']).toEqual(['Nike']);
    },
  );
  it('debe conservar la sección actual al combinar filtros de género y promoción', () => {
    const filtros = { genero: 'Hombre' as const, soloOfertas: true, soloNovedades: true };
    expect(navegacion.crearDestino(filtros, 'relevancia', 'zapatillas-hombre').ruta).toBe(
      '/zapatillas-hombre',
    );
    const novedades = navegacion.crearDestino(filtros, 'relevancia', 'zapatillas-novedades');
    expect(novedades.ruta).toBe('/zapatillas-novedades');
    expect(novedades.parametros['novedades']).toBeNull();
    expect(novedades.parametros['ofertas']).toBe('1');
    expect(novedades.parametros['genero']).toBe('Hombre');
  });
  it.each([
    [undefined, '/zapatillas'],
    ['Hombre', '/zapatillas-hombre'],
    ['Mujer', '/zapatillas-mujer'],
    ['Unisex', '/zapatillas-unisex'],
  ] as const)(
    'debe construir la ruta de %s y reservar los parámetros para los filtros adicionales',
    (genero, ruta) => {
      const destino = navegacion.crearDestino(
        { genero, marcas: ['Nike'], tallas: ['40'] },
        'precio-ascendente',
      );
      expect(destino.ruta).toBe(ruta);
      expect(destino.parametros['genero']).toBeNull();
      expect(destino.parametros['marca']).toEqual(['Nike']);
      expect(destino.parametros['talla']).toEqual(['40']);
      expect(destino.parametros['orden']).toBe('precio-ascendente');
    },
  );
  it('debe conservar filtros múltiples, importes y orden al convertirlos a URL y leerlos', () => {
    const filtros = {
      marcas: ['Nike', 'adidas'],
      genero: 'Mujer' as const,
      categorias: ['Urbanas'],
      colores: ['BL'],
      tallas: ['40'],
      precioMinimo: 200,
      precioMaximo: 600,
      soloOfertas: true,
      busqueda: 'zapatillas',
    };
    const resultado = navegacion.leer(
      convertToParamMap(navegacion.crearParametros(filtros, 'precio-ascendente')),
    );
    expect(resultado.filtros).toMatchObject(filtros);
    expect(resultado.orden).toBe('precio-ascendente');
  });
  it('debe ignorar importes inválidos, géneros desconocidos y órdenes no permitidos', () => {
    const resultado = navegacion.leer(
      convertToParamMap({
        desde: '-2',
        hasta: 'Infinity',
        genero: 'Otro',
        orden: 'inventado',
        marca: ['Nike', 'Nike', ''],
      }),
    );
    expect(resultado.filtros.precioMinimo).toBeUndefined();
    expect(resultado.filtros.precioMaximo).toBeUndefined();
    expect(resultado.filtros.genero).toBeUndefined();
    expect(resultado.filtros.marcas).toEqual(['Nike']);
    expect(resultado.orden).toBe('relevancia');
  });
  it('debe conservar varios géneros en la URL y volver a una ruta limpia cuando queda uno', () => {
    const destino = navegacion.crearDestino(
      { generos: ['Hombre', 'Mujer'], marcas: ['Nike'] },
      'relevancia',
      'zapatillas-hombre',
    );
    expect(destino.ruta).toBe('/zapatillas');
    expect(destino.parametros['genero']).toEqual(['Hombre', 'Mujer']);
    const parametros = Object.fromEntries(
      Object.entries(destino.parametros).filter(([, valor]) => valor !== null),
    );
    expect(navegacion.leer(convertToParamMap(parametros)).filtros.generos).toEqual([
      'Hombre',
      'Mujer',
    ]);
    expect(navegacion.crearDestino({ generos: ['Mujer'] }).ruta).toBe('/zapatillas-mujer');
    expect(navegacion.crearDestino({ generos: [] }).ruta).toBe('/zapatillas');
    expect(
      navegacion.leer(convertToParamMap({ genero: ['Hombre', 'Otro', 'Hombre', 'Mujer'] })).filtros
        .generos,
    ).toEqual(['Hombre', 'Mujer']);
  });
  it('debe utilizar Relevancia por defecto sin añadirla a la URL', () => {
    expect(navegacion.leer(convertToParamMap({})).orden).toBe('relevancia');
    expect(navegacion.crearParametros()['orden']).toBeNull();
    const parametros = navegacion.crearParametros({}, 'relevancia');
    expect(parametros['orden']).toBeNull();
    expect(navegacion.leer(convertToParamMap({ orden: 'relevancia' })).orden).toBe('relevancia');
  });
  it('debe admitir cero como precio y el filtro simple de marca que utilizan los enlaces del inicio', () => {
    expect(navegacion.crearParametros({ marca: 'Nike', precioMinimo: 0 })['marca']).toEqual([
      'Nike',
    ]);
    expect(navegacion.leer(convertToParamMap({ desde: '0' })).filtros.precioMinimo).toBe(0);
  });
});
