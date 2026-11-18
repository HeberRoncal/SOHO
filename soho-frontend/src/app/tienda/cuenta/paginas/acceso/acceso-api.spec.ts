import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Acceso } from './acceso';
import { autenticacionInterceptor } from '../../servicios/autenticacion-interceptor';

@Component({ template: '<p>Cuenta iniciada</p>' })
class DestinoPrueba {}

describe('Formulario de registro conectado a API', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'crear-cuenta', component: Acceso, data: { vista: 'registro' } },
          { path: 'mi-cuenta', component: DestinoPrueba },
          { path: 'otra', component: DestinoPrueba },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create('/crear-cuenta');
    http.expectNone('/api/auth/google/configuracion');
    await harness.fixture.whenStable();
  });
  afterEach(() => http.verify());
  const rellenar = () => {
    const datos: Record<string, string> = {
      nombres: 'Ana',
      apellidos: 'Pérez',
      correo: 'ana@soho.test',
      clave: 'una contraseña de prueba',
      confirmacion: 'una contraseña de prueba',
    };
    for (const [campo, valor] of Object.entries(datos)) {
      const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(
        '#acceso-' + campo,
      )!;
      input.value = valor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    harness.detectChanges();
  };
  const enviar = () =>
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  it('evita envíos duplicados y abre la cuenta sin simular verificación', async () => {
    expect(harness.routeNativeElement!.textContent).not.toMatch(/Demostración|Soho2026/);
    expect(harness.routeNativeElement!.querySelector('app-boton-google')).toBeNull();
    rellenar();
    enviar();
    enviar();
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled,
    ).toBe(true);
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    const r = http.expectOne('/api/auth/registro');
    expect(Object.keys(r.request.body)).toEqual(['nombres', 'apellidos', 'correo', 'clave']);
    r.flush({
      usuario: {
        id: 'prueba',
        nombres: 'Ana',
        apellidos: 'Pérez',
        correo: 'ana@soho.test',
        rol: 'CLIENTE',
        correoVerificado: false,
      },
      csrfToken: 'b'.repeat(64),
    });
    await harness.fixture.whenStable();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/mi-cuenta'));
  });
  it('conserva el formulario y anuncia un límite de intentos sin fingir un registro', async () => {
    rellenar();
    enviar();
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    http.expectOne('/api/auth/registro').flush({}, { status: 429, statusText: 'Límite' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('[role=alert]')!.textContent).toContain(
      'demasiados intentos',
    );
    expect(
      harness.routeNativeElement!.querySelector<HTMLInputElement>('#acceso-correo')!.value,
    ).toBe('ana@soho.test');
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled,
    ).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/crear-cuenta');
  });
  it('una respuesta tardía no devuelve al usuario a una pantalla que ya abandonó', async () => {
    rellenar();
    enviar();
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    const respuesta = http.expectOne('/api/auth/registro');
    await TestBed.inject(Router).navigateByUrl('/otra');
    respuesta.flush({
      usuario: {
        id: 'prueba',
        nombres: 'Ana',
        apellidos: 'Pérez',
        correo: 'ana@soho.test',
        rol: 'CLIENTE',
        correoVerificado: false,
      },
      csrfToken: 'b'.repeat(64),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(TestBed.inject(Router).url).toBe('/otra');
  });
});
