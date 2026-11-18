import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Acceso } from './acceso';
import { autenticacionInterceptor } from '../../servicios/autenticacion-interceptor';

@Component({ template: 'Otra pantalla' })
class OtraPrueba {}
const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.' + 'a'.repeat(43);
describe('Pantalla de verificación', () => {
  let http: HttpTestingController, harness: RouterTestingHarness;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'verificar-correo', component: Acceso, data: { vista: 'verificar' } },
          { path: 'otra', component: OtraPrueba },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Meta).removeTag('name="referrer"');
  });
  afterEach(() => http.verify());
  const abrir = async (fragmento = token) => {
    harness = await RouterTestingHarness.create('/verificar-correo#token=' + fragmento);
  };
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
  const estable = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  const confirmar = () =>
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('app-verificar-correo button')!
      .click();
  it('retira fragmento, comprueba sin consumir y confirma solo por acción del usuario', async () => {
    await abrir();
    expect(TestBed.inject(Location).path(true)).toBe('/verificar-correo');
    expect(TestBed.inject(Meta).getTag('name="referrer"')?.content).toBe('no-referrer');
    csrf();
    http.expectOne('/api/auth/verificacion/comprobar').flush({ vigente: true });
    await estable();
    http.expectNone('/api/auth/verificacion/confirmar');
    http.expectNone('/api/auth/google/configuracion');
    confirmar();
    confirmar();
    const r = http.expectOne('/api/auth/verificacion/confirmar');
    expect(r.request.body).toEqual({ token });
    r.flush({});
    await estable();
    expect(harness.routeNativeElement!.textContent).toContain(
      'Tu correo se verificó correctamente',
    );
    http.expectNone('/api/auth/login');
  });
  it('enlace ausente o mal formado no consulta la API', async () => {
    await abrir('incorrecto');
    await estable();
    http.expectNone('/api/auth/csrf');
    expect(harness.routeNativeElement!.textContent).toContain('Este enlace venció');
  });
  it('un fallo de comprobación permite reintentar con el token conservado en memoria', async () => {
    await abrir();
    csrf();
    http
      .expectOne('/api/auth/verificacion/comprobar')
      .flush({}, { status: 503, statusText: 'Error' });
    await estable();
    confirmar();
    const r = http.expectOne('/api/auth/verificacion/comprobar');
    expect(r.request.body).toEqual({ token });
    r.flush({ vigente: true });
    await estable();
  });
  it('un enlace ya usado entre comprobación y confirmación retira el botón', async () => {
    await abrir();
    csrf();
    http.expectOne('/api/auth/verificacion/comprobar').flush({ vigente: true });
    await estable();
    confirmar();
    http
      .expectOne('/api/auth/verificacion/confirmar')
      .flush({ codigo: 'VERIFICACION_ENLACE_INVALIDO' }, { status: 400, statusText: 'Error' });
    await estable();
    expect(harness.routeNativeElement!.querySelector('app-verificar-correo button')).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain('ya fue utilizado');
  });
  it('abrir de nuevo el mismo enlace después del éxito lo vuelve a comprobar', async () => {
    await abrir();
    csrf();
    http.expectOne('/api/auth/verificacion/comprobar').flush({ vigente: true });
    await estable();
    confirmar();
    http.expectOne('/api/auth/verificacion/confirmar').flush({});
    await estable();
    await TestBed.inject(Router).navigateByUrl('/verificar-correo#token=' + token);
    http.expectOne('/api/auth/verificacion/comprobar').flush({ vigente: false });
    await estable();
    expect(harness.routeNativeElement!.textContent).toContain('ya fue utilizado');
  });
  it('salir ignora la respuesta pendiente y restaura la política de referencia', async () => {
    await abrir();
    csrf();
    const r = http.expectOne('/api/auth/verificacion/comprobar');
    await TestBed.inject(Router).navigateByUrl('/otra');
    r.flush({ vigente: true });
    await estable();
    expect(harness.routeNativeElement!.textContent).toBe('Otra pantalla');
    expect(TestBed.inject(Meta).getTag('name="referrer"')).toBeNull();
  });
});
