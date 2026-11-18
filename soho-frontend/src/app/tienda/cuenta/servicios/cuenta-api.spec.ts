import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { CuentaApi } from './cuenta-api';
import { EstadoAutenticacion } from './estado-autenticacion';
import { autenticacionInterceptor } from './autenticacion-interceptor';

const usuario = {
  id: 'cliente-prueba',
  nombres: 'Ana',
  apellidos: 'Pérez',
  correo: 'ana@soho.test',
  rol: 'CLIENTE' as const,
  correoVerificado: false,
};
const token = 'a'.repeat(64);
const nuevoToken = 'b'.repeat(64);

describe('CuentaApi y protección de solicitudes', () => {
  let api: CuentaApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    api = TestBed.inject(CuentaApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });
  const csrf = () => {
    const r = http.expectOne('/api/auth/csrf');
    expect(r.request.withCredentials).toBe(true);
    r.flush({ csrfToken: token });
  };

  it('restaura /me una sola vez para comprobaciones concurrentes, sin datos locales', async () => {
    const a = api.comprobarSesion();
    const b = api.comprobarSesion();
    expect(a).toBe(b);
    const r = http.expectOne('/api/auth/me');
    expect(r.request.withCredentials).toBe(true);
    expect(r.request.headers.has('X-CSRF-Token')).toBe(false);
    r.flush({ usuario });
    await a;
    expect(api.perfil()).toMatchObject({ id: usuario.id, rol: 'CLIENTE', verificado: false });
    expect(api.estadoSesion()).toBe('autenticado');
  });
  it.each([401, 503])('distingue ausencia de sesión de fallo del servidor: %i', async (status) => {
    const consulta = api.comprobarSesion();
    http.expectOne('/api/auth/me').flush({}, { status, statusText: 'Error' });
    await consulta;
    expect(api.perfil()).toBeNull();
    expect(api.estadoSesion()).toBe(status === 401 ? 'anonimo' : 'error');
  });
  it('revalidar la misma sesión conserva el perfil, las direcciones y la revisión', async () => {
    const estado = TestBed.inject(EstadoAutenticacion);
    estado.aceptar(usuario);
    const perfil = api.perfil();
    const direcciones = api.direcciones();
    const revision = estado.revision;
    const consulta = api.comprobarSesion(true);
    http.expectOne('/api/auth/me').flush({ usuario: { ...usuario } });
    await consulta;
    expect(api.perfil()).toBe(perfil);
    expect(api.direcciones()).toBe(direcciones);
    expect(estado.revision).toBe(revision);
    expect(api.estadoSesion()).toBe('autenticado');
  });
  it.each([
    { nombres: 'Otro nombre' },
    { apellidos: 'Otro apellido' },
    { correo: 'actualizado@soho.test' },
    { correoVerificado: true },
    { rol: 'ADMIN' },
  ])('revalidar incorpora los cambios reales del perfil: %o', async (cambio) => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const anterior = api.perfil();
    const consulta = api.comprobarSesion(true);
    http.expectOne('/api/auth/me').flush({ usuario: { ...usuario, ...cambio } });
    await consulta;
    expect(api.perfil()).not.toBe(anterior);
    expect(api.perfil()?.id).toBe(usuario.id);
    expect(api.estadoSesion()).toBe('autenticado');
  });
  it('una nueva autenticación conserva la invalidación de contexto aunque sea la misma cuenta', async () => {
    const estado = TestBed.inject(EstadoAutenticacion);
    estado.aceptar(usuario);
    const anterior = api.perfil();
    const acceso = api.ingresar(usuario.correo, 'contraseña sintética');
    csrf();
    http.expectOne('/api/auth/login').flush({ usuario: { ...usuario }, csrfToken: nuevoToken });
    expect((await acceso).correcto).toBe(true);
    expect(api.perfil()).not.toBe(anterior);
    expect(estado.revision).toBeGreaterThan(0);
  });
  it('focus y visibilitychange comparten una comprobación sin emitir otra sesión', async () => {
    let ahora = 100000;
    vi.spyOn(Date, 'now').mockImplementation(() => ahora);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    api.iniciar();
    const inicial = api.comprobarSesion();
    http.expectOne('/api/auth/me').flush({ usuario });
    await inicial;
    const perfil = api.perfil();
    ahora += 11000;
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    const consulta = api.comprobarSesion();
    http.expectOne('/api/auth/me').flush({ usuario: { ...usuario } });
    await consulta;
    expect(api.perfil()).toBe(perfil);
    window.dispatchEvent(new Event('focus'));
    http.expectNone('/api/auth/me');
  });
  it.each([
    [401, '/iniciar-sesion'],
    [503, '/sesion-no-disponible'],
  ] as const)('al volver conserva la salida segura si /me devuelve %i', async (status, destino) => {
    let ahora = 100000;
    vi.spyOn(Date, 'now').mockImplementation(() => ahora);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/admin/productos');
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    api.iniciar();
    const inicial = api.comprobarSesion();
    http.expectOne('/api/auth/me').flush({ usuario: { ...usuario, rol: 'ADMIN' } });
    await inicial;
    ahora += 11000;
    window.dispatchEvent(new Event('focus'));
    const consulta = api.comprobarSesion();
    http.expectOne('/api/auth/me').flush({}, { status, statusText: 'Error' });
    await consulta;
    await Promise.resolve();
    expect(api.perfil()).toBeNull();
    expect(navegar).toHaveBeenCalledWith([destino], expect.any(Object));
  });
  it('registra solo los cuatro campos del contrato, inicia sesión y utiliza el CSRF rotado al salir', async () => {
    const clave = ' contraseña de prueba segura ';
    const entrada = {
      nombres: ' Ana ',
      apellidos: ' Pérez ',
      correo: ' ANA@SOHO.TEST ',
      clave,
      confirmacion: clave,
    };
    const resultado = api.registrar(entrada);
    csrf();
    const r = http.expectOne('/api/auth/registro');
    expect(r.request.body).toEqual({
      nombres: 'Ana',
      apellidos: 'Pérez',
      correo: usuario.correo,
      clave,
    });
    expect(r.request.headers.get('X-CSRF-Token')).toBe(token);
    r.flush({ usuario, csrfToken: nuevoToken });
    expect((await resultado).correcto).toBe(true);
    const salida = api.cerrarSesion();
    const salir = http.expectOne('/api/auth/logout');
    expect(salir.request.headers.get('X-CSRF-Token')).toBe(nuevoToken);
    expect(salir.request.body).toEqual({});
    salir.flush(null, { status: 204, statusText: 'No Content' });
    expect((await salida).correcto).toBe(true);
    expect(api.perfil()).toBeNull();
  });
  it('conserva la sesión si no se puede confirmar el cierre en el servidor', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const salida = api.cerrarSesion();
    csrf();
    http.expectOne('/api/auth/logout').flush({}, { status: 503, statusText: 'No disponible' });
    expect((await salida).correcto).toBe(false);
    expect(api.perfil()?.id).toBe(usuario.id);
  });
  it('considera completado un cierre cuando el servidor ya no reconoce la sesión', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const salida = api.cerrarSesion();
    csrf();
    http.expectOne('/api/auth/logout').flush({}, { status: 401, statusText: 'Sin sesión' });
    expect((await salida).correcto).toBe(true);
    expect(api.perfil()).toBeNull();
  });
  it('cancela una restauración pendiente al iniciar otra sesión', async () => {
    const restauracion = api.comprobarSesion();
    const anterior = http.expectOne('/api/auth/me');
    const acceso = api.ingresar(usuario.correo, 'contraseña sintética');
    expect(anterior.cancelled).toBe(true);
    csrf();
    http.expectOne('/api/auth/login').flush({ usuario, csrfToken: nuevoToken });
    await Promise.all([restauracion, acceso]);
    expect(api.perfil()?.id).toBe(usuario.id);
    expect(api.estadoSesion()).toBe('autenticado');
  });
  it('no repite escrituras tras un 403 y recupera CSRF en el siguiente intento manual', async () => {
    const acceso = api.ingresar(usuario.correo, 'contraseña sintética');
    csrf();
    http.expectOne('/api/auth/login').flush({}, { status: 403, statusText: 'CSRF' });
    expect((await acceso).correcto).toBe(false);
    http.expectNone('/api/auth/login');
    const reintento = api.ingresar(usuario.correo, 'contraseña sintética');
    csrf();
    http.expectOne('/api/auth/login').flush({ usuario, csrfToken: nuevoToken });
    expect((await reintento).correcto).toBe(true);
  });
  it('comparte un único bootstrap CSRF entre escrituras concurrentes', () => {
    const cliente = TestBed.inject(HttpClient);
    cliente.post('/api/prueba/a', {}).subscribe();
    cliente.post('/api/prueba/b', {}).subscribe();
    csrf();
    for (const ruta of ['/api/prueba/a', '/api/prueba/b']) {
      const r = http.expectOne(ruta);
      expect(r.request.headers.get('X-CSRF-Token')).toBe(token);
      r.flush({});
    }
  });
  it('nunca envía credenciales ni token CSRF a otra URL', () => {
    TestBed.inject(HttpClient).post('https://externo.test/api/prueba', {}).subscribe();
    const r = http.expectOne('https://externo.test/api/prueba');
    expect(r.request.withCredentials).toBe(false);
    expect(r.request.headers.has('X-CSRF-Token')).toBe(false);
    r.flush({});
    http.expectNone('/api/auth/csrf');
  });
  it('invalida el estado al recibir un 401 en una solicitud protegida', () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    TestBed.inject(HttpClient)
      .get('/api/prueba/privada')
      .subscribe({ error: () => undefined });
    http.expectOne('/api/prueba/privada').flush({}, { status: 401, statusText: 'Expirada' });
    expect(api.perfil()).toBeNull();
    expect(api.estadoSesion()).toBe('anonimo');
  });
  it.each([401, 409, 429])(
    'presenta errores del acceso sin crear una sesión: %i',
    async (status) => {
      const acceso = api.ingresar(usuario.correo, 'contraseña sintética');
      csrf();
      http.expectOne('/api/auth/login').flush({}, { status, statusText: 'Error' });
      expect((await acceso).correcto).toBe(false);
      expect(api.perfil()).toBeNull();
      expect(api.estadoSesion()).toBe('anonimo');
    },
  );
  it('rechaza una respuesta con un rol desconocido', async () => {
    const acceso = api.ingresar(usuario.correo, 'contraseña sintética');
    csrf();
    http
      .expectOne('/api/auth/login')
      .flush({ usuario: { ...usuario, rol: 'PROPIETARIO' }, csrfToken: nuevoToken });
    expect((await acceso).correcto).toBe(false);
    expect(api.perfil()).toBeNull();
  });
});
