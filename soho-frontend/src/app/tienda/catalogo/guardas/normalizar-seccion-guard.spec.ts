import { proveerCoberturaPrueba } from '../../finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from '../pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { ALMACENAMIENTO_FAVORITOS } from '../../../estructuras/servicios/presentacion-tienda';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('Normalización de las secciones del catálogo', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ALMACENAMIENTO_FAVORITOS, useValue: null }],
    });
  });
  it.each([
    ['Hombre', '/zapatillas-hombre'],
    ['Mujer', '/zapatillas-mujer'],
    ['Unisex', '/zapatillas-unisex'],
  ])(
    'debe redirigir el catálogo anterior para %s conservando los demás filtros',
    async (genero, destino) => {
      await RouterTestingHarness.create(
        '/catalogo?genero=' +
          genero +
          '&marca=Nike&marca=adidas&talla=40&desde=0&hasta=800&orden=precio-descendente#productos',
      );
      const router = TestBed.inject(Router);
      const url = router.parseUrl(router.url);
      expect(router.url.split('?')[0]).toBe(destino);
      expect(url.queryParams['marca']).toEqual(['Nike', 'adidas']);
      expect(url.queryParams['talla']).toBe('40');
      expect(url.queryParams['desde']).toBe('0');
      expect(url.queryParams['hasta']).toBe('800');
      expect(url.queryParams['orden']).toBe('precio-descendente');
      expect(url.queryParams['genero']).toBeUndefined();
      expect(url.fragment).toBe('productos');
    },
  );
  it.each(['/catalogo', '/catalogo?genero=desconocido'])(
    'debe abrir todas las zapatillas desde %s',
    async (origen) => {
      await RouterTestingHarness.create(origen);
      expect(TestBed.inject(Router).url).toBe('/zapatillas');
    },
  );
  it('debe dar prioridad a la sección de la ruta y quitar el género redundante', async () => {
    await RouterTestingHarness.create('/zapatillas-hombre?genero=Mujer&marca=Nike');
    expect(TestBed.inject(Router).url).toBe('/zapatillas-hombre?marca=Nike');
  });
  it('debe trasladar el género de un enlace genérico a su sección', async () => {
    await RouterTestingHarness.create('/zapatillas?genero=Mujer&marca=Nike');
    expect(TestBed.inject(Router).url).toBe('/zapatillas-mujer?marca=Nike');
  });
  it.each([
    ['/zapatillas?novedades=1', '/zapatillas-novedades'],
    ['/zapatillas?ofertas=1', '/zapatillas-ofertas'],
    ['/catalogo?novedades=1', '/zapatillas-novedades'],
    ['/catalogo?ofertas=1', '/zapatillas-ofertas'],
    ['/zapatillas-ofertas?ofertas=0', '/zapatillas-ofertas'],
    ['/zapatillas-novedades?novedades=1', '/zapatillas-novedades'],
    ['/zapatillas?ofertas=1&novedades=1', '/zapatillas-ofertas?novedades=1'],
    ['/zapatillas-hombre?ofertas=1', '/zapatillas-hombre?ofertas=1'],
  ])('debe normalizar %s como %s', async (origen, destino) => {
    await RouterTestingHarness.create(origen);
    expect(TestBed.inject(Router).url).toBe(destino);
  });
  it('debe conservar los filtros combinados al redirigir una promoción anterior', async () => {
    await RouterTestingHarness.create(
      '/catalogo?ofertas=1&genero=Hombre&marca=Nike&marca=adidas&desde=200&orden=precio-descendente#productos',
    );
    const router = TestBed.inject(Router);
    expect(router.url.split('?')[0]).toBe('/zapatillas-ofertas');
    const url = router.parseUrl(router.url);
    expect(url.queryParams['genero']).toBe('Hombre');
    expect(url.queryParams['marca']).toEqual(['Nike', 'adidas']);
    expect(url.queryParams['desde']).toBe('200');
    expect(url.queryParams['orden']).toBe('precio-descendente');
    expect(url.queryParams['ofertas']).toBeUndefined();
    expect(url.fragment).toBe('productos');
  });
});
