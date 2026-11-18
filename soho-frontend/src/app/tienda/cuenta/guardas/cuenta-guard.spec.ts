import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { cuentaGuard } from './cuenta-guard';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

describe('cuentaGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => cuentaGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
  it('envía al acceso conservando la sección solicitada cuando no hay sesión', async () => {
    const resultado = executeGuard(
      {} as ActivatedRouteSnapshot,
      { url: '/mi-cuenta/pedidos' } as RouterStateSnapshot,
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush({}, { status: 401, statusText: 'Sin sesión' });
    expect(TestBed.inject(Router).serializeUrl((await resultado) as UrlTree)).toBe(
      '/iniciar-sesion?volver=%2Fmi-cuenta%2Fpedidos',
    );
  });
  it('permite entrar después de verificar la sesión con la API', async () => {
    const resultado = executeGuard(
      {} as ActivatedRouteSnapshot,
      { url: '/mi-cuenta/perfil' } as RouterStateSnapshot,
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush({
        usuario: {
          id: 'cliente-prueba',
          nombres: 'Ana',
          apellidos: 'Prueba',
          correo: 'ana@example.test',
          rol: 'CLIENTE',
          correoVerificado: true,
        },
      });
    expect(await resultado).toBe(true);
  });
  it('conserva el destino y bloquea el acceso si no puede comprobar la sesión', async () => {
    const resultado = executeGuard(
      {} as ActivatedRouteSnapshot,
      { url: '/mi-cuenta/pedidos' } as RouterStateSnapshot,
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush({}, { status: 503, statusText: 'Sin conexión' });
    expect(TestBed.inject(Router).serializeUrl((await resultado) as UrlTree)).toBe(
      '/sesion-no-disponible?volver=%2Fmi-cuenta%2Fpedidos',
    );
  });
});
