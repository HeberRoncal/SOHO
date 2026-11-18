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
const token = 'a'.repeat(43);
describe('Pantallas de recuperación reales', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'recuperar-contrasena', component: Acceso, data: { vista: 'recuperar' } },
          { path: 'restablecer-contrasena', component: Acceso, data: { vista: 'restablecer' } },
          { path: 'otra', component: OtraPrueba },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Meta).removeTag('name="referrer"');
  });
  afterEach(() => http.verify());
  const iniciar = async (ruta: string) => {
    harness = await RouterTestingHarness.create(ruta);
  };
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
  const escribir = (campo: string, valor: string) => {
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(
      '#recuperacion-' + campo,
    )!;
    input.value = valor;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    harness.detectChanges();
  };
  const enviar = () =>
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const estabilizar = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  it('solicita sin duplicar envíos y confirma con el mismo mensaje para cualquier correo', async () => {
    await iniciar('/recuperar-contrasena');
    http.expectNone('/api/auth/google/configuracion');
    escribir('correo', 'ana@soho.test');
    enviar();
    enviar();
    csrf();
    harness.detectChanges();
    const solicitud = http.expectOne('/api/auth/recuperacion');
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled,
    ).toBe(true);
    solicitud.flush({}, { status: 202, statusText: 'Accepted' });
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).toContain(
      'Si existe una cuenta con contraseña',
    );
    expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
    expect(harness.routeNativeElement!.textContent).not.toContain('ana@soho.test');
  });
  it('un fallo SMTP no afirma que se envió el correo y conserva el campo para reintentar', async () => {
    await iniciar('/recuperar-contrasena');
    escribir('correo', 'ana@soho.test');
    enviar();
    csrf();
    http.expectOne('/api/auth/recuperacion').flush({}, { status: 503, statusText: 'Error' });
    await estabilizar();
    expect(harness.routeNativeElement!.querySelector('[role=alert]')!.textContent).toContain(
      'no está disponible',
    );
    expect(
      harness.routeNativeElement!.querySelector<HTMLInputElement>('#recuperacion-correo')!.value,
    ).toBe('ana@soho.test');
  });
  it('quita el fragmento antes de comprobar, mantiene el token fuera del DOM y restaura referrer al salir', async () => {
    const meta = TestBed.inject(Meta);
    meta.updateTag({ name: 'referrer', content: 'same-origin' });
    await iniciar('/restablecer-contrasena#token=' + token);
    expect(TestBed.inject(Location).path(true)).toBe('/restablecer-contrasena');
    expect(meta.getTag('name="referrer"')?.content).toBe('no-referrer');
    expect(harness.routeNativeElement!.innerHTML).not.toContain(token);
    csrf();
    const comprobar = http.expectOne('/api/auth/recuperacion/comprobar');
    expect(comprobar.request.body).toEqual({ token });
    comprobar.flush({ vigente: true });
    await estabilizar();
    http.expectNone('/api/auth/recuperacion/restablecer');
    http.expectNone('/api/auth/google/configuracion');
    await TestBed.inject(Router).navigateByUrl('/otra');
    expect(meta.getTag('name="referrer"')?.content).toBe('same-origin');
  });
  it.each(['', '#token=invalido'])(
    'un enlace ausente o mal formado no se envía a la API: %s',
    async (fragmento) => {
      await iniciar('/restablecer-contrasena' + fragmento);
      await estabilizar();
      http.expectNone('/api/auth/csrf');
      http.expectNone('/api/auth/recuperacion/comprobar');
      expect(harness.routeNativeElement!.textContent).toContain('Este enlace venció');
      expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
    },
  );
  it('distingue un fallo de comprobación de un enlace vencido y permite reintentar', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    http
      .expectOne('/api/auth/recuperacion/comprobar')
      .flush({}, { status: 503, statusText: 'Error' });
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).not.toContain('Este enlace venció');
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('app-recuperacion-clave button')!
      .click();
    http.expectOne('/api/auth/recuperacion/comprobar').flush({ vigente: false });
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).toContain('Este enlace venció');
  });
  it('valida confirmación, guarda solo al enviar y no inicia sesión al terminar', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    http.expectOne('/api/auth/recuperacion/comprobar').flush({ vigente: true });
    await estabilizar();
    escribir('clave', 'una nueva contraseña segura');
    escribir('confirmacion', 'otra');
    enviar();
    await estabilizar();
    http.expectNone('/api/auth/recuperacion/restablecer');
    expect(harness.routeNativeElement!.textContent).toContain('Las contraseñas no coinciden');
    escribir('confirmacion', 'una nueva contraseña segura');
    enviar();
    enviar();
    const cambio = http.expectOne('/api/auth/recuperacion/restablecer');
    expect(cambio.request.body).toEqual({ token, clave: 'una nueva contraseña segura' });
    cambio.flush({});
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).toContain('Tu contraseña se actualizó');
    expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
    http.expectNone('/api/auth/login');
    expect(TestBed.inject(Location).path(true)).toBe('/restablecer-contrasena');
  });
  it('un token consumido entre comprobación y envío retira el formulario', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    http.expectOne('/api/auth/recuperacion/comprobar').flush({ vigente: true });
    await estabilizar();
    escribir('clave', 'una nueva contraseña segura');
    escribir('confirmacion', 'una nueva contraseña segura');
    enviar();
    http
      .expectOne('/api/auth/recuperacion/restablecer')
      .flush({ codigo: 'RECUPERACION_ENLACE_INVALIDO' }, { status: 400, statusText: 'Error' });
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).toContain('Este enlace venció');
    expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
  });
  it('ignora una comprobación que termina después de abandonar la pantalla', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    const consulta = http.expectOne('/api/auth/recuperacion/comprobar');
    await TestBed.inject(Router).navigateByUrl('/otra');
    consulta.flush({ vigente: true });
    await estabilizar();
    expect(TestBed.inject(Location).path(true)).toBe('/otra');
    expect(harness.routeNativeElement!.textContent).toBe('Otra pantalla');
    expect(TestBed.inject(Meta).getTag('name="referrer"')).toBeNull();
  });
  it('un cambio confirmado después de salir no devuelve al usuario al acceso', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    http.expectOne('/api/auth/recuperacion/comprobar').flush({ vigente: true });
    await estabilizar();
    escribir('clave', 'una nueva contraseña segura');
    escribir('confirmacion', 'una nueva contraseña segura');
    enviar();
    const cambio = http.expectOne('/api/auth/recuperacion/restablecer');
    await TestBed.inject(Router).navigateByUrl('/otra');
    cambio.flush({});
    await estabilizar();
    expect(TestBed.inject(Location).path(true)).toBe('/otra');
    expect(harness.routeNativeElement!.textContent).toBe('Otra pantalla');
    http.expectNone('/api/auth/login');
  });
  it('volver a abrir el mismo enlace después del éxito comprueba que ya fue utilizado', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    http.expectOne('/api/auth/recuperacion/comprobar').flush({ vigente: true });
    await estabilizar();
    expect(TestBed.inject(Router).url).toBe('/restablecer-contrasena');
    escribir('clave', 'una nueva contraseña segura');
    escribir('confirmacion', 'una nueva contraseña segura');
    enviar();
    http.expectOne('/api/auth/recuperacion/restablecer').flush({});
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).toContain('Tu contraseña se actualizó');
    await TestBed.inject(Router).navigateByUrl('/restablecer-contrasena#token=' + token);
    csrf();
    const comprobar = http.expectOne('/api/auth/recuperacion/comprobar');
    expect(comprobar.request.body).toEqual({ token });
    comprobar.flush({ vigente: false });
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).toContain('Este enlace venció');
    expect(harness.routeNativeElement!.textContent).not.toContain('Tu contraseña se actualizó');
    expect(TestBed.inject(Location).path(true)).toBe('/restablecer-contrasena');
    expect(TestBed.inject(Router).url).toBe('/restablecer-contrasena');
  });
  it('un fragmento nuevo descarta una comprobación anterior que termina tarde', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    const anterior = http.expectOne('/api/auth/recuperacion/comprobar');
    const nuevo = 'b'.repeat(43);
    await TestBed.inject(Router).navigateByUrl('/restablecer-contrasena#token=' + nuevo);
    const actual = http.expectOne('/api/auth/recuperacion/comprobar');
    expect(actual.request.body).toEqual({ token: nuevo });
    actual.flush({ vigente: false });
    await estabilizar();
    anterior.flush({ vigente: true });
    await estabilizar();
    expect(harness.routeNativeElement!.textContent).toContain('Este enlace venció');
    expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
    expect(TestBed.inject(Location).path(true)).toBe('/restablecer-contrasena');
  });
  it('un fragmento nuevo no recibe la confirmación de un cambio anterior pendiente', async () => {
    await iniciar('/restablecer-contrasena#token=' + token);
    csrf();
    http.expectOne('/api/auth/recuperacion/comprobar').flush({ vigente: true });
    await estabilizar();
    escribir('clave', 'una nueva contraseña segura');
    escribir('confirmacion', 'una nueva contraseña segura');
    enviar();
    const anterior = http.expectOne('/api/auth/recuperacion/restablecer');
    const nuevo = 'b'.repeat(43);
    await TestBed.inject(Router).navigateByUrl('/restablecer-contrasena#token=' + nuevo);
    http.expectOne('/api/auth/recuperacion/comprobar').flush({ vigente: true });
    await estabilizar();
    anterior.flush({});
    await estabilizar();
    expect(
      harness.routeNativeElement!.querySelector<HTMLInputElement>('#recuperacion-clave')!.value,
    ).toBe('');
    expect(harness.routeNativeElement!.textContent).not.toContain('Tu contraseña se actualizó');
    expect(harness.routeNativeElement!.querySelector('form')).not.toBeNull();
  });
});
