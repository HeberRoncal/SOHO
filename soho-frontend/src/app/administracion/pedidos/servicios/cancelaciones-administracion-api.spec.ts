import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { autenticacionInterceptor } from '../../../tienda/cuenta/servicios/autenticacion-interceptor';
import { PagosAdministracionApi } from '../../pagos/servicios/pagos-administracion-api';
import { SolicitudCancelacionAdmin } from '../modelos/cancelacion-admin';
import { cancelacionApiFixture as fixture } from './cancelaciones-administracion-api.fixtures';
import { CancelacionesAdministracionApi } from './cancelaciones-administracion-api';

const codigo = 'SOHO-TEST0001',
  ruta = '/api/admin/pedidos/' + codigo;
const microtareas = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
describe('Cancelaciones y liberación mediante API', () => {
  let api: CancelacionesAdministracionApi,
    cache: PagosAdministracionApi,
    http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>(null);
  beforeEach(() => {
    perfil.set({ id: 'admin', rol: 'ADMIN' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion: signal('autenticado') } },
      ],
    });
    api = TestBed.inject(CancelacionesAdministracionApi);
    cache = TestBed.inject(PagosAdministracionApi);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  const cargar = async (p = fixture()) => {
    const r = api.actualizar(codigo);
    http.expectOne(ruta).flush({ pedido: p });
    expect((await r).ok).toBe(true);
  };
  const solicitud = (extra: Partial<SolicitudCancelacionAdmin> = {}): SolicitudCancelacionAdmin => {
    const p = cache.obtener(codigo)!.pedido;
    return {
      motivo: ' Cancelación solicitada por el cliente. ',
      confirmado: true,
      versionPedido: p.version,
      versionPago: p.versionPago,
      estadoEntregaEsperado: p.estadoEntrega,
      estadoPagoEsperado: p.estadoPago,
      decisionReservasConsultadas: 'CONSERVAR',
      ...extra,
    };
  };
  async function escritura(liberar = false) {
    await microtareas();
    http.match('/api/auth/csrf').forEach((r) => r.flush({ csrfToken: 'a'.repeat(64) }));
    await microtareas();
    return http.expectOne(ruta + '/cancelacion' + (liberar ? '/liberar-reservas' : ''));
  }
  it('envía solo contrato permitido, cookies y CSRF; aplica política automática y conserva la revisión', async () => {
    await cargar(fixture({ pago: 'PENDIENTE', consultables: 0, automaticas: 2 }));
    const r = api.cancelar(codigo, solicitud({ decisionReservasConsultadas: undefined })),
      req = await escritura();
    expect(req.request.body).toEqual({
      versionPedido: 2,
      versionPago: 2,
      confirmado: true,
      motivo: 'Cancelación solicitada por el cliente.',
    });
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    req.flush({
      pedido: fixture({ cancelado: true, pago: 'PENDIENTE', consultables: 0, automaticas: 2 }),
    });
    expect((await r).ok).toBe(true);
    expect(cache.obtener(codigo)?.pedido.estadoPago).toBe('anulado');
    expect(cache.obtener(codigo)?.comprobantes[0].estado).toBe('pendiente');
  });
  it('conserva un pago aprobado, libera después y mantiene la cancelación histórica', async () => {
    await cargar();
    const r = api.cancelar(codigo, solicitud());
    (await escritura()).flush({ pedido: fixture({ cancelado: true, conservar: true }) });
    expect((await r).ok).toBe(true);
    const original = cache.obtener(codigo)!.pedido.cancelacion;
    const l = api.liberar(codigo, { versionPedido: 3, versionPago: 2, confirmado: true }),
      req = await escritura(true);
    expect(req.request.body).toEqual({ versionPedido: 3, versionPago: 2, confirmado: true });
    req.flush({ pedido: fixture({ cancelado: true, conservar: true, liberado: true }) });
    expect((await l).ok).toBe(true);
    expect(cache.obtener(codigo)!.pedido.cancelacion).toEqual(original);
    expect(cache.obtener(codigo)!.pedido.reservasCancelacion?.unidadesRetenidas).toBe(0);
    expect(
      (await api.liberar(codigo, { versionPedido: 4, versionPago: 2, confirmado: true })).ok,
    ).toBe(false);
    http.expectNone(ruta + '/cancelacion/liberar-reservas');
  });
  it.each(['versionPedido', 'versionPago'] as const)(
    'bloquea una %s atrasada sin POST',
    async (campo) => {
      await cargar();
      expect((await api.cancelar(codigo, solicitud({ [campo]: 1 }))).requiereActualizar).toBe(true);
      http.expectNone((r) => r.method === 'POST');
    },
  );
  it('exige elección consultable y rechaza una elección cuando solo hay reservas automáticas', async () => {
    await cargar();
    expect(
      (await api.cancelar(codigo, solicitud({ decisionReservasConsultadas: undefined }))).errores[
        'decisionReservasConsultadas'
      ],
    ).toBeTruthy();
    await cargar(fixture({ consultables: 0, automaticas: 2 }));
    expect((await api.cancelar(codigo, solicitud())).ok).toBe(false);
    http.expectNone((r) => r.method === 'POST');
  });
  it('bloquea dos escrituras simultáneas del mismo pedido', async () => {
    await cargar();
    const r = api.cancelar(codigo, solicitud());
    expect((await api.cancelar(codigo, solicitud())).ok).toBe(false);
    (await escritura()).flush({ pedido: fixture({ cancelado: true, conservar: true }) });
    expect((await r).ok).toBe(true);
  });
  it.each([400, 401, 403, 404, 429])(
    'maneja %i sin repetir ni consultar la escritura',
    async (status) => {
      await cargar();
      const r = api.cancelar(codigo, solicitud());
      (await escritura()).flush({}, { status, statusText: 'Error' });
      expect((await r).ok).toBe(false);
      http.expectNone(ruta);
      if ([401, 403].includes(status)) expect(cache.obtener(codigo)).toBeUndefined();
    },
  );
  it('recupera una cancelación confirmada tras una respuesta perdida', async () => {
    await cargar();
    const r = api.cancelar(codigo, solicitud());
    (await escritura()).flush({}, { status: 503, statusText: 'Respuesta perdida' });
    await microtareas();
    http.expectOne(ruta).flush({ pedido: fixture({ cancelado: true, conservar: true }) });
    expect(await r).toMatchObject({ ok: true, recuperado: true });
    http.expectNone((r) => r.method === 'POST');
  });
  it('recupera la liberación con versión, cancelación intacta y responsable propios', async () => {
    await cargar(fixture({ cancelado: true, conservar: true }));
    const r = api.liberar(codigo, { versionPedido: 3, versionPago: 2, confirmado: true });
    (await escritura(true)).error(new ProgressEvent('error'));
    await microtareas();
    http
      .expectOne(ruta)
      .flush({ pedido: fixture({ cancelado: true, conservar: true, liberado: true }) });
    expect(await r).toMatchObject({ ok: true, recuperado: true });
  });
  it('un conflicto exige revisión aunque la lectura muestre el destino esperado', async () => {
    await cargar();
    const r = api.cancelar(codigo, solicitud());
    (await escritura()).flush(
      { codigo: 'CANCELACION_CAMBIADA' },
      { status: 409, statusText: 'Conflicto' },
    );
    await microtareas();
    http.expectOne(ruta).flush({ pedido: fixture({ cancelado: true, conservar: true }) });
    expect(await r).toMatchObject({ ok: false, requiereActualizar: true });
  });
  it('no atribuye una liberación de otro administrador a la operación perdida', async () => {
    await cargar(fixture({ cancelado: true, conservar: true }));
    const r = api.liberar(codigo, { versionPedido: 3, versionPago: 2, confirmado: true });
    (await escritura(true)).flush({}, { status: 503, statusText: 'Error' });
    await microtareas();
    http.expectOne(ruta).flush({
      pedido: fixture({ cancelado: true, conservar: true, liberado: true, responsable: 'otro' }),
    });
    expect(await r).toMatchObject({ ok: false, requiereActualizar: true });
  });
  it('tras fallar la consulta bloquea otro POST hasta una actualización explícita', async () => {
    await cargar();
    const s = solicitud(),
      r = api.cancelar(codigo, s);
    (await escritura()).error(new ProgressEvent('error'));
    await microtareas();
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Error' });
    expect((await r).requiereActualizar).toBe(true);
    expect((await api.cancelar(codigo, s)).requiereActualizar).toBe(true);
    http.expectNone((r) => r.method === 'POST');
    await cargar();
    const segundo = api.cancelar(codigo, s);
    (await escritura()).flush({ pedido: fixture({ cancelado: true, conservar: true }) });
    expect((await segundo).ok).toBe(true);
  });
  it.each(['cuenta', 'revision', 'rol'])(
    'descarta respuestas tardías tras cambiar %s',
    async (caso) => {
      await cargar();
      const r = api.cancelar(codigo, solicitud()),
        req = await escritura();
      if (caso === 'revision') TestBed.inject(EstadoAutenticacion).invalidar();
      else
        perfil.set({
          id: caso === 'cuenta' ? 'otra' : 'admin',
          rol: caso === 'rol' ? 'CLIENTE' : 'ADMIN',
        });
      req.flush({ pedido: fixture({ cancelado: true, conservar: true }) });
      expect((await r).ok).toBe(false);
      expect(cache.obtener(codigo)).toBeUndefined();
    },
  );
  it('un contrato de respuesta incorrecto exige GET y no contamina el caché', async () => {
    await cargar();
    const r = api.cancelar(codigo, solicitud());
    (await escritura()).flush({
      pedido: { ...fixture({ cancelado: true, conservar: true }), codigo: 'SOHO-OTRO0001' },
    });
    await microtareas();
    http.expectOne(ruta).flush({ pedido: fixture() });
    expect((await r).requiereActualizar).toBe(true);
    expect(cache.obtener('SOHO-OTRO0001')).toBeUndefined();
  });
});
