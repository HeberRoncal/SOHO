import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientesAdministracionApi } from './clientes-administracion-api';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import {
  detalleClienteFixture,
  direccionesClienteFixture,
  ID_CLIENTE,
  ID_OTRO,
  listadoClienteFixture,
  pedidosClienteFixture,
} from '../modelos/consulta-clientes.fixtures';
describe('Consultas administrativas reales de Clientes', () => {
  let api: ClientesAdministracionApi, http: HttpTestingController;
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
    api = TestBed.inject(ClientesAdministracionApi);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  const ruta = '/api/admin/clientes';
  async function ficha() {
    const p = api.cargarDetalle(ID_CLIENTE);
    http.expectOne(ruta + '/' + ID_CLIENTE).flush(detalleClienteFixture());
    await p;
  }
  it('envía filtros al backend y usa sus conteos completos', async () => {
    const p = api.cargarListado({
      busqueda: 'lucía',
      tipo: 'registrado',
      orden: 'pedidos',
      pagina: '1',
    });
    const r = http.expectOne((q) => q.url === ruta);
    expect(r.request.params.get('busqueda')).toBe('lucía');
    expect(r.request.params.get('tipo')).toBe('registrado');
    r.flush(listadoClienteFixture());
    await p;
    expect(api.clientes()).toHaveLength(1);
    expect(api.resumen()?.total).toBe(3);
  });
  it('cancela consultas anteriores sin sobrescribir la búsqueda vigente', async () => {
    const a = api.cargarListado({ busqueda: 'vieja' }),
      r = http.expectOne((q) => q.params.get('busqueda') === 'vieja');
    const b = api.cargarListado({ busqueda: 'nueva' });
    expect(r.cancelled).toBe(true);
    http.expectOne((q) => q.params.get('busqueda') === 'nueva').flush(listadoClienteFixture());
    await Promise.all([a, b]);
    expect(api.clientes()[0].nombre).toBe('Lucía Fernández');
  });
  it('limpia los datos inmediatamente al cambiar la cuenta y cancela consultas', async () => {
    await ficha();
    const p = api.cargarPedidos(ID_CLIENTE),
      r = http.expectOne((q) => q.url.endsWith('/pedidos'));
    perfil.set({ id: 'admin-b', rol: 'ADMIN' });
    expect(api.cliente()).toBeNull();
    TestBed.tick();
    await p;
    expect(r.cancelled).toBe(true);
    expect(api.pedidos()).toEqual([]);
  });
  it('no hace peticiones sin ADMIN ni recurre a demostración', async () => {
    perfil.set({ id: 'cliente', rol: 'CLIENTE' });
    TestBed.tick();
    await api.cargarListado();
    http.expectNone(ruta);
    expect(api.clientes()).toEqual([]);
    expect(api.estados.listado()).toBe('sin-permiso');
  });
  it('retira ficha, conteos y páginas al perder la sesión sin dejar la pantalla cargando', async () => {
    await ficha();
    perfil.set(null);
    expect(api.cliente()).toBeNull();
    expect(api.paginaListado().total).toBe(0);
    expect(api.paginaPedidos().total).toBe(0);
    TestBed.tick();
    expect(api.estados.detalle()).toBe('sin-permiso');
    expect(api.resumen()).toBeNull();
  });
  it('retira la ficha anterior al abrir otra y distingue 404 de 503', async () => {
    await ficha();
    const p = api.cargarDetalle(ID_OTRO);
    expect(api.cliente()).toBeNull();
    http.expectOne(ruta + '/' + ID_OTRO).flush({}, { status: 404, statusText: 'Not found' });
    await p;
    expect(api.estados.detalle()).toBe('ausente');
    const q = api.cargarDetalle(ID_CLIENTE);
    http.expectOne(ruta + '/' + ID_CLIENTE).flush({}, { status: 503, statusText: 'Unavailable' });
    await q;
    expect(api.estados.detalle()).toBe('error');
  });
  it('rechaza la respuesta de una ficha distinta de la pedida', async () => {
    const p = api.cargarDetalle(ID_OTRO);
    http.expectOne(ruta + '/' + ID_OTRO).flush(detalleClienteFixture());
    await p;
    expect(api.cliente()).toBeNull();
    expect(api.estados.detalle()).toBe('error');
  });
  it('consulta pedidos y direcciones con paginaciones independientes', async () => {
    await ficha();
    const p = api.cargarPedidos(ID_CLIENTE),
      d = api.cargarDirecciones(ID_CLIENTE);
    http
      .expectOne((q) => q.url.endsWith('/pedidos') && q.params.get('pagina') === '1')
      .flush(pedidosClienteFixture());
    http
      .expectOne((q) => q.url.endsWith('/direcciones') && q.params.get('pagina') === '1')
      .flush(direccionesClienteFixture());
    await Promise.all([p, d]);
    expect(api.pedidos()[0].estadoEntrega).toBe('cancelado');
    expect(api.direcciones()[0].distritoCodigo).toBe('moche');
    expect(api.cliente()?.resumen.pagosAprobados).toBe('10.30');
  });
  it('reintenta una sola tabla sin retirar la ficha ni recargar otras consultas', async () => {
    await ficha();
    let p = api.cargarPedidos(ID_CLIENTE);
    http
      .expectOne((q) => q.url.endsWith('/pedidos'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(api.cliente()?.identificador).toBe(ID_CLIENTE);
    p = api.cargarPedidos(ID_CLIENTE);
    http.expectOne((q) => q.url.endsWith('/pedidos')).flush(pedidosClienteFixture());
    await p;
    expect(api.estados.pedidos()).toBe('lista');
    http.expectNone(ruta + '/' + ID_CLIENTE);
  });
  it.each([401, 403])('retira todos los datos privados ante %i', async (status) => {
    await ficha();
    const p = api.cargarPedidos(ID_CLIENTE),
      d = api.cargarDirecciones(ID_CLIENTE),
      r = http.expectOne((q) => q.url.endsWith('/direcciones'));
    http
      .expectOne((q) => q.url.endsWith('/pedidos'))
      .flush({}, { status, statusText: 'Forbidden' });
    await Promise.all([p, d]);
    expect(r.cancelled).toBe(true);
    expect(api.cliente()).toBeNull();
    expect(api.clientes()).toEqual([]);
    expect(api.pedidos()).toEqual([]);
    expect(api.estados.detalle()).toBe('sin-permiso');
  });
  it('invalida la ficha si una subconsulta devuelve 404', async () => {
    await ficha();
    const p = api.cargarPedidos(ID_CLIENTE);
    http
      .expectOne((q) => q.url.endsWith('/pedidos'))
      .flush({}, { status: 404, statusText: 'Not found' });
    await p;
    expect(api.cliente()).toBeNull();
    expect(api.estados.detalle()).toBe('ausente');
  });
  it('cancela todas las consultas del detalle al salir de la pantalla', async () => {
    await ficha();
    const p = api.cargarPedidos(ID_CLIENTE),
      r = http.expectOne((q) => q.url.endsWith('/pedidos'));
    api.salirDetalle();
    await p;
    expect(r.cancelled).toBe(true);
    expect(api.cliente()).toBeNull();
  });
  it('no envía identificadores invitados por correo al backend', async () => {
    await api.cargarDetalle('invitado:correo@example.test');
    http.expectNone((q) => q.url.startsWith(ruta));
    expect(api.estados.detalle()).toBe('ausente');
  });
  it('rechaza contratos incoherentes y recupera un error de listado', async () => {
    let p = api.cargarListado({ tipo: 'invitado' });
    http.expectOne((q) => q.url === ruta).flush({});
    await p;
    expect(api.estados.listado()).toBe('error');
    p = api.cargarListado({ tipo: 'invitado' });
    http.expectOne((q) => q.params.get('tipo') === 'invitado').flush(listadoClienteFixture());
    await p;
    expect(api.estados.listado()).toBe('lista');
  });
  it('muestra espera específica por límite de consultas', async () => {
    const p = api.cargarListado();
    http.expectOne(ruta).flush({}, { status: 429, statusText: 'Too many' });
    await p;
    expect(api.mensajes.listado()).toContain('Espera');
  });
  it('la revisión de sesión evita aceptar respuestas de una sesión anterior', async () => {
    const p = api.cargarListado();
    const r = http.expectOne(ruta);
    TestBed.inject(EstadoAutenticacion).revision++;
    r.flush(listadoClienteFixture());
    await p;
    expect(api.clientes()).toEqual([]);
    expect(api.resumen()).toBeNull();
  });
});
