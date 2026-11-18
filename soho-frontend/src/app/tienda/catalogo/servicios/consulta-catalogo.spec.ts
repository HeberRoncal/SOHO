import { TestBed } from '@angular/core/testing';
import { CatalogoApi } from './catalogo-api';
import { coincideConFiltros } from '../modelos/consulta-catalogo';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PRODUCTOS_CATALOGO_PRUEBA } from '../pruebas/productos.fixtures';
import { OPCIONES_API_PRUEBA, productoApiPrueba } from '../pruebas/datos-api';
describe('Consultas y disponibilidad del catalogo real', () => {
  let catalogo: CatalogoApi;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    catalogo = TestBed.inject(CatalogoApi);
    catalogo.iniciar();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((r) => r.url === '/api/productos')
      .flush({
        productos: PRODUCTOS_CATALOGO_PRUEBA.map(productoApiPrueba),
        paginacion: { pagina: 1, limite: 100, total: PRODUCTOS_CATALOGO_PRUEBA.length, paginas: 1 },
      });
    http.expectOne('/api/catalogo/filtros').flush(OPCIONES_API_PRUEBA);
    http.verify();
  });
  it('debe incluir los productos unisex en ambos géneros conservando el mismo inventario', () => {
    const hombre = catalogo.consultar({ genero: 'Hombre' });
    const mujer = catalogo.consultar({ genero: 'Mujer' });
    for (const producto of catalogo.productos.filter((producto) => producto.genero === 'Unisex')) {
      expect(hombre.find((item) => item.identificador === producto.identificador)).toBe(producto);
      expect(mujer.find((item) => item.identificador === producto.identificador)).toBe(producto);
    }
    expect(hombre.every((producto) => producto.genero !== 'Mujer')).toBe(true);
    expect(mujer.every((producto) => producto.genero !== 'Hombre')).toBe(true);
  });
  it('debe combinar filtros y buscar sin distinguir mayúsculas ni tildes', () => {
    const resultado = catalogo.consultar({
      marca: 'adidas',
      genero: 'Mujer',
      busqueda: 'CLASICOS',
      soloNovedades: true,
    });
    expect(resultado.map((producto) => producto.identificador)).toEqual(['samba']);
    expect(catalogo.consultar({ busqueda: 'modelo inexistente' })).toEqual([]);
  });
  it('debe unir los géneros seleccionados sin duplicar los productos ni su inventario', () => {
    const resultado = catalogo.consultar({ generos: ['Hombre', 'Mujer'] });
    const esperados = new Set([
      ...catalogo.consultar({ genero: 'Hombre' }),
      ...catalogo.consultar({ genero: 'Mujer' }),
    ]);
    expect(new Set(resultado)).toEqual(esperados);
    expect(resultado.length).toBe(esperados.size);
    const unisex = catalogo.consultar({ generos: ['Unisex'] });
    expect(unisex.length).toBeGreaterThan(0);
    expect(unisex.every((producto) => producto.genero === 'Unisex')).toBe(true);
    expect(catalogo.consultar({ generos: [] })).toEqual(catalogo.consultar());
  });
  it('debe considerar las reservas, el agotamiento y la habilitación de la variante', () => {
    const variante = catalogo.productos[0].variantes[0];
    expect(catalogo.estaDisponible({ ...variante, existencias: 0, cantidadReservada: 0 })).toBe(
      false,
    );
    expect(catalogo.estaDisponible({ ...variante, existencias: 2, cantidadReservada: 2 })).toBe(
      false,
    );
    expect(
      catalogo.estaDisponible({
        ...variante,
        existencias: 3,
        cantidadReservada: 2,
        habilitada: false,
      }),
    ).toBe(false);
    expect(
      catalogo.estaDisponible({
        ...variante,
        existencias: 3,
        cantidadReservada: 2,
        habilitada: true,
      }),
    ).toBe(true);
  });
  it('debe mantener SKU únicos y una sola combinación de color y talla por producto', () => {
    const variantes = catalogo.productos.flatMap((producto) => producto.variantes);
    expect(new Set(variantes.map((variante) => variante.sku)).size).toBe(variantes.length);
    for (const producto of catalogo.productos) {
      expect(
        new Set(producto.variantes.map((variante) => variante.codigoColor + '-' + variante.talla))
          .size,
      ).toBe(producto.variantes.length);
      expect(producto.variantes.every((variante) => !('precio' in variante))).toBe(true);
    }
  });

  it('debe usar tallas EU en todas las variantes y en su segmento de SKU', () => {
    for (const producto of catalogo.productos) {
      for (const variante of producto.variantes) {
        expect(variante.sistemaTallas).toBe('EU');
        expect(Number(variante.talla)).toBeGreaterThanOrEqual(36);
        expect(Number(variante.talla)).toBeLessThanOrEqual(47);
        expect(variante.sku.endsWith('-' + variante.talla)).toBe(true);
      }
    }
  });

  it('debe exigir que el color y la talla correspondan a la misma variante disponible', () => {
    const base = catalogo.obtener('samba')!;
    const producto = {
      ...base,
      variantes: base.variantes.map((variante) => ({
        ...variante,
        existencias: variante.codigoColor === 'BL' && variante.talla === '38' ? 0 : 4,
      })),
    };
    expect(coincideConFiltros(producto, { colores: ['BL'], tallas: ['38'] })).toBe(false);
    expect(coincideConFiltros(producto, { colores: ['NG'], tallas: ['38'] })).toBe(true);
  });

  it('debe ordenar sin modificar el catálogo original y respetar el rango de precios', () => {
    const originales = catalogo.productos.map((producto) => producto.identificador);
    const productos = catalogo.consultar(
      { precioMinimo: 300, precioMaximo: 600 },
      'precio-ascendente',
    );
    expect(productos.every((producto) => producto.precio >= 300 && producto.precio <= 600)).toBe(
      true,
    );
    expect(productos.map((producto) => producto.precio)).toEqual(
      productos.map((producto) => producto.precio).sort((a, b) => a - b),
    );
    expect(catalogo.productos.map((producto) => producto.identificador)).toEqual(originales);
    expect(catalogo.consultar({ precioMinimo: 600, precioMaximo: 300 })).toEqual([]);
  });
});
