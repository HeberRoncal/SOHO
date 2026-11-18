import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { GoogleCuentaApi } from './google-cuenta-api';
import { CuentaApi } from './cuenta-api';
import { EstadoAutenticacion } from './estado-autenticacion';
import { autenticacionInterceptor } from './autenticacion-interceptor';

const usuario = {
  id: 'google-prueba',
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'ana@gmail.com',
  rol: 'CLIENTE' as const,
  correoVerificado: true,
};
describe('Google y la sesión de SOHO', () => {
  let api: GoogleCuentaApi;
  let cuenta: CuentaApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    api = TestBed.inject(GoogleCuentaApi);
    cuenta = TestBed.inject(CuentaApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
  it('intercambia la credencial con CSRF, cancela /me y usa la protección rotada al salir', async () => {
    const pendiente = cuenta.comprobarSesion();
    const me = http.expectOne('/api/auth/me');
    const entrada = api.ingresar('credencial-sintetica');
    expect(me.cancelled).toBe(true);
    csrf();
    const r = http.expectOne('/api/auth/google');
    expect(r.request.body).toEqual({ credential: 'credencial-sintetica' });
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    expect(r.request.withCredentials).toBe(true);
    r.flush({ usuario, csrfToken: 'b'.repeat(64) });
    expect((await entrada).tipo).toBe('correcto');
    await pendiente;
    expect(cuenta.perfil()?.id).toBe(usuario.id);
    const salida = cuenta.cerrarSesion();
    const salir = http.expectOne('/api/auth/logout');
    expect(salir.request.headers.get('X-CSRF-Token')).toBe('b'.repeat(64));
    salir.flush(null, { status: 204, statusText: 'No Content' });
    await salida;
  });
  it('devuelve el perfil incompleto y lo envía únicamente cuando el usuario lo confirma', async () => {
    const entrada = api.ingresar('credencial');
    csrf();
    const perfil = { nombres: 'Ana', apellidos: '', correo: usuario.correo };
    http
      .expectOne('/api/auth/google')
      .flush(
        { codigo: 'GOOGLE_COMPLETAR_PERFIL', perfil },
        { status: 422, statusText: 'Completar' },
      );
    expect(await entrada).toEqual({ tipo: 'completar', perfil });
    expect(cuenta.perfil()).toBeNull();
    const completa = api.ingresar('credencial', { nombres: 'Ana', apellidos: 'Prueba' });
    const r = http.expectOne('/api/auth/google');
    expect(r.request.body.perfil).toEqual({ nombres: 'Ana', apellidos: 'Prueba' });
    r.flush({ usuario, csrfToken: 'b'.repeat(64) });
    expect((await completa).tipo).toBe('correcto');
  });
  it('exige contraseña para vincular y mantiene la sesión ante una contraseña incorrecta', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const enlace = api.vincular('credencial', 'clave actual');
    csrf();
    const r = http.expectOne('/api/auth/google/vinculacion');
    expect(r.request.body).toEqual({ credential: 'credencial', clave: 'clave actual' });
    r.flush({ codigo: 'GOOGLE_REAUTENTICACION_REQUERIDA' }, { status: 403, statusText: 'Error' });
    expect(await enlace).toMatchObject({
      tipo: 'error',
      mensaje: expect.stringContaining('contraseña'),
    });
    expect(cuenta.perfil()?.id).toBe(usuario.id);
  });
  it('no publica mensajes internos ni acepta roles diferentes de ADMIN o CLIENTE', async () => {
    const entrada = api.ingresar('credencial');
    csrf();
    http
      .expectOne('/api/auth/google')
      .flush({ usuario: { ...usuario, rol: 'OWNER' }, csrfToken: 'b'.repeat(64) });
    expect((await entrada).tipo).toBe('error');
    expect(cuenta.perfil()).toBeNull();
    const segundo = api.ingresar('credencial');
    http
      .expectOne('/api/auth/google')
      .flush({ message: 'SQL privado' }, { status: 503, statusText: 'Error' });
    expect(await segundo).toMatchObject({
      tipo: 'error',
      mensaje: expect.not.stringContaining('SQL'),
    });
  });
  it('una respuesta tardía no restaura la cuenta después de invalidar la sesión', async () => {
    const entrada = api.ingresar('credencial');
    csrf();
    TestBed.inject(EstadoAutenticacion).invalidar();
    http.expectOne('/api/auth/google').flush({ usuario, csrfToken: 'b'.repeat(64) });
    expect((await entrada).tipo).toBe('error');
    expect(cuenta.perfil()).toBeNull();
  });
});
