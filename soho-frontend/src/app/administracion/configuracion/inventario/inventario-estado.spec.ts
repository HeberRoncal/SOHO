import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { autenticacionInterceptor } from '../../../tienda/cuenta/servicios/autenticacion-interceptor';
import { ConfiguracionPagosApi } from '../pagos/servicios/configuracion-pagos-api';
import { consultaPagosFixture } from '../pagos/modelos/configuracion-pagos.fixtures';
import { InventarioEstado } from './inventario-estado';
import { reservasFixture, reservasGuardadas, usuarioReservas } from './reservas.fixtures';
const ruta = '/api/admin/configuracion/reservas';
const microtareas = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
describe('Configuración de reservas con API', () => {
  let estado: InventarioEstado, http: HttpTestingController, sesion: EstadoAutenticacion;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventarioEstado,
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    sesion = TestBed.inject(EstadoAutenticacion);
    sesion.aceptar(usuarioReservas);
    estado = TestBed.inject(InventarioEstado);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  async function cargar(r = reservasFixture(), conservar = false) {
    const p = estado.cargar(conservar);
    http.expectOne(ruta).flush(r);
    await p;
  }
  async function borradorPagos(titular: string) {
    const pagos = TestBed.inject(ConfiguracionPagosApi);
    const p = pagos.cargar();
    http.expectOne('/api/admin/configuracion/pagos').flush(consultaPagosFixture());
    await p;
    pagos.campo('YAPE', 'titular', titular);
    return pagos;
  }
  async function escritura() {
    await microtareas();
    http.match('/api/auth/csrf').forEach((r) => r.flush({ csrfToken: 'b'.repeat(64) }));
    await microtareas();
    return http.expectOne((r) => r.url === ruta && r.method === 'PATCH');
  }
  function cambiar() {
    estado.cambiar({ accionCancelacion: 'PREGUNTAR' });
    estado.confirmar(true);
  }
  it('espera la consulta y muestra valores reales sin usar los de demostración', async () => {
    expect(estado.cargada()).toBe(false);
    expect(estado.borrador()).toBeNull();
    await cargar(reservasFixture({ version: 7, accionCancelacion: 'PREGUNTAR' }));
    expect(estado.configuracion()?.version).toBe(7);
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
    expect(estado.cambios()).toBe(false);
  });
  it('guarda solo la política, versión y confirmación con cookies y CSRF; conserva otros borradores', async () => {
    await cargar();
    const pagos = await borradorPagos('Borrador de otro apartado');
    cambiar();
    const p = estado.guardar(),
      req = await escritura();
    expect(req.request.body).toEqual({
      version: 1,
      confirmado: true,
      modo: 'HASTA_DECISION',
      horas: null,
      accionVencimiento: null,
      accionCancelacion: 'PREGUNTAR',
    });
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-CSRF-Token')).toBe('b'.repeat(64));
    req.flush(reservasGuardadas());
    await p;
    expect(estado.configuracion()?.version).toBe(2);
    expect(estado.configuracion()?.actualizadoPor?.nombre).toBe('Ana Prueba');
    expect(estado.cambios()).toBe(false);
    expect(pagos.borrador()[0].titular).toBe('Borrador de otro apartado');
    expect(pagos.cambios()).toBe(true);
  });
  it('no escribe sin cambios ni sin confirmación', async () => {
    await cargar();
    await estado.guardar();
    estado.cambiar({ accionCancelacion: 'PREGUNTAR' });
    await estado.guardar();
    expect(estado.errores()['confirmado']).toBeTruthy();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('bloquea doble escritura, edición y descarte mientras guarda', async () => {
    await cargar();
    cambiar();
    const p = estado.guardar(),
      req = await escritura();
    await estado.guardar();
    estado.cambiar({ accionCancelacion: 'LIBERAR' });
    estado.descartar();
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
    http.expectNone((r) => r.method === 'PATCH');
    req.flush(reservasGuardadas());
    await p;
  });
  it('rechaza activar tiempo aunque se invoque el cambio fuera de los controles', async () => {
    await cargar();
    estado.cambiar({ modo: 'TIEMPO', horas: '24', accionVencimiento: 'SOLO_ALERTAR' });
    expect(estado.borrador()?.modo).toBe('HASTA_DECISION');
    expect(estado.cambios()).toBe(false);
    await estado.guardar();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it.each(['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'] as const)(
    'guarda la política temporal habilitada %s sin tocar otros borradores',
    async (accionVencimiento) => {
      await cargar(reservasFixture({}, true));
      const pagos = await borradorPagos('Borrador comercial');
      estado.cambiar({ modo: 'TIEMPO', horas: '24', accionVencimiento });
      estado.confirmar(true);
      expect(estado.temporalDisponible()).toBe(true);
      const p = estado.guardar(),
        req = await escritura();
      expect(req.request.body).toEqual({
        version: 1,
        confirmado: true,
        modo: 'TIEMPO',
        horas: 24,
        accionVencimiento,
        accionCancelacion: 'LIBERAR',
      });
      req.flush(
        reservasFixture(
          {
            modo: 'TIEMPO',
            horas: 24,
            accionVencimiento,
            version: 2,
            actualizadoEn: '2026-11-14T12:01:00.000Z',
            actualizadoPor: { id: 'admin', nombre: 'Ana' },
          },
          true,
          true,
        ),
      );
      await p;
      expect(estado.borrador()?.horas).toBe('24');
      expect(estado.cambios()).toBe(false);
      expect(pagos.borrador()[0].titular).toBe('Borrador comercial');
    },
  );
  it('conserva duración y acción temporales ante un conflicto y exige otra confirmación al actualizar', async () => {
    await cargar(reservasFixture({}, true));
    estado.cambiar({ modo: 'TIEMPO', horas: '48', accionVencimiento: 'SOLO_ALERTAR' });
    estado.confirmar(true);
    const p = estado.guardar();
    (await escritura()).flush({}, { status: 409, statusText: 'Conflict' });
    await microtareas();
    http.expectOne(ruta).flush(reservasFixture({ version: 2 }, true));
    await p;
    expect(estado.borrador()).toMatchObject({
      modo: 'TIEMPO',
      horas: '48',
      accionVencimiento: 'SOLO_ALERTAR',
    });
    expect(estado.recargaNecesaria()).toBe(true);
    await cargar(reservasFixture({ version: 2 }, true), true);
    expect(estado.confirmado()).toBe(false);
    expect(estado.errores()['confirmado']).toBeTruthy();
  });
  it('recupera un guardado temporal cuya respuesta se pierde sin repetir la escritura', async () => {
    await cargar(reservasFixture({}, true));
    estado.cambiar({ modo: 'TIEMPO', horas: '24', accionVencimiento: 'LIBERAR_Y_ALERTAR' });
    estado.confirmar(true);
    const p = estado.guardar();
    (await escritura()).error(new ProgressEvent('error'));
    await microtareas();
    http.expectOne(ruta).flush(
      reservasFixture(
        {
          version: 2,
          modo: 'TIEMPO',
          horas: 24,
          accionVencimiento: 'LIBERAR_Y_ALERTAR',
          actualizadoEn: '2026-11-14T12:01:00.000Z',
          actualizadoPor: { id: 'admin', nombre: 'Ana' },
        },
        true,
      ),
    );
    await p;
    expect(estado.cambios()).toBe(false);
    expect(estado.mensaje()).toContain('Guardado comprobado');
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('muestra tiempo preexistente sin modificarlo y permite volver a hasta decisión', async () => {
    const temporal = reservasFixture({
      modo: 'TIEMPO',
      horas: 24,
      accionVencimiento: 'SOLO_ALERTAR',
    });
    await cargar(temporal);
    expect(estado.borrador()?.horas).toBe('24');
    estado.cambiar({ horas: '48', accionCancelacion: 'PREGUNTAR' });
    expect(estado.cambios()).toBe(false);
    estado.cambiar({ modo: 'HASTA_DECISION' });
    estado.confirmar(true);
    const p = estado.guardar(),
      req = await escritura();
    expect(req.request.body.horas).toBeNull();
    expect(req.request.body.accionVencimiento).toBeNull();
    req.flush(
      reservasFixture(
        {
          version: 2,
          actualizadoEn: '2026-11-14T12:01:00.000Z',
          actualizadoPor: { id: 'admin', nombre: 'Ana' },
        },
        false,
        true,
      ),
    );
    await p;
    expect(estado.borrador()?.modo).toBe('HASTA_DECISION');
  });
  it('el conflicto conserva borrador y versión abierta hasta actualizar explícitamente', async () => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).flush(
      { codigo: 'CONFIGURACION_RESERVAS_CAMBIADA' },
      { status: 409, statusText: 'Conflicto' },
    );
    await microtareas();
    http.expectOne(ruta).flush(reservasFixture({ version: 2 }));
    await p;
    expect(estado.recargaNecesaria()).toBe(true);
    expect(estado.configuracion()?.version).toBe(1);
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
    expect(estado.confirmado()).toBe(false);
    await estado.guardar();
    http.expectNone((r) => r.method === 'PATCH');
    await cargar(reservasFixture({ version: 2 }), true);
    expect(estado.configuracion()?.version).toBe(2);
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
    expect(estado.recargaNecesaria()).toBe(false);
    expect(estado.confirmado()).toBe(false);
  });
  it('recupera un COMMIT sin respuesta por GET sin repetir PATCH', async () => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).error(new ProgressEvent('error'));
    await microtareas();
    http.expectOne(ruta).flush(reservasGuardadas());
    await p;
    expect(estado.cambios()).toBe(false);
    expect(estado.configuracion()?.version).toBe(2);
    expect(estado.mensaje()).toContain('Guardado comprobado');
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('un error 503 con lectura sin cambio exige actualizar aunque el borrador se descarte', async () => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).flush({}, { status: 503, statusText: 'Error' });
    await microtareas();
    http.expectOne(ruta).flush(reservasFixture());
    await p;
    estado.descartar();
    cambiar();
    await estado.guardar();
    expect(estado.recargaNecesaria()).toBe(true);
    http.expectNone((r) => r.method === 'PATCH');
    await cargar(reservasFixture(), true);
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
  });
  it('una consulta fallida después del error conserva el borrador sin permitir otra escritura', async () => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).error(new ProgressEvent('error'));
    await microtareas();
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Error' });
    await p;
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
    expect(estado.recargaNecesaria()).toBe(true);
  });
  it('no atribuye un resultado de otro administrador a la escritura perdida', async () => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).flush({}, { status: 500, statusText: 'Error' });
    await microtareas();
    http.expectOne(ruta).flush(
      reservasFixture({
        ...reservasGuardadas().configuracion,
        actualizadoPor: { id: 'otro', nombre: 'Otro' },
      }),
    );
    await p;
    expect(estado.recargaNecesaria()).toBe(true);
    expect(estado.configuracion()?.version).toBe(1);
  });
  it.each([400, 404, 429])('conserva borrador ante %i sin repetir ni consultar', async (status) => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).flush({}, { status, statusText: 'Error' });
    await p;
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
    expect(estado.confirmado()).toBe(false);
    http.expectNone(ruta);
  });
  it.each([401, 403])('retira datos privados al perder acceso con %i', async (status) => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).flush({}, { status, statusText: 'Error' });
    await p;
    TestBed.tick();
    expect(estado.configuracion()).toBeNull();
    expect(estado.borrador()).toBeNull();
  });
  it.each(['otra-cuenta', 'misma-cuenta', 'rol'])(
    'descarta una escritura tardía al cambiar %s',
    async (caso) => {
      await cargar();
      cambiar();
      const p = estado.guardar(),
        req = await escritura();
      sesion.invalidar();
      sesion.aceptar({
        ...usuarioReservas,
        id: caso === 'otra-cuenta' ? 'otra' : 'admin',
        rol: caso === 'rol' ? 'CLIENTE' : 'ADMIN',
      });
      TestBed.tick();
      req.flush(reservasGuardadas());
      await p;
      expect(estado.configuracion()).toBeNull();
    },
  );
  it('descarta una consulta tardía después de salir y volver a la misma cuenta', async () => {
    const p = estado.cargar(),
      req = http.expectOne(ruta);
    sesion.invalidar();
    sesion.aceptar(usuarioReservas);
    TestBed.tick();
    req.flush(reservasFixture());
    await p;
    expect(estado.cargada()).toBe(false);
  });
  it('mantiene bloqueo y borrador si la actualización explícita falla', async () => {
    await cargar();
    cambiar();
    const p = estado.cargar(true);
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Error' });
    await p;
    expect(estado.bloqueado()).toBe(true);
    expect(estado.borrador()?.accionCancelacion).toBe('PREGUNTAR');
  });
  it('una respuesta incoherente de escritura se comprueba por GET antes de adoptarse', async () => {
    await cargar();
    cambiar();
    const p = estado.guardar();
    (await escritura()).flush({
      ...reservasGuardadas(),
      configuracion: { ...reservasGuardadas().configuracion, version: 99 },
    });
    await microtareas();
    http.expectOne(ruta).flush(reservasFixture());
    await p;
    expect(estado.configuracion()?.version).toBe(1);
    expect(estado.recargaNecesaria()).toBe(true);
  });
  it('la versión máxima es consultable pero no permite enviar un cambio', async () => {
    await cargar(reservasFixture({ version: 4294967295 }));
    cambiar();
    await estado.guardar();
    expect(estado.errores()['version']).toBeTruthy();
    http.expectNone((r) => r.method === 'PATCH');
  });
});
