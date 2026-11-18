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
      expect(grupo.enlaces.map((actual) => actual.texto)).toEqual([
        'Urbanas',
        'Running/Gym',
        'Básquet',
        'Skate',
        'Clásicos',
      ]);
      expect(enlace.ruta).toBe('/zapatillas-' + nombre.toLowerCase());
      expect(enlace.parametros['categoria']).toEqual(['Urbanas']);
      expect(enlace.parametros['genero']).toBeNull();
      expect(grupo.enlaces.find((actual) => actual.texto === 'Básquet')).toBeTruthy();
      expect(grupo.enlaces.find((actual) => actual.texto === 'Running/Gym')).toBeTruthy();
      expect(grupo.enlaces.find((actual) => actual.texto === 'Skate')).toBeTruthy();
      expect(grupo.tituloEnlazado).toBe(true);
      expect(grupo.principal.ruta).toBe('/zapatillas-' + nombre.toLowerCase());
      expect(grupo.enlaces.some((actual) => actual.texto === 'Ver todas')).toBe(false);
    },
  );
  it('muestra Novedades en el orden definido, aunque aún no haya productos publicados', () => {
    const grupo = servicio.grupos.find(
      (actual) => actual.identificador === 'zapatillas-novedades',
    )!;
    expect(grupo.enlaces.map((enlace) => enlace.texto)).toEqual([
      'Recién llegados',
      'Más vendidos',
      'Ediciones limitadas',
    ]);
    expect(grupo.enlaces.map((enlace) => enlace.parametros['categoria']?.[0])).toEqual([
      'Urbanas',
      'Skate',
      'Clásicos',
    ]);
    expect(grupo.enlaces.every((enlace) => enlace.ruta === '/zapatillas-novedades')).toBe(true);
    expect(grupo.enlaces.every((enlace) => enlace.parametros['novedades'] === null)).toBe(true);
    expect(grupo.titulo).toBeUndefined();
    expect(grupo.enlaces.some((enlace) => enlace.texto === 'Ver todas')).toBe(false);
  });
  it('Ofertas enlaza directamente al cat?logo completo de descuentos, sin categor?as', () => {
    const grupo = servicio.grupos.find((actual) => actual.identificador === 'zapatillas-ofertas')!;
    expect(grupo.enlaceDirecto).toBe(true);
    expect(grupo.principal.ruta).toBe('/zapatillas-ofertas');
    expect(grupo.principal.parametros['categoria']).toBeNull();
    expect(grupo.enlaces).toEqual([]);
  });
  it('muestra las marcas en el orden comercial y enlaza al catálogo filtrado', () => {
    const grupo = servicio.grupos.find((actual) => actual.nombre === 'Marcas')!;
    expect(grupo.enlaces.slice(1).map((enlace) => enlace.texto)).toEqual([
      'adidas',
      'Asics',
      'Converse',
      'New Balance',
      'Nike',
      'Puma',
      'Reebok',
      'Skechers',
      'Under Armour',
      'Vans',
    ]);
    const enlace = grupo.enlaces.find((actual) => actual.texto === 'Nike')!;
    expect(enlace.ruta).toBe('/zapatillas');
    expect(enlace.parametros['marca']).toEqual(['Nike']);
  });
});
