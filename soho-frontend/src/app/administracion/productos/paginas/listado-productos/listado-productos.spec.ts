import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ListadoProductos } from './listado-productos';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { listadoProductosFixture } from '../../modelos/consulta-productos.fixtures';

describe('Listado de productos con consultas reales', () => {
  let f: ComponentFixture<ListadoProductos>, http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListadoProductos],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Cuenta,
          useValue: {
            perfil: signal({ id: 'admin-prueba', rol: 'ADMIN' }),
            estadoSesion: signal('autenticado'),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(ListadoProductos);
    f.detectChanges();
    TestBed.tick();
    http
      .expectOne('/api/admin/productos/opciones')
      .flush({ marcas: [], categorias: [], capacidades: { escrituraDisponible: false } });
  });
  afterEach(() => http.verify());
  it('muestra los datos del servidor sin controles ni confirmaciones de demostración', async () => {
    http.expectOne((q) => q.url === '/api/admin/productos').flush(listadoProductosFixture());
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Zapatilla real');
    expect(f.nativeElement.querySelector('[aria-label="Escenario de demostración"]')).toBeNull();
    expect(f.nativeElement.textContent.toLowerCase()).not.toContain('demostración');
    expect(f.nativeElement.querySelector('.contenido-archivo')).toBeNull();
  });
  it('una consulta vacía no repone los productos del prototipo', async () => {
    const datos = listadoProductosFixture();
    datos.productos = [];
    datos.paginacion = { pagina: 1, limite: 20, total: 0, paginas: 0 };
    http.expectOne((q) => q.url === '/api/admin/productos').flush(datos);
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(f.nativeElement.textContent).toContain('Aún no hay productos');
  });
  it('un error muestra reintento y conserva el listado sin ejemplos', async () => {
    http
      .expectOne((q) => q.url === '/api/admin/productos')
      .flush({}, { status: 503, statusText: 'Sin conexión' });
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(f.nativeElement.querySelectorAll('tbody tr')).toHaveLength(0);
  });
});
