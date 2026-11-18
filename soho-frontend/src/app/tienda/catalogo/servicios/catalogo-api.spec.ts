import { TestBed } from '@angular/core/testing';
import { CatalogoApi, adaptarProducto } from './catalogo-api';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OPCIONES_API_PRUEBA, PRODUCTO_API_PRUEBA, paginaApi } from '../pruebas/datos-api';
import { FUENTE_CATALOGO } from '../modelos/fuente-catalogo';

describe('CatalogoApi', () => {
  let service: CatalogoApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogoApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('traslada un SKU en caché a su ficha canónica por color sin duplicarlo', () => {
    service.obtenerProducto('anterior').subscribe();
    http.expectOne('/api/productos/anterior').flush({ ...PRODUCTO_API_PRUEBA, slug: 'anterior' });
    service.obtenerProducto('nuevo-color').subscribe();
    http
      .expectOne('/api/productos/nuevo-color')
      .flush({ ...PRODUCTO_API_PRUEBA, slug: 'nuevo-color', otrosColores: [] });
    const sku = PRODUCTO_API_PRUEBA.variantes[0].sku;
    expect(
      service.productos
        .filter((p) => p.variantes.some((v) => v.sku === sku))
        .map((p) => p.identificador),
    ).toEqual(['nuevo-color']);
  });
  it('rechaza rutas de otros colores que no sean slugs de producto', () => {
    expect(() =>
      adaptarProducto({
        ...PRODUCTO_API_PRUEBA,
        otrosColores: [
          { slug: '../cuenta', codigo: 'NG', nombre: 'Negro', hexadecimal: '#000000' },
        ],
      }),
    ).toThrow('Enlace de color');
  });

  it('utiliza la API como fuente predeterminada sin productos ni marcas de ejemplo', () => {
    expect(TestBed.inject(FUENTE_CATALOGO)).toBe(service);
    expect(service.productos).toEqual([]);
    expect(service.marcas).toEqual([]);
  });

  it('envía filtros repetidos y céntimos; adapta el disponible sin restar reservas otra vez', () => {
    let nombre = '';
    service
      .consultarPagina(
        {
          marcas: ['Nike', 'adidas'],
          genero: 'Hombre',
          tallas: ['40.5'],
          precioMinimo: 10.25,
          soloOfertas: true,
        },
        'precio-descendente',
        2,
      )
      .subscribe((r) => {
        nombre = r.productos[0].nombre;
      });
    const solicitud = http.expectOne((r) => r.url === '/api/productos');
    expect(solicitud.request.params.getAll('marca')).toEqual(['Nike', 'adidas']);
    expect(solicitud.request.params.get('desde')).toBe('10.25');
    expect(solicitud.request.params.get('pagina')).toBe('2');
    expect(solicitud.request.params.get('ofertas')).toBe('1');
    solicitud.flush(paginaApi(2, 25));
    http.expectOne('/api/catalogo/filtros').flush(OPCIONES_API_PRUEBA);
    expect(nombre).toContain('Air Force');
    expect(service.obtener('af1')?.precio).toBe(529.9);
    expect(service.obtener('af1')?.variantes.find((v) => v.talla === '40')?.existencias).toBe(5);
    expect(service.opciones?.tallas).toEqual(['40', '41']);
  });

  it('cancela HTTP al abandonar una consulta sin dejar respuestas pendientes', () => {
    const suscripcion = service.consultarPagina({}, 'relevancia', 1).subscribe();
    const listado = http.expectOne((r) => r.url === '/api/productos');
    const opciones = http.expectOne('/api/catalogo/filtros');
    suscripcion.unsubscribe();
    expect(listado.cancelled).toBe(true);
    expect(opciones.cancelled).toBe(true);
  });

  it('distingue un 404 de una caída del servidor y permite repetir la petición', () => {
    let respuesta: unknown = 'pendiente';
    service.obtenerProducto('af1').subscribe((p) => {
      respuesta = p;
    });
    http.expectOne('/api/productos/af1').flush(PRODUCTO_API_PRUEBA);
    expect(service.obtener('af1')).toBeTruthy();
    service.obtenerProducto('af1').subscribe((p) => {
      respuesta = p;
    });
    http.expectOne('/api/productos/af1').flush({}, { status: 404, statusText: 'Not Found' });
    expect(respuesta).toBeUndefined();
    expect(service.obtener('af1')).toBeUndefined();
    let fallo = false;
    service.obtenerProducto('af1').subscribe({
      error: () => {
        fallo = true;
      },
    });
    http.expectOne('/api/productos/af1').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(fallo).toBe(true);
    service.obtenerProducto('af1').subscribe((p) => {
      respuesta = p;
    });
    http.expectOne('/api/productos/af1').flush(PRODUCTO_API_PRUEBA);
    expect(respuesta).toBeTruthy();
  });

  it('rechaza importes y disponibilidades que no cumplen el contrato', () => {
    expect(() => adaptarProducto({ ...PRODUCTO_API_PRUEBA, precio: 'NaN' })).toThrow();
    expect(() =>
      adaptarProducto({
        ...PRODUCTO_API_PRUEBA,
        variantes: [{ ...PRODUCTO_API_PRUEBA.variantes[0], disponible: -1 }],
      }),
    ).toThrow();
  });

  it('recupera SKU persistidos usando la API y mantiene su precio actual', () => {
    service.cargarSkus(['SKU-NUEVO']);
    const solicitud = http.expectOne(
      (r) => r.url === '/api/productos' && r.params.get('sku') === 'SKU-NUEVO',
    );
    solicitud.flush(paginaApi());
    expect(service.productos).toHaveLength(1);
  });
});
