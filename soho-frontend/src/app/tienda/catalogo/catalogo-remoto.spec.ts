import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Catalogo } from './catalogo';
import { DetalleProducto } from '../detalle-producto/detalle-producto';
import { CatalogoApi } from './servicios/catalogo-api';
import { FUENTE_CATALOGO } from './modelos/fuente-catalogo';
import { OPCIONES_API_PRUEBA, PRODUCTO_API_PRUEBA, paginaApi } from './pruebas/datos-api';
import { ALMACENAMIENTO_CARRITO } from '../carrito/servicios/carrito-local';
import { ALMACENAMIENTO_FAVORITOS } from '../../estructuras/servicios/presentacion-tienda';
import { Carrito } from '../carrito/servicios/carrito';
import { vi } from 'vitest';

describe('Pantallas con catálogo remoto', () => {
  let http: HttpTestingController;
  let consulta: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    consulta = new BehaviorSubject(convertToParamMap({}));
    const parametros = new BehaviorSubject(convertToParamMap({ identificador: 'af1' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FUENTE_CATALOGO, useExisting: CatalogoApi },
        { provide: ALMACENAMIENTO_CARRITO, useValue: null },
        { provide: ALMACENAMIENTO_FAVORITOS, useValue: null },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: consulta,
            paramMap: parametros,
            data: new BehaviorSubject({ seccion: 'zapatillas' }),
            snapshot: {
              queryParamMap: consulta.value,
              paramMap: parametros.value,
              data: { seccion: 'zapatillas' },
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('muestra carga y cancela los resultados antiguos cuando cambia el filtro', async () => {
    const vista = TestBed.createComponent(Catalogo);
    vista.detectChanges();
    TestBed.tick();
    expect(vista.nativeElement.textContent).toContain('Estamos cargando');
    const anterior = http.expectOne((r) => r.url === '/api/productos');
    const opcionesAnteriores = http.expectOne('/api/catalogo/filtros');
    consulta.next(convertToParamMap({ marca: 'Nike' }));
    TestBed.tick();
    expect(anterior.cancelled).toBe(true);
    expect(opcionesAnteriores.cancelled).toBe(true);
    const nueva = http.expectOne(
      (r) => r.url === '/api/productos' && r.params.get('marca') === 'Nike',
    );
    nueva.flush(paginaApi());
    http.expectOne('/api/catalogo/filtros').flush(OPCIONES_API_PRUEBA);
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.querySelectorAll('app-tarjeta-producto')).toHaveLength(1);
  });

  it('muestra error con reintento sin convertirlo en resultados vacíos', async () => {
    const vista = TestBed.createComponent(Catalogo);
    vista.detectChanges();
    TestBed.tick();
    http.expectOne('/api/catalogo/filtros').flush(OPCIONES_API_PRUEBA);
    http
      .expectOne((r) => r.url === '/api/productos')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.textContent).toContain('No pudimos cargar el catálogo');
    expect(vista.nativeElement.textContent).not.toContain('Sin resultados');
    [...vista.nativeElement.querySelectorAll('button')]
      .find((b: unknown) => (b as HTMLButtonElement).textContent?.trim() === 'Reintentar')
      .click();
    TestBed.tick();
    http.expectOne((r) => r.url === '/api/productos').flush(paginaApi(1, 0));
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.textContent).toContain('Sin resultados');
  });

  it('muestra el total del servidor y conserva filtros al pedir la siguiente página', async () => {
    const vista = TestBed.createComponent(Catalogo);
    vista.detectChanges();
    TestBed.tick();
    http.expectOne((r) => r.url === '/api/productos').flush(paginaApi(1, 25));
    http.expectOne('/api/catalogo/filtros').flush(OPCIONES_API_PRUEBA);
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.querySelector('.resultados').textContent).toContain('25 modelos');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    [...vista.nativeElement.querySelectorAll('.paginacion button')]
      .find((b: unknown) => (b as HTMLButtonElement).textContent?.trim() === 'Siguiente')
      .click();
    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { pagina: 2 }, queryParamsHandling: 'merge' }),
    );
  });

  it('detalle recupera la disponibilidad real y la comparte con el carrito local', async () => {
    consulta.next(convertToParamMap({ color: 'BL', talla: '40' }));
    const vista = TestBed.createComponent(DetalleProducto);
    vista.detectChanges();
    TestBed.tick();
    http.expectOne('/api/productos/af1').flush({
      ...PRODUCTO_API_PRUEBA,
      precio: '123.45',
      variantes: PRODUCTO_API_PRUEBA.variantes.map((v) => ({
        ...v,
        disponible: v.talla === '40' ? 2 : 0,
      })),
    });
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.querySelector('.disponible').textContent).toContain('2 unidades');
    vista.nativeElement.querySelector('.agregar').click();
    expect(TestBed.inject(Carrito).subtotal()).toBe(123.45);
    consulta.next(convertToParamMap({ color: 'BL', talla: '41' }));
    TestBed.tick();
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.querySelector('.agregar').disabled).toBe(true);
    http.expectNone('/api/productos/af1');
  });

  it('detalle diferencia la caída de la API de un producto inexistente', async () => {
    const vista = TestBed.createComponent(DetalleProducto);
    vista.detectChanges();
    TestBed.tick();
    http.expectOne('/api/productos/af1').flush({}, { status: 503, statusText: 'Unavailable' });
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.textContent).toContain('No pudimos cargar el producto');
    vista.nativeElement.querySelector('button').click();
    TestBed.tick();
    http.expectOne('/api/productos/af1').flush({}, { status: 404, statusText: 'Not Found' });
    await vista.whenStable();
    vista.detectChanges();
    expect(vista.nativeElement.textContent).toContain('Producto no encontrado');
  });
});
