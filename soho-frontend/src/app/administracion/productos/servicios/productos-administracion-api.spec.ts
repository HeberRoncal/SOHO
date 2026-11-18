import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProductosAdministracionApi } from './productos-administracion-api';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import {
  listadoProductosFixture,
  productoAdminFixture,
  resumenInventarioFixture,
  ID_PRODUCTO_PRUEBA,
} from '../modelos/consulta-productos.fixtures';
import { ProductosAdministracion } from './productos-administracion';

describe('Consultas reales de productos e inventario', () => {
  let api: ProductosAdministracionApi, http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>(null);
  beforeEach(() => {
    perfil.set({ id: 'admin-a', rol: 'ADMIN' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion: signal('autenticado') } },
      ],
    });
    api = TestBed.inject(ProductosAdministracionApi);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  it('envía filtros y página al servidor, sin deducir totales del resultado', async () => {
    const p = api.cargarListado({ marca: 'nike', busqueda: 'NK-AF107', pagina: '2' });
    const r = http.expectOne(
      (q) =>
        q.url === '/api/admin/productos' &&
        q.params.get('pagina') === '2' &&
        q.params.get('marca') === 'nike',
    );
    r.flush(listadoProductosFixture());
    await p;
    expect(api.productos()).toHaveLength(1);
    expect(api.paginacion().total).toBe(30);
    expect(api.resumen().variantes).toBe(80);
    expect(api.productos()[0].precio).toBeNull();
  });
  it('cancela búsquedas anteriores y no deja que sobreescriban la actual', async () => {
    const a = api.cargarListado({ busqueda: 'anterior' }),
      ra = http.expectOne((q) => q.params.get('busqueda') === 'anterior');
    const b = api.cargarListado({ busqueda: 'actual' }),
      rb = http.expectOne((q) => q.params.get('busqueda') === 'actual');
    expect(ra.cancelled).toBe(true);
    rb.flush(listadoProductosFixture());
    await Promise.all([a, b]);
    expect(api.estadoListado()).toBe('lista');
    expect(api.productos()[0].nombre).toBe('Zapatilla real');
  });
  it('limpia datos de otra cuenta y cancela consultas al cerrar sesión', async () => {
    const a = api.cargarListado();
    http.expectOne('/api/admin/productos').flush(listadoProductosFixture());
    await a;
    const b = api.cargarDetalle(ID_PRODUCTO_PRUEBA),
      r = http.expectOne('/api/admin/productos/' + ID_PRODUCTO_PRUEBA);
    perfil.set(null);
    expect(api.productos()).toEqual([]);
    TestBed.tick();
    await b;
    expect(r.cancelled).toBe(true);
    expect(api.detalleActual()).toBeNull();
    expect(api.resumenRemoto()).toBeNull();
  });
  it('rechaza consultas sin ADMIN sin utilizar datos de demostración', async () => {
    perfil.set({ id: 'cliente', rol: 'CLIENTE' });
    TestBed.tick();
    await api.cargarListado();
    http.expectNone('/api/admin/productos');
    expect(api.productos()).toEqual([]);
    expect(api.estadoListado()).toBe('error');
  });
  it('recupera un fallo 503 y conserva el mismo filtro al reintentar', async () => {
    let p = api.cargarListado({ estado: 'borrador' });
    http
      .expectOne((q) => q.params.get('estado') === 'borrador')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(api.estadoListado()).toBe('error');
    expect(api.productos()).toEqual([]);
    p = api.cargarListado({ estado: 'borrador' });
    http.expectOne((q) => q.params.get('estado') === 'borrador').flush(listadoProductosFixture());
    await p;
    expect(api.estadoListado()).toBe('lista');
  });
  it('no conserva el detalle anterior mientras consulta otro producto o tras un 404', async () => {
    let p = api.cargarDetalle(ID_PRODUCTO_PRUEBA);
    http
      .expectOne('/api/admin/productos/' + ID_PRODUCTO_PRUEBA)
      .flush({ producto: productoAdminFixture(), capacidades: { escrituraDisponible: false } });
    await p;
    p = api.cargarDetalle('ausente');
    expect(api.detalleActual()).toBeNull();
    http
      .expectOne('/api/admin/productos/ausente')
      .flush({}, { status: 404, statusText: 'Not Found' });
    await p;
    expect(api.detalleActual()).toBeNull();
    expect(api.estadoDetalle()).toBe('error');
  });
  it('consulta alertas globales sin mezclar los filtros del listado', async () => {
    const p = api.cargarResumen();
    const r = http.expectOne('/api/admin/inventario/resumen');
    expect(r.request.params.keys()).toEqual([]);
    r.flush(resumenInventarioFixture());
    await p;
    expect(api.resumenRemoto()?.alertasTotal).toBe(30);
  });
  it('envía fechas de Perú y el producto al historial remoto', async () => {
    const p = api.cargarMovimientos({
      producto: ID_PRODUCTO_PRUEBA,
      desde: '2026-11-14',
      hasta: '2026-11-14',
      pagina: '2',
    });
    http
      .expectOne(
        (q) =>
          q.url === '/api/admin/inventario/movimientos' &&
          q.params.get('producto') === ID_PRODUCTO_PRUEBA &&
          q.params.get('desde') === '2026-11-14' &&
          q.params.get('pagina') === '2',
      )
      .flush({
        movimientos: [],
        paginacion: { pagina: 2, limite: 20, total: 30, paginas: 2 },
        capacidades: { escrituraDisponible: false },
      });
    await p;
    expect(api.paginaMovimientos().total).toBe(30);
  });
  it('proporciona la API por defecto y no carga ejemplos ni operaciones simuladas', () => {
    expect(TestBed.inject(ProductosAdministracion)).toBe(api);
    for (const metodo of [
      'guardar',
      'registrarMovimiento',
      'archivar',
      'restaurar',
      'restablecer',
      'siguienteCodigo',
    ])
      expect(metodo in api).toBe(false);
    expect(api.productos()).toEqual([]);
    expect(api.movimientos()).toEqual([]);
    expect(api.estadoListado()).toBe('inicial');
    http.expectNone((q) => q.method !== 'GET');
  });
  it('actualiza listado, detalle, historial y resumen conservando filtros', async () => {
    let p = api.cargarListado({ busqueda: 'NK', pagina: '2' });
    http.expectOne((q) => q.url === '/api/admin/productos').flush(listadoProductosFixture());
    await p;
    p = api.cargarDetalle(ID_PRODUCTO_PRUEBA);
    http
      .expectOne('/api/admin/productos/' + ID_PRODUCTO_PRUEBA)
      .flush({ producto: productoAdminFixture(), capacidades: { escrituraDisponible: false } });
    await p;
    p = api.cargarMovimientos({ producto: ID_PRODUCTO_PRUEBA, desde: '2026-11-14', pagina: '2' });
    const historia = {
      movimientos: [],
      paginacion: { pagina: 2, limite: 20, total: 30, paginas: 2 },
      capacidades: { escrituraDisponible: false },
    };
    http.expectOne((q) => q.url === '/api/admin/inventario/movimientos').flush(historia);
    await p;
    const actualizado = api.actualizarInventario(ID_PRODUCTO_PRUEBA);
    const listado = http.expectOne((q) => q.url === '/api/admin/productos');
    expect(listado.request.params.get('busqueda')).toBe('NK');
    expect(listado.request.params.get('pagina')).toBe('2');
    listado.flush(listadoProductosFixture());
    http
      .expectOne('/api/admin/productos/' + ID_PRODUCTO_PRUEBA)
      .flush({ producto: productoAdminFixture(), capacidades: { escrituraDisponible: false } });
    const movimientos = http.expectOne((q) => q.url === '/api/admin/inventario/movimientos');
    expect(movimientos.request.params.get('producto')).toBe(ID_PRODUCTO_PRUEBA);
    expect(movimientos.request.params.get('desde')).toBe('2026-11-14');
    movimientos.flush(historia);
    http.expectOne('/api/admin/inventario/resumen').flush(resumenInventarioFixture());
    expect(await actualizado).toBe(true);
  });
  it('informa una lectura posterior fallida sin enviar otra escritura', async () => {
    const p = api.actualizarInventario(ID_PRODUCTO_PRUEBA);
    http
      .expectOne('/api/admin/inventario/resumen')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(await p).toBe(false);
    http.expectNone((q) => q.method !== 'GET');
  });
});
