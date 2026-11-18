import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ListadoClientes } from './listado-clientes/listado-clientes';
import { DetalleCliente } from './detalle-cliente/detalle-cliente';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import {
  detalleClienteFixture,
  direccionesClienteFixture,
  ID_CLIENTE,
  listadoClienteFixture,
  pedidosClienteFixture,
} from '../modelos/consulta-clientes.fixtures';

describe('Pantallas conectadas de Clientes', () => {
  let http: HttpTestingController, h: RouterTestingHarness;
  const base = '/api/admin/clientes',
    perfil = signal<{ id: string; rol: string } | null>({ id: 'administrador', rol: 'ADMIN' });
  beforeEach(async () => {
    perfil.set({ id: 'administrador', rol: 'ADMIN' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/clientes', component: ListadoClientes },
          { path: 'admin/clientes/:identificador', component: DetalleCliente },
        ]),
        { provide: Cuenta, useValue: { perfil, estadoSesion: signal('autenticado') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    h = await RouterTestingHarness.create();
  });
  afterEach(() => {
    http.verify();
  });
  const texto = () => h.routeNativeElement!.textContent!;
  async function render() {
    await Promise.resolve();
    TestBed.tick();
    h.detectChanges();
    await h.fixture.whenStable();
    h.detectChanges();
  }
  async function ficha(consulta = '') {
    await h.navigateByUrl('/admin/clientes/' + ID_CLIENTE + consulta);
    http.expectOne(base + '/' + ID_CLIENTE).flush(detalleClienteFixture());
    await render();
  }
  it('usa filtros y página del enlace, ignorando el antiguo selector vista', async () => {
    await h.navigateByUrl(
      '/admin/clientes?busqueda=Lucia&tipo=registrado&orden=pedidos&pagina=2&vista=error&paginaPedidos=2&paginaDirecciones=4&clienteOrigen=anterior',
    );
    const r = http.expectOne((q) => q.url === base);
    expect(r.request.params.get('pagina')).toBe('2');
    expect(r.request.params.has('vista')).toBe(false);
    const f = listadoClienteFixture();
    f.paginacion = { pagina: 2, limite: 20, total: 21, paginas: 2 };
    f.resumen = { total: 21, registrados: 19, invitados: 2, unidadInvitados: 'pedido' };
    r.flush(f);
    await render();
    expect(texto()).toContain('Lucía Fernández');
    expect(texto()).not.toMatch(/Demostración|ficticio|No pudimos/);
    const href = h.routeNativeElement!.querySelector('td.identidad a')!.getAttribute('href')!;
    expect(href).toContain('pagina=2');
    expect(href).toContain('tipo=registrado');
    expect(href).not.toContain('paginaPedidos');
    expect(href).not.toContain('paginaDirecciones');
    expect(href).not.toContain('clienteOrigen');
  });
  it('cambiar tipo reinicia la página conservando búsqueda y orden', async () => {
    await h.navigateByUrl('/admin/clientes?busqueda=Lucia&orden=nombre&pagina=2');
    const f = listadoClienteFixture();
    f.paginacion = { pagina: 2, limite: 20, total: 21, paginas: 2 };
    f.resumen.total = 21;
    f.resumen.registrados = 19;
    http.expectOne((q) => q.url === base).flush(f);
    await render();
    const b = [...h.routeNativeElement!.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Invitados'),
    )!;
    b.click();
    await render();
    const r = http.expectOne((q) => q.url === base);
    expect(r.request.params.get('pagina')).toBe('1');
    expect(r.request.params.get('busqueda')).toBe('Lucia');
    expect(r.request.params.get('orden')).toBe('nombre');
    expect(r.request.params.get('tipo')).toBe('invitado');
    r.flush({ ...f, clientes: [], paginacion: { pagina: 1, limite: 20, total: 0, paginas: 0 } });
    await render();
    expect(texto()).toContain('Limpiar filtros');
  });
  it('un error de listado permite reintentar los filtros y no muestra clientes de ejemplo', async () => {
    await h.navigateByUrl('/admin/clientes?busqueda=Ana');
    http.expectOne((q) => q.url === base).flush({}, { status: 503, statusText: 'Unavailable' });
    await render();
    expect(texto()).toContain('No pudimos cargar');
    const b = [...h.routeNativeElement!.querySelectorAll('button')].find(
      (b) => b.textContent!.trim() === 'Reintentar',
    )!;
    b.click();
    const r = http.expectOne((q) => q.url === base);
    expect(r.request.params.get('busqueda')).toBe('Ana');
    r.flush(listadoClienteFixture());
    await render();
    expect(texto()).toContain('Lucía Fernández');
  });
  it('detalle carga tablas con páginas independientes y conserva filtros en la vuelta', async () => {
    await ficha('?busqueda=Lucia&tipo=registrado&pagina=2&paginaPedidos=2&paginaDirecciones=3');
    http
      .expectOne((q) => q.url.endsWith('/pedidos') && q.params.get('pagina') === '2')
      .flush({ pedidos: [], paginacion: { pagina: 2, limite: 20, total: 1, paginas: 1 } });
    http
      .expectOne((q) => q.url.endsWith('/direcciones') && q.params.get('pagina') === '3')
      .flush({ direcciones: [], paginacion: { pagina: 3, limite: 20, total: 1, paginas: 1 } });
    await render();
    expect(texto()).toContain('Pagos aprobados');
    expect(texto()).toContain('10.30');
    expect(texto()).toContain('Otra persona');
    const href = h.routeNativeElement!.querySelector('.volver')!.getAttribute('href')!;
    expect(href).toContain('busqueda=Lucia');
    expect(href).toContain('pagina=2');
    expect(h.routeNativeElement!.querySelectorAll('nav').length).toBe(2);
  });
  it('un fallo parcial conserva contacto, importe y direcciones con reintento específico', async () => {
    await ficha();
    http
      .expectOne((q) => q.url.endsWith('/pedidos'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne((q) => q.url.endsWith('/direcciones')).flush(direccionesClienteFixture());
    await render();
    expect(texto()).toContain('Moche');
    expect(texto()).toContain('Lucía Fernández');
    const b = [...h.routeNativeElement!.querySelectorAll('button')].find(
      (b) => b.textContent!.trim() === 'Reintentar historial',
    )!;
    b.click();
    http.expectOne((q) => q.url.endsWith('/pedidos')).flush(pedidosClienteFixture());
    await render();
    expect(texto()).toContain('Pago aprobado');
    expect(texto()).toContain('Cancelado');
    const href = h.routeNativeElement!.querySelector('.pedido a')!.getAttribute('href')!;
    expect(href).toContain('clienteOrigen=' + ID_CLIENTE);
  });
  it('404 muestra ausencia real y no reutiliza datos de otra ficha', async () => {
    await h.navigateByUrl('/admin/clientes/' + ID_CLIENTE);
    http.expectOne(base + '/' + ID_CLIENTE).flush({}, { status: 404, statusText: 'Not found' });
    await render();
    expect(texto()).toContain('Cliente no encontrado');
    expect(texto()).not.toContain('Lucía');
    http.expectNone((q) => q.url.endsWith('/pedidos'));
  });
});
