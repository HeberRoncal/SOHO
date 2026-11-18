import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { autenticacionInterceptor } from '../../../tienda/cuenta/servicios/autenticacion-interceptor';
import { Inventario } from './inventario';
import { reservasFixture, reservasGuardadas, usuarioReservas } from './reservas.fixtures';
const ruta = '/api/admin/configuracion/reservas';
const microtareas = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
describe('Formulario real de configuración de reservas', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Inventario],
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    TestBed.inject(EstadoAutenticacion).aceptar(usuarioReservas);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });
  async function abrir(r = reservasFixture()) {
    const f = TestBed.createComponent(Inventario);
    f.detectChanges();
    expect(f.nativeElement.querySelector('form')).toBeNull();
    http.expectOne(ruta).flush(r);
    await microtareas();
    await f.whenStable();
    f.detectChanges();
    return f;
  }
  async function click(f: Awaited<ReturnType<typeof abrir>>, s: string) {
    f.nativeElement.querySelector(s).click();
    await microtareas();
    await f.whenStable();
    f.detectChanges();
  }
  function enviar(f: Awaited<ReturnType<typeof abrir>>) {
    f.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    f.detectChanges();
  }
  async function escritura() {
    await microtareas();
    http.match('/api/auth/csrf').forEach((r) => r.flush({ csrfToken: 'b'.repeat(64) }));
    await microtareas();
    return http.expectOne((r) => r.url === ruta && r.method === 'PATCH');
  }
  it('muestra la política real y bloquea tiempo sin inventar valores', async () => {
    const f = await abrir(reservasFixture({ version: 9, accionCancelacion: 'PREGUNTAR' }));
    expect(f.nativeElement.textContent).toContain('Versión guardada');
    expect(f.nativeElement.textContent).toContain('No disponible para nuevos cambios');
    expect(f.nativeElement.textContent).not.toContain('Demostración:');
    expect(f.nativeElement.querySelector('input[value=PREGUNTAR]').checked).toBe(true);
    expect(f.nativeElement.querySelector('input[value=TIEMPO]').disabled).toBe(true);
    expect(f.nativeElement.querySelector('.guardar-reservas').disabled).toBe(true);
  });
  it('exige confirmación explícita y enfoca el resumen antes de escribir', async () => {
    const f = await abrir();
    await click(f, 'input[value=PREGUNTAR]');
    enviar(f);
    await microtareas();
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 10));
    expect(f.nativeElement.textContent).toContain('Confirma que el cambio');
    expect(f.nativeElement.querySelector('input[type=checkbox]').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(f.nativeElement.querySelector('#errores-reservas'));
    http.expectNone((r) => r.method === 'PATCH');
  });
  it.each(['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'] as const)(
    'habilita y guarda tiempo con %s mediante confirmación y CSRF',
    async (accionVencimiento) => {
      const f = await abrir(reservasFixture({}, true));
      expect(f.nativeElement.querySelector('input[value=TIEMPO]').disabled).toBe(false);
      await click(f, 'input[value=TIEMPO]');
      expect(f.nativeElement.querySelector('#reserva-horas').disabled).toBe(false);
      expect(f.nativeElement.querySelector('#reserva-vencimiento').disabled).toBe(false);
      expect(f.nativeElement.textContent).toContain('los pagos aprobados conservan sus reservas');
      const horas = f.nativeElement.querySelector('#reserva-horas') as HTMLInputElement;
      horas.value = '24';
      horas.dispatchEvent(new Event('input', { bubbles: true }));
      const vencimiento = f.nativeElement.querySelector(
        '#reserva-vencimiento',
      ) as HTMLSelectElement;
      vencimiento.value = accionVencimiento;
      vencimiento.dispatchEvent(new Event('change', { bubbles: true }));
      await f.whenStable();
      f.detectChanges();
      enviar(f);
      await microtareas();
      await f.whenStable();
      expect(f.nativeElement.textContent).toContain('Confirma que el cambio');
      http.expectNone((r) => r.method === 'PATCH');
      await click(f, 'input[type=checkbox]');
      enviar(f);
      const req = await escritura();
      expect(req.request.body).toMatchObject({
        modo: 'TIEMPO',
        horas: 24,
        accionVencimiento,
        version: 1,
        confirmado: true,
      });
      expect(req.request.headers.get('X-CSRF-Token')).toBe('b'.repeat(64));
      req.flush(
        reservasFixture(
          {
            version: 2,
            modo: 'TIEMPO',
            horas: 24,
            accionVencimiento,
            actualizadoEn: '2026-11-14T12:01:00.000Z',
            actualizadoPor: { id: 'admin', nombre: 'Ana Prueba' },
          },
          true,
          true,
        ),
      );
      await microtareas();
      await f.whenStable();
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('Configuración de reservas guardada');
      expect(f.nativeElement.querySelector('#reserva-horas').value).toBe('24');
      expect(f.componentInstance.estado.cambios()).toBe(false);
    },
  );
  it('habilitar tiempo exige duración y acción antes de enviar y reconfirma al editar', async () => {
    const f = await abrir(reservasFixture({}, true));
    await click(f, 'input[value=TIEMPO]');
    await click(f, 'input[type=checkbox]');
    enviar(f);
    await microtareas();
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.estado.errores()).toMatchObject({
      horas: expect.any(String),
      accionVencimiento: expect.any(String),
    });
    http.expectNone((r) => r.method === 'PATCH');
    f.componentInstance.estado.cambiar({ horas: '24', accionVencimiento: 'LIBERAR_Y_ALERTAR' });
    expect(f.componentInstance.estado.confirmado()).toBe(false);
    await microtareas();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('input[type=checkbox]').checked).toBe(false);
  });
  it('permite editar un plazo ya guardado y volver a hasta decisión sin conservar campos incompatibles', async () => {
    const f = await abrir(
      reservasFixture({ modo: 'TIEMPO', horas: 24, accionVencimiento: 'SOLO_ALERTAR' }, true),
    );
    expect(f.nativeElement.querySelector('#reserva-horas').disabled).toBe(false);
    f.componentInstance.estado.cambiar({ horas: '48' });
    f.componentInstance.estado.confirmar(true);
    await click(f, 'input[value=HASTA_DECISION]');
    expect(f.componentInstance.estado.borrador()?.horas).toBe('');
    expect(f.nativeElement.querySelector('input[type=checkbox]').checked).toBe(false);
    expect(f.nativeElement.querySelector('#reserva-horas')).toBeNull();
  });
  it('bloquea edición y navegación hasta confirmar el guardado', async () => {
    const f = await abrir();
    await click(f, 'input[value=PREGUNTAR]');
    await click(f, 'input[type=checkbox]');
    enviar(f);
    const req = await escritura();
    expect(f.componentInstance.puedeSalir()).toBe(false);
    expect(f.nativeElement.querySelector('.reserva-campos').disabled).toBe(true);
    expect(f.nativeElement.querySelector('.guardar-reservas').disabled).toBe(true);
    req.flush(reservasGuardadas());
    await microtareas();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Ana Prueba');
    expect(f.nativeElement.textContent).toContain('Configuración de reservas guardada');
    expect(f.componentInstance.puedeSalir()).toBe(true);
  });
  it('muestra una política temporal preexistente sin permitir editarla y puede volver a hasta decisión', async () => {
    const f = await abrir(
      reservasFixture({ modo: 'TIEMPO', horas: 24, accionVencimiento: 'SOLO_ALERTAR' }),
    );
    expect(f.nativeElement.querySelector('#reserva-horas').value).toBe('24');
    expect(f.nativeElement.querySelector('#reserva-horas').disabled).toBe(true);
    expect(f.nativeElement.querySelector('#reserva-vencimiento').disabled).toBe(true);
    expect(f.nativeElement.textContent).toContain('configuración guardada ya utiliza un plazo');
    await click(f, 'input[value=HASTA_DECISION]');
    expect(f.nativeElement.querySelector('#reserva-horas')).toBeNull();
    expect(f.nativeElement.querySelector('input[value=PREGUNTAR]').disabled).toBe(false);
    expect(f.componentInstance.estado.borrador()?.horas).toBe('');
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('conserva el borrador ante conflicto y reconfirma tras una actualización explícita', async () => {
    const f = await abrir();
    await click(f, 'input[value=PREGUNTAR]');
    await click(f, 'input[type=checkbox]');
    enviar(f);
    (await escritura()).flush({}, { status: 409, statusText: 'Conflicto' });
    await microtareas();
    http.expectOne(ruta).flush(reservasFixture({ version: 2 }));
    await microtareas();
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.estado.configuracion()?.version).toBe(1);
    expect(f.nativeElement.querySelector('input[value=PREGUNTAR]').checked).toBe(true);
    expect(f.nativeElement.querySelector('.guardar-reservas').disabled).toBe(true);
    f.nativeElement.querySelector('.actualizar-reservas').click();
    http.expectOne(ruta).flush(reservasFixture({ version: 2 }));
    await microtareas();
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.estado.configuracion()?.version).toBe(2);
    expect(f.nativeElement.querySelector('input[value=PREGUNTAR]').checked).toBe(true);
    expect(f.nativeElement.querySelector('input[type=checkbox]').checked).toBe(false);
  });
  it('protege el borrador al navegar y al recargar, y pide confirmar el descarte', async () => {
    const f = await abrir();
    await click(f, 'input[value=PREGUNTAR]');
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(f.componentInstance.puedeSalir()).toBe(false);
    const evento = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    f.componentInstance.antesDeSalir(evento);
    expect(evento.defaultPrevented).toBe(true);
    await click(f, '.descartar-reservas');
    expect(f.componentInstance.estado.cambios()).toBe(true);
    confirmar.mockReturnValue(true);
    await click(f, '.descartar-reservas');
    expect(f.componentInstance.estado.cambios()).toBe(false);
    expect(f.componentInstance.puedeSalir()).toBe(true);
  });
  it('la consulta fallida no muestra una política ficticia y permite reintentar', async () => {
    const f = TestBed.createComponent(Inventario);
    f.detectChanges();
    http
      .expectOne(ruta)
      .flush(
        { codigo: 'CONFIGURACION_RESERVAS_NO_DISPONIBLE' },
        { status: 503, statusText: 'Error' },
      );
    await microtareas();
    await f.whenStable();
    expect(f.nativeElement.querySelector('form')).toBeNull();
    expect(f.nativeElement.textContent).toContain('no está disponible');
    f.nativeElement.querySelector('.actualizar-reservas').click();
    http.expectOne(ruta).flush(reservasFixture());
    await microtareas();
    await f.whenStable();
    expect(f.nativeElement.querySelector('form')).not.toBeNull();
  });
});
