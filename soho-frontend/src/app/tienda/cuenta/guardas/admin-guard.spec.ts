import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { autenticacionInterceptor } from '../servicios/autenticacion-interceptor';
import { adminGuard } from './admin-guard';
import { cuentaGuard } from './cuenta-guard';

describe('Guardas con sesión real de API', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const ejecutar = (guarda = adminGuard, url = '/admin/productos') =>
    TestBed.runInInjectionContext(() =>
      guarda({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  const serializar = (resultado: unknown) =>
    TestBed.inject(Router).serializeUrl(resultado as UrlTree);
  const usuario = (rol: string) => ({
    id: 'prueba',
    nombres: 'Ana',
    apellidos: 'Pérez',
    correo: 'ana@prueba.test',
    rol,
    correoVerificado: false,
  });
  it('espera la restauración antes de permitir ADMIN', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/me').flush({ usuario: usuario('ADMIN') });
    expect(await resultado).toBe(true);
  });
  it('bloquea CLIENTE y vuelve a consultar el rol al navegar', async () => {
    const primera = ejecutar();
    http.expectOne('/api/auth/me').flush({ usuario: usuario('ADMIN') });
    expect(await primera).toBe(true);
    const segunda = ejecutar();
    http.expectOne('/api/auth/me').flush({ usuario: usuario('CLIENTE') });
    expect(serializar(await segunda)).toBe('/sin-permiso');
  });
  it('conserva la ruta administrativa al pedir iniciar sesión', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Sin sesión' });
    expect(serializar(await resultado)).toBe('/iniciar-sesion?volver=%2Fadmin%2Fproductos');
  });
  it('permite a un CLIENTE abrir su cuenta', async () => {
    const resultado = ejecutar(cuentaGuard, '/mi-cuenta');
    http.expectOne('/api/auth/me').flush({ usuario: usuario('CLIENTE') });
    expect(await resultado).toBe(true);
  });
  it('un fallo de red conduce al estado recuperable y no concede acceso', async () => {
    const resultado = ejecutar();
    http.expectOne('/api/auth/me').flush({}, { status: 503, statusText: 'Sin conexión' });
    expect(serializar(await resultado)).toBe('/sesion-no-disponible?volver=%2Fadmin%2Fproductos');
  });
});
