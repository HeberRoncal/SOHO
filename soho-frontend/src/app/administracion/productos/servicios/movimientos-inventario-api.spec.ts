import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { autenticacionInterceptor } from '../../../tienda/cuenta/servicios/autenticacion-interceptor';
import { MovimientosInventarioApi } from './movimientos-inventario-api';
import {
  datosMovimientoFixture,
  ID_ADMIN_MOVIMIENTO,
  respuestaMovimientoFixture,
  varianteMovimientoFixture,
} from '../modelos/movimientos-inventario.fixtures';
describe('Solicitudes de movimientos reales y recuperación', () => {
  let api: MovimientosInventarioApi, http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>(null),
    auth = { revision: 0, invalidar: vi.fn() };
  const base = '/api/admin/inventario',
    v = varianteMovimientoFixture(),
    ruta = base + '/variantes/' + v.id + '/movimientos';
  const micro = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  async function iniciar() {
    const p = api.registrar(v, datosMovimientoFixture());
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    await micro();
    return { p, r: http.expectOne(ruta) };
  }
  beforeEach(() => {
    sessionStorage.clear();
    perfil.set({ id: ID_ADMIN_MOVIMIENTO, rol: 'ADMIN' });
    auth.revision = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil } },
        { provide: EstadoAutenticacion, useValue: auth },
      ],
    });
    api = TestBed.inject(MovimientosInventarioApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });
  it('consulta por servidor filtros y página sin utilizar la página de productos', async () => {
    const p = api.buscar({ busqueda: 'NK', pagina: '2' });
    const r = http.expectOne(
      (q) =>
        q.url === base + '/variantes' &&
        q.params.get('pagina') === '2' &&
        q.params.get('busqueda') === 'NK',
    );
    r.flush({ variantes: [v], paginacion: { pagina: 2, limite: 20, total: 21, paginas: 2 } });
    expect((await p).variantes[0].id).toBe(v.id);
  });
  it('envía cookies/CSRF y recupera el estado vigente antes de borrar la clave', async () => {
    const { p, r } = await iniciar(),
      cuerpo = r.request.body;
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    expect(r.request.withCredentials).toBe(true);
    expect(cuerpo).not.toHaveProperty('sku');
    expect(api.pendiente()?.cuerpo.claveSolicitud).toBe(cuerpo.claveSolicitud);
    r.flush(respuestaMovimientoFixture(cuerpo));
    await micro();
    http
      .expectOne(base + '/variantes/' + v.id)
      .flush({ variante: { ...v, existencias: 9, versionExistencias: 3, disponible: 7 } });
    const resultado = await p;
    expect(resultado.movimiento.saldo).toBe(7);
    expect(resultado.actual.existencias).toBe(9);
    expect(api.pendiente()).toBeNull();
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    'conserva los campos fuera del servicio y libera la primera solicitud rechazada con %s',
    async (status) => {
      const { p, r } = await iniciar(),
        e = expect(p).rejects.toMatchObject({ estado: status, incierto: false });
      r.flush({}, { status, statusText: 'Rejected' });
      await e;
      expect(api.pendiente()).toBeNull();
    },
  );
  it.each([0, 500, 503])('conserva clave y cuerpo ante resultado incierto %s', async (status) => {
    const { p, r } = await iniciar(),
      cuerpo = structuredClone(r.request.body),
      e = expect(p).rejects.toMatchObject({ incierto: true });
    if (status === 0) r.error(new ProgressEvent('error'));
    else r.flush({}, { status, statusText: 'Lost' });
    await e;
    expect(api.pendiente()?.cuerpo).toEqual(cuerpo);
    await expect(api.registrar(v, datosMovimientoFixture())).rejects.toMatchObject({
      incierto: true,
    });
    http.expectNone(ruta);
  });
  it('no descarta una solicitud incierta por un 404 de recuperación', async () => {
    const { p, r } = await iniciar(),
      e = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await e;
    const clave = api.pendiente()!.cuerpo.claveSolicitud,
      q = api.recuperar(),
      fallo = expect(q).rejects.toMatchObject({ incierto: true });
    http
      .expectOne(base + '/movimientos/operaciones/' + clave)
      .flush({}, { status: 404, statusText: 'Not found' });
    await fallo;
    expect(api.pendiente()?.cuerpo.claveSolicitud).toBe(clave);
  });
  it('reintenta exactamente la misma clave y cuerpo sin cambiar la versión', async () => {
    const { p, r } = await iniciar(),
      cuerpo = structuredClone(r.request.body),
      e = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await e;
    const q = api.recuperar(true),
      retry = http.expectOne(ruta);
    expect(retry.request.body).toEqual(cuerpo);
    retry.flush(respuestaMovimientoFixture(cuerpo));
    await micro();
    http
      .expectOne(base + '/variantes/' + v.id)
      .flush({ variante: respuestaMovimientoFixture(cuerpo).variante });
    await q;
    expect(api.pendiente()).toBeNull();
  });
  it('mantiene la clave ante rechazo de un reintento previamente incierto', async () => {
    const { p, r } = await iniciar(),
      e = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await e;
    const q = api.recuperar(true),
      fallo = expect(q).rejects.toMatchObject({ incierto: true });
    http.expectOne(ruta).flush({}, { status: 409, statusText: 'Conflict' });
    await fallo;
    expect(api.pendiente()).not.toBeNull();
  });
  it('no pierde el COMMIT si falla la consulta vigente posterior', async () => {
    const { p, r } = await iniciar(),
      e = expect(p).rejects.toMatchObject({ incierto: true });
    r.flush(respuestaMovimientoFixture(r.request.body));
    await micro();
    http
      .expectOne(base + '/variantes/' + v.id)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await e;
    expect(api.pendiente()?.incierto).toBe(true);
  });
  it('rechaza respuestas de otra clave y conserva la solicitud recuperable', async () => {
    const { p, r } = await iniciar(),
      e = expect(p).rejects.toMatchObject({ incierto: true });
    const mal = respuestaMovimientoFixture(r.request.body);
    mal.operacion.claveSolicitud = crypto.randomUUID();
    r.flush(mal);
    await e;
    expect(api.pendiente()).not.toBeNull();
  });
  it('impide dos reintentos simultáneos de la misma solicitud', async () => {
    const { p, r } = await iniciar();
    const segundo = api.recuperar(true);
    await expect(segundo).rejects.toMatchObject({ incierto: true });
    const e = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await e;
  });
  it('aísla solicitudes por administrador y descarta respuestas de una sesión anterior', async () => {
    const { p, r } = await iniciar(),
      e = expect(p).rejects.toMatchObject({ incierto: true });
    perfil.set({ id: crypto.randomUUID(), rol: 'ADMIN' });
    r.flush(respuestaMovimientoFixture(r.request.body));
    await e;
    expect(api.pendiente()).toBeNull();
    perfil.set({ id: ID_ADMIN_MOVIMIENTO, rol: 'ADMIN' });
    expect(api.pendiente()).not.toBeNull();
  });
  it('bloquea nuevas escrituras si el registro pendiente está dañado', async () => {
    sessionStorage.setItem('soho:movimiento-inventario:' + ID_ADMIN_MOVIMIENTO, 'mal JSON');
    expect(() => api.pendiente()).toThrow();
    await expect(api.registrar(v, datosMovimientoFixture())).rejects.toMatchObject({
      incierto: true,
    });
    http.expectNone(ruta);
  });
  it('exige ADMIN antes de leer o enviar', async () => {
    perfil.set({ id: crypto.randomUUID(), rol: 'CLIENTE' });
    await expect(api.buscar()).rejects.toMatchObject({ estado: 403 });
    await expect(api.registrar(v, datosMovimientoFixture())).rejects.toMatchObject({ estado: 403 });
  });
  it('no envía si no puede guardar la solicitud recuperable en esta pestaña', async () => {
    const guardar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('sin almacenamiento');
    });
    try {
      await expect(api.registrar(v, datosMovimientoFixture())).rejects.toThrow('almacenamiento');
      http.expectNone(ruta);
      http.expectNone('/api/auth/csrf');
    } finally {
      guardar.mockRestore();
    }
  });
});
