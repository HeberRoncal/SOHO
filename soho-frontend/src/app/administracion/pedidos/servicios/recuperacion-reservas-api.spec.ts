import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { PagosAdministracionApi } from '../../pagos/servicios/pagos-administracion-api';
import { RecuperacionReservasApi } from './recuperacion-reservas-api';
import {
  MOTIVO_RECUPERACION,
  planRecuperacionFixture,
  recuperacionApiFixture,
} from './recuperacion-reservas.fixtures';

describe('Recuperación real de reservas desde administración', () => {
  let api: RecuperacionReservasApi, http: HttpTestingController, pedidos: PagosAdministracionApi;
  const perfil = signal<{ id: string; rol: string } | null>(null);
  const codigo = recuperacionApiFixture().codigo;
  const ruta = `/api/admin/pedidos/${codigo}/reservas/recuperacion`;
  const solicitud = () => ({
    versionPedido: 3,
    versionPago: 2,
    motivo: MOTIVO_RECUPERACION,
    confirmado: true,
  });
  beforeEach(() => {
    perfil.set({ id: 'admin', rol: 'ADMIN' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion: signal('autenticado') } },
      ],
    });
    api = TestBed.inject(RecuperacionReservasApi);
    http = TestBed.inject(HttpTestingController);
    pedidos = TestBed.inject(PagosAdministracionApi);
    TestBed.tick();
    pedidos.incorporarPedido(recuperacionApiFixture());
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  it('consulta la disponibilidad sin escribir y la conserva por artículo', async () => {
    const r = api.consultar(codigo);
    http
      .expectOne(ruta)
      .flush({ pedido: recuperacionApiFixture(), recuperacion: planRecuperacionFixture() });
    expect((await r).plan?.articulos[0]).toMatchObject({ cantidad: 2, disponibles: 5, horas: 24 });
    http.expectNone((q) => q.method === 'POST');
  });
  it('guarda solo las versiones abiertas, confirmación y motivo y actualiza la caché', async () => {
    const r = api.guardar(codigo, solicitud()),
      req = http.expectOne(ruta);
    expect(req.request.body).toEqual(solicitud());
    req.flush({ pedido: recuperacionApiFixture(true) });
    expect(await r).toEqual({ ok: true });
    expect(pedidos.obtener(codigo)?.pedido.estadoEntrega).toBe('pendiente');
    expect(pedidos.obtener(codigo)?.pedido.vencimientoReservas?.unidadesLiberadas).toBe(0);
  });
  it('bloquea doble envío mientras espera el primer resultado', async () => {
    const r = api.guardar(codigo, solicitud());
    expect((await api.guardar(codigo, solicitud())).ok).toBe(false);
    http.expectOne(ruta).flush({ pedido: recuperacionApiFixture(true) });
    await r;
  });
  it('reconcilia un COMMIT sin respuesta mediante GET sin repetir POST', async () => {
    const r = api.guardar(codigo, solicitud());
    http.expectOne(ruta).error(new ProgressEvent('error'));
    await Promise.resolve();
    http.expectOne(`/api/admin/pedidos/${codigo}`).flush({ pedido: recuperacionApiFixture(true) });
    expect(await r).toEqual({ ok: true, recuperado: true });
    http.expectNone((q) => q.method === 'POST');
  });
  it('un 409 conserva el conflicto aunque la misma cuenta haya recuperado en otra ventana', async () => {
    const r = api.guardar(codigo, solicitud());
    http.expectOne(ruta).flush({}, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    http.expectOne(`/api/admin/pedidos/${codigo}`).flush({ pedido: recuperacionApiFixture(true) });
    expect(await r).toMatchObject({ ok: false, requiereActualizar: true });
  });
  it('no atribuye una respuesta perdida a otro administrador', async () => {
    const r = api.guardar(codigo, solicitud());
    http.expectOne(ruta).error(new ProgressEvent('error'));
    await Promise.resolve();
    http
      .expectOne(`/api/admin/pedidos/${codigo}`)
      .flush({ pedido: recuperacionApiFixture(true, 'otro') });
    expect(await r).toMatchObject({ ok: false, requiereActualizar: true });
  });
  it('exige una consulta explícita tras un resultado incierto y conserva las versiones abiertas', async () => {
    const r = api.guardar(codigo, solicitud());
    http.expectOne(ruta).error(new ProgressEvent('error'));
    await Promise.resolve();
    http.expectOne(`/api/admin/pedidos/${codigo}`).error(new ProgressEvent('error'));
    expect(await r).toMatchObject({ ok: false, requiereActualizar: true });
    expect((await api.guardar(codigo, solicitud())).ok).toBe(false);
    http.expectNone(ruta);
    const consulta = api.consultar(codigo);
    http
      .expectOne(ruta)
      .flush({ pedido: recuperacionApiFixture(), recuperacion: planRecuperacionFixture() });
    expect((await consulta).ok).toBe(true);
    const reintento = api.guardar(codigo, solicitud());
    http.expectOne(ruta).flush({ pedido: recuperacionApiFixture(true) });
    expect((await reintento).ok).toBe(true);
  });
  it.each([401, 403])(
    'retira los datos privados cuando el servidor responde %s',
    async (status) => {
      const r = api.consultar(codigo);
      http.expectOne(ruta).flush({}, { status, statusText: 'Unauthorized' });
      expect((await r).ok).toBe(false);
      expect(pedidos.obtener(codigo)).toBeUndefined();
    },
  );
  it('descarta una consulta tardía después de cambiar de cuenta', async () => {
    const r = api.consultar(codigo),
      req = http.expectOne(ruta);
    perfil.set({ id: 'otro', rol: 'ADMIN' });
    TestBed.tick();
    req.flush({ pedido: recuperacionApiFixture(), recuperacion: planRecuperacionFixture() });
    expect((await r).ok).toBe(false);
    expect(pedidos.obtener(codigo)).toBeUndefined();
  });
  it.each([{ confirmado: false }, { motivo: 'corto' }, { versionPedido: 2 }])(
    'no envía solicitudes inválidas: %j',
    (cambio) => {
      const r = api.guardar(codigo, { ...solicitud(), ...cambio });
      http.expectNone(ruta);
      return expect(r).resolves.toMatchObject({ ok: false });
    },
  );
  it('descarta planes de otro pedido y disponibilidades imposibles', async () => {
    const plan = planRecuperacionFixture();
    plan.articulos[0].disponibles = 0;
    const r = api.consultar(codigo);
    http.expectOne(ruta).flush({ pedido: recuperacionApiFixture(), recuperacion: plan });
    expect((await r).ok).toBe(false);
  });
});
