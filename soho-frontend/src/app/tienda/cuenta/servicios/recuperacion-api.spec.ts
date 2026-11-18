import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CuentaApi } from './cuenta-api';
import { EstadoAutenticacion } from './estado-autenticacion';
import { autenticacionInterceptor } from './autenticacion-interceptor';

const usuario = {
  id: 'recuperacion',
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'ana@soho.test',
  rol: 'CLIENTE' as const,
  correoVerificado: false,
};
const token = 'a'.repeat(43);
describe('Recuperación de contraseña y sesión', () => {
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
  afterEach(() => http.verify());
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
  it('solicita por POST con CSRF y devuelve un mensaje uniforme sin aceptar detalles del servidor', async () => {
    const resultado = api.solicitarRecuperacion(' ANA@SOHO.TEST ');
    csrf();
    const r = http.expectOne('/api/auth/recuperacion');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ correo: usuario.correo });
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    r.flush(
      { mensaje: 'Detalle privado', token: 'nunca-publicar' },
      { status: 202, statusText: 'Accepted' },
    );
    expect(await resultado).toEqual({
      correcto: true,
      mensaje:
        'Si existe una cuenta con contraseña para ese correo, recibirás instrucciones para restablecerla.',
    });
  });
  it('comprueba el token solo en el cuerpo POST y distingue enlace inválido de fallo de conexión', async () => {
    const a = api.comprobarRecuperacion(token);
    csrf();
    const r = http.expectOne('/api/auth/recuperacion/comprobar');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ token });
    r.flush({ vigente: false });
    expect(await a).toMatchObject({ correcto: true, vigente: false });
    const b = api.comprobarRecuperacion(token);
    http
      .expectOne('/api/auth/recuperacion/comprobar')
      .flush({ mensaje: 'detalle privado' }, { status: 503, statusText: 'Error' });
    expect(await b).toMatchObject({
      correcto: false,
      vigente: false,
      mensaje: expect.not.stringContaining('privado'),
    });
  });
  it('restablecer cancela /me, conserva la clave literal y cierra el estado local sin iniciar sesión', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const comprobar = api.comprobarSesion(true);
    const me = http.expectOne('/api/auth/me');
    const clave = ' clave nueva para pruebas ';
    const restablecer = api.restablecer(token, clave);
    expect(me.cancelled).toBe(true);
    csrf();
    const r = http.expectOne('/api/auth/recuperacion/restablecer');
    expect(r.request.body).toEqual({ token, clave });
    r.flush({ mensaje: 'Contraseña actualizada' });
    expect((await restablecer).correcto).toBe(true);
    await comprobar;
    expect(api.perfil()).toBeNull();
    expect(api.estadoSesion()).toBe('anonimo');
    http.expectNone('/api/auth/login');
    const solicitud = api.solicitarRecuperacion(usuario.correo);
    csrf();
    http.expectOne('/api/auth/recuperacion').flush({}, { status: 202, statusText: 'Accepted' });
    await solicitud;
  });
  it('un enlace consumido informa el error sin borrar una sesión ajena al restablecimiento fallido', async () => {
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    const resultado = api.restablecer(token, 'contraseña nueva de prueba');
    csrf();
    http
      .expectOne('/api/auth/recuperacion/restablecer')
      .flush({ codigo: 'RECUPERACION_ENLACE_INVALIDO' }, { status: 400, statusText: 'Error' });
    expect(await resultado).toMatchObject({ correcto: false, codigo: 'enlace-invalido' });
    expect(api.perfil()?.id).toBe(usuario.id);
  });
  it.each([401, 429, 503])(
    'no reintenta automáticamente y no cierra la sesión ante errores de la ruta pública: %i',
    async (status) => {
      TestBed.inject(EstadoAutenticacion).aceptar(usuario);
      const r = api.solicitarRecuperacion(usuario.correo);
      csrf();
      http
        .expectOne('/api/auth/recuperacion')
        .flush({ message: 'detalle privado' }, { status, statusText: 'Error' });
      expect((await r).correcto).toBe(false);
      expect(api.perfil()?.id).toBe(usuario.id);
      http.expectNone('/api/auth/recuperacion');
    },
  );
});
