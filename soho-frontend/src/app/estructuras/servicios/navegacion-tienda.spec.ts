import { proveerCatalogoPrueba } from '../../tienda/catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { NavegacionTienda } from './navegacion-tienda';
import { CatalogoPrueba } from '../../tienda/catalogo/pruebas/catalogo.fixture';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Contenido de los submenús de la tienda', () => {
  let servicio: NavegacionTienda;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(NavegacionTienda);
  });

  it.each(['Hombre', 'Mujer'])(
    'debe incluir categorías de productos unisex dentro de %s',
    (nombre) => {
      const grupo = servicio.grupos.find((actual) => actual.nombre === nombre)!;
      const enlace = grupo.enlaces.find((actual) => actual.texto === 'Urbanas')!;
      expect(enlace.ruta).toBe('/zapatillas-' + nombre.toLowerCase());
      expect(enlace.parametros['categoria']).toEqual(['Clásicos']);
      expect(enlace.parametros['genero']).toBeNull();
      expect(grupo.enlaces.find((actual) => actual.texto === 'Básquet')).toBeTruthy();
      expect(grupo.enlaces.find((actual) => actual.texto === 'Running/Gym')).toBeTruthy();
      expect(grupo.enlaces.find((actual) => actual.texto === 'Skate')).toBeTruthy();
      expect(grupo.tituloEnlazado).toBe(true);
      expect(grupo.principal.ruta).toBe('/zapatillas-' + nombre.toLowerCase());
      expect(grupo.enlaces.some((actual) => actual.texto === 'Ver todas')).toBe(false);
    },
  );
  it.each(['novedades'])('debe mostrar solamente las categorías disponibles en %s', (seccion) => {
    const grupo = servicio.grupos.find(
      (actual) => actual.identificador === 'zapatillas-' + seccion,
    )!;
    const filtros = seccion === 'novedades' ? { soloNovedades: true } : { soloOfertas: true };
    const categorias = [
      ...new Set(
        TestBed.inject(CatalogoPrueba)
          .consultar(filtros)
          .map((producto) => producto.categoria),
      ),
    ].sort();
    expect(
      grupo.enlaces
        .filter((enlace) => enlace.parametros['categoria']?.length)
        .map((enlace) => enlace.parametros['categoria'][0])
        .sort(),
    ).toEqual(categorias);
    expect(grupo.enlaces.every((enlace) => enlace.ruta === '/zapatillas-' + seccion)).toBe(true);
    expect(grupo.enlaces.every((enlace) => enlace.parametros[seccion] === null)).toBe(true);
    if (seccion === 'novedades') {
      expect(grupo.titulo).toBeUndefined();
      expect(grupo.enlaces.some((enlace) => enlace.texto === 'Ver todas')).toBe(false);
    } else {
      expect(grupo.titulo).toBe('Zapatillas');
      expect(grupo.enlaces[0].texto).toBe('Ver todas');
    }
  });
  it('Ofertas enlaza directamente al cat?logo completo de descuentos, sin categor?as', () => {
    const grupo = servicio.grupos.find((actual) => actual.identificador === 'zapatillas-ofertas')!;
    expect(grupo.enlaceDirecto).toBe(true);
    expect(grupo.principal.ruta).toBe('/zapatillas-ofertas');
    expect(grupo.principal.parametros['categoria']).toBeNull();
    expect(grupo.enlaces).toEqual([]);
  });
  it('debe construir las marcas desde los productos publicados y enlazar al catálogo filtrado', () => {
    const grupo = servicio.grupos.find((actual) => actual.nombre === 'Marcas')!;
    const marcas = [
      ...new Set(
        TestBed.inject(CatalogoPrueba)
          .consultar()
          .map((producto) => producto.marca),
      ),
    ].sort();
    expect(
      grupo.enlaces
        .slice(1)
        .map((enlace) => enlace.texto)
        .sort(),
    ).toEqual(marcas);
    const enlace = grupo.enlaces.find((actual) => actual.texto === 'Nike')!;
    expect(enlace.ruta).toBe('/zapatillas');
    expect(enlace.parametros['marca']).toEqual(['Nike']);
  });
});
