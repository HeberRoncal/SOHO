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
  correoVerificado: false,
};
const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.' + 'a'.repeat(43);
describe('API de verificación de correo', () => {
  let api: CuentaApi, http: HttpTestingController;
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
  afterEach(() => http.verify());
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
  it('comprueba por POST con CSRF y no publica el token ni datos del servidor', async () => {
    const pendiente = api.comprobarVerificacion(token);
    csrf();
    const r = http.expectOne('/api/auth/verificacion/comprobar');
    expect(r.request.body).toEqual({ token });
    expect(r.request.method).toBe('POST');
    expect(r.request.withCredentials).toBe(true);
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    r.flush({ vigente: true, token: 'privado' });
    expect(await pendiente).toEqual({ correcto: true, vigente: true, mensaje: '' });
  });
  it('reenvía solo para el usuario de la sesión sin enviar otro correo o ID', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const pendiente = api.reenviarVerificacion();
    csrf();
    const r = http.expectOne('/api/auth/verificacion/reenviar');
    expect(r.request.body).toEqual({});
    r.flush({ mensaje: 'privado' }, { status: 202, statusText: 'Accepted' });
    expect(await pendiente).toMatchObject({
      correcto: true,
      mensaje: expect.stringContaining('Si tu correo'),
    });
  });
  it('confirmar consulta únicamente la cuenta autenticada y conserva la sesión y su rol', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const pendiente = api.verificar(token);
    csrf();
    http.expectOne('/api/auth/verificacion/confirmar').flush({ usuario: { rol: 'ADMIN' } });
    await vi.waitFor(() =>
      http.expectOne('/api/auth/me').flush({ usuario: { ...usuario, correoVerificado: true } }),
    );
    expect((await pendiente).correcto).toBe(true);
    expect(api.perfil()).toMatchObject({ id: usuario.id, rol: 'CLIENTE', verificado: true });
    http.expectNone('/api/auth/login');
  });
  it('descarta una consulta de perfil anterior a la confirmación y obtiene el estado actualizado', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const consultaAnterior = api.comprobarSesion(true);
    const anterior = http.expectOne('/api/auth/me');
    const pendiente = api.verificar(token);
    csrf();
    http.expectOne('/api/auth/verificacion/confirmar').flush({});
    await vi.waitFor(() =>
      http.expectOne('/api/auth/me').flush({ usuario: { ...usuario, correoVerificado: true } }),
    );
    expect(anterior.cancelled).toBe(true);
    await consultaAnterior;
    expect((await pendiente).correcto).toBe(true);
    expect(api.perfil()?.verificado).toBe(true);
  });
  it('confirmar sin sesión no crea un perfil ni inicia sesión automáticamente', async () => {
    const pendiente = api.verificar(token);
    csrf();
    http.expectOne('/api/auth/verificacion/confirmar').flush({ usuario });
    expect((await pendiente).correcto).toBe(true);
    expect(api.perfil()).toBeNull();
    http.expectNone('/api/auth/me');
    http.expectNone('/api/auth/login');
  });
  it.each([400, 503, 429])(
    'errores %i no provocan reintentos ni publican detalles',
    async (status) => {
      const pendiente = api.verificar(token);
      csrf();
      http.expectOne('/api/auth/verificacion/confirmar').flush(
        {
          codigo: status === 400 ? 'VERIFICACION_ENLACE_INVALIDO' : undefined,
          message: 'SQL privado',
        },
        { status, statusText: 'Error' },
      );
      const r = await pendiente;
      expect(r.correcto).toBe(false);
      expect(r.mensaje).not.toContain('SQL');
      if (status === 400) expect(r.codigo).toBe('enlace-invalido');
      http.expectNone('/api/auth/verificacion/confirmar');
    },
  );
});
