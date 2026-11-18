import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CuentaApi } from './cuenta-api';
import { EstadoAutenticacion } from './estado-autenticacion';
import { autenticacionInterceptor } from './autenticacion-interceptor';

const usuario = {
  id: 'cliente',
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'ana@soho.test',
  rol: 'CLIENTE' as const,
  correoVerificado: true,
};
const datos = { nombres: ' María José ', apellidos: ' O’Connor Pérez ', celular: '987654321' };
describe('Edición de perfil por API', () => {
  let api: CuentaApi, http: HttpTestingController, estado: EstadoAutenticacion;
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
    estado = TestBed.inject(EstadoAutenticacion);
    estado.aceptar(usuario);
  });
  afterEach(() => http.verify());
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
  it('envía exclusivamente nombres y apellidos con CSRF y adopta el perfil confirmado', async () => {
    const pendiente = api.guardarPerfil(datos);
    csrf();
    const r = http.expectOne('/api/auth/me');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.withCredentials).toBe(true);
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    expect(r.request.body).toEqual({ nombres: 'María José', apellidos: 'O’Connor Pérez' });
    expect(api.perfil()?.nombres).toBe('Ana');
    r.flush({ usuario: { ...usuario, nombres: 'María José', apellidos: 'O’Connor Pérez' } });
    expect((await pendiente).correcto).toBe(true);
    expect(api.perfil()).toMatchObject({
      nombres: 'María José',
      apellidos: 'O’Connor Pérez',
      rol: 'CLIENTE',
      verificado: true,
    });
  });
  it('cancela consultas del perfil anteriores y pendientes al confirmar el guardado', async () => {
    const primero = api.comprobarSesion(true),
      anterior = http.expectOne('/api/auth/me');
    const pendiente = api.guardarPerfil(datos);
    csrf();
    const guardar = http.expectOne('/api/auth/me');
    expect(anterior.cancelled).toBe(true);
    const segundo = api.comprobarSesion(true),
      durante = http.expectOne('/api/auth/me');
    guardar.flush({ usuario: { ...usuario, nombres: 'María José' } });
    expect((await pendiente).correcto).toBe(true);
    expect(durante.cancelled).toBe(true);
    await Promise.all([primero, segundo]);
    expect(api.perfil()?.nombres).toBe('María José');
  });
  it('una respuesta tardía no restaura la cuenta después de cerrar sesión', async () => {
    const pendiente = api.guardarPerfil(datos);
    csrf();
    const guardar = http.expectOne('/api/auth/me');
    const salir = api.cerrarSesion();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await salir;
    guardar.flush({ usuario: { ...usuario, nombres: 'Tardía' } });
    expect((await pendiente).correcto).toBe(false);
    expect(api.perfil()).toBeNull();
  });
  it('rechaza un perfil que corresponda a otra cuenta', async () => {
    const pendiente = api.guardarPerfil(datos);
    csrf();
    http.expectOne('/api/auth/me').flush({ usuario: { ...usuario, id: 'otra' } });
    expect((await pendiente).correcto).toBe(false);
    expect(api.perfil()?.id).toBe(usuario.id);
  });
  it.each([400, 403, 503])(
    'conserva los datos ante error %i y no reintenta ni publica detalles',
    async (status) => {
      const pendiente = api.guardarPerfil(datos);
      csrf();
      http
        .expectOne('/api/auth/me')
        .flush({ message: 'SQL privado' }, { status, statusText: 'Error' });
      const r = await pendiente;
      expect(r.correcto).toBe(false);
      expect(r.mensaje).not.toContain('SQL');
      expect(api.perfil()?.nombres).toBe('Ana');
      http.expectNone('/api/auth/me');
    },
  );
  it('retira la cuenta si el guardado recibe una sesión vencida', async () => {
    const pendiente = api.guardarPerfil(datos);
    csrf();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect((await pendiente).mensaje).toContain('sesión ha vencido');
    expect(api.perfil()).toBeNull();
  });
});
