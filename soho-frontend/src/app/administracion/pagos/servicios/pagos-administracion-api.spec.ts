import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { pedidoApi } from '../../../tienda/pedidos/servicios/pedidos-api.fixtures';
import { adaptarPagoAdmin, PagosAdministracionApi } from './pagos-administracion-api';
import { PagosAdministracion } from './pagos-administracion';

export function pagoAdminFixture() {
  const p = pedidoApi();
  return {
    ...p,
    tipoCliente: 'registrado',
    clienteId: 'ana',
    eventos: [],
    eventosInternos: [],
    revisores: [],
    pago: {
      ...p.pago,
      comprobantes: p.pago.comprobantes.map((c) => ({
        ...c,
        creadoEn: p.fecha,
        estadoRevision: 'PENDIENTE',
        montoInformado: null,
        motivo: null,
        solicitudCorreccion: null,
        revisadoEn: null,
      })),
    },
  };
}
describe('Administración real de pagos', () => {
  let api: PagosAdministracionApi, http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>(null);
  beforeEach(() => {
    perfil.set({ id: 'ana', rol: 'ADMIN' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion: signal('autenticado') } },
      ],
    });
    api = TestBed.inject(PagosAdministracionApi);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  it('el proveedor predeterminado usa la API y no ofrece operaciones de simulación', () => {
    expect(TestBed.inject(PagosAdministracion)).toBe(api);
    expect('simularCorreccion' in api).toBe(false);
    expect('restablecer' in api).toBe(false);
    expect(api.pagos()).toEqual([]);
  });
  it('adapta datos históricos, versión de pago y ausencia de monto sin inventarlo', () => {
    const p = adaptarPagoAdmin(pagoAdminFixture());
    expect(p.pedido).toMatchObject({ remoto: true, version: 1, versionPago: 1, total: 199.98 });
    expect(p.comprobantes[0].monto).toBeNull();
    expect(p.pedido.cliente.tipo).toBe('registrado');
  });
  it.each([
    { unidadesLiberadas: 2, unidadesConservadas: 0 },
    { unidadesLiberadas: 0, unidadesConservadas: 2 },
    { unidadesLiberadas: 1, unidadesConservadas: 1 },
  ])(
    'conserva la alerta de vencimiento consultada sin calcularla con el reloj local: %j',
    (vencimientoReservas) => {
      const p = adaptarPagoAdmin({ ...pagoAdminFixture(), vencimientoReservas });
      expect(p.pedido.vencimientoReservas).toEqual(vencimientoReservas);
      expect(Object.isFrozen(p.pedido.vencimientoReservas)).toBe(true);
    },
  );
  it.each([
    { unidadesLiberadas: -1, unidadesConservadas: 0 },
    { unidadesLiberadas: 1.5, unidadesConservadas: 0 },
    { unidadesLiberadas: '2', unidadesConservadas: 0 },
    { unidadesLiberadas: 2, unidadesConservadas: 2 },
  ])('rechaza cantidades incoherentes del vencimiento: %j', (vencimientoReservas) => {
    expect(() => adaptarPagoAdmin({ ...pagoAdminFixture(), vencimientoReservas })).toThrow(
      'Vencimientos',
    );
  });
  it.each(['APROBADO', 'ANULADO', 'RECHAZADO'])(
    'rechaza alertas vigentes para pagos %s',
    (estado) => {
      const p = pagoAdminFixture();
      expect(() =>
        adaptarPagoAdmin({
          ...p,
          pago: { ...p.pago, estado },
          vencimientoReservas: { unidadesLiberadas: 0, unidadesConservadas: 2 },
        }),
      ).toThrow('Vencimientos');
    },
  );
  it('envía el filtro de vencimiento al servidor y evita aprobar una reserva liberada', async () => {
    const promesa = api.cargarListado({ reserva: 'vencida' }, 'pedidos');
    const r = http.expectOne(
      (q) => q.url === '/api/admin/pedidos' && q.params.get('reserva') === 'vencida',
    );
    const p = {
      ...pagoAdminFixture(),
      estadoEntrega: 'INCIDENCIA',
      vencimientoReservas: { unidadesLiberadas: 2, unidadesConservadas: 0 },
    };
    r.flush({
      pedidos: [p],
      conteos: {},
      paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
    });
    await promesa;
    expect(
      await api.revisar(p.codigo, {
        accion: 'aprobado',
        comprobanteId: p.pago.comprobantes[0].id,
        confirmado: true,
        motivo: '',
        mensaje: '',
        solicitud: 'legible',
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('reserva') });
    http.expectNone((q) => q.method === 'POST');
  });
  it('incorpora las reservas vencidas al resumen y las retira al cambiar de sesión', async () => {
    const carga = api.cargarResumen('2026-11-14', '2026-11-14');
    http
      .expectOne((q) => q.url === '/api/admin/resumen-pedidos')
      .flush({
        pendientes: [],
        observados: [],
        porPreparar: [],
        incidencias: [],
        recientes: [],
        reservasVencidas: [
          {
            ...pagoAdminFixture(),
            vencimientoReservas: { unidadesLiberadas: 0, unidadesConservadas: 2 },
          },
        ],
        reservasVencidasTotal: 7,
        conteos: {},
        porPrepararTotal: 0,
        incidenciasTotal: 0,
        importePendiente: '0.00',
        ventas: [],
      });
    await carga;
    expect(api.resumenRemoto()?.reservasVencidas).toHaveLength(1);
    expect(api.resumenRemoto()?.reservasVencidasTotal).toBe(7);
    perfil.set(null);
    TestBed.tick();
    expect(api.resumenRemoto()).toBeNull();
  });
  it('consulta filtros y paginación en servidor', async () => {
    const promesa = api.cargarListado({ estado: 'PENDIENTE', pagina: '2', metodo: 'YAPE' });
    const r = http.expectOne(
      (q) =>
        q.url === '/api/admin/pagos' &&
        q.params.get('pagina') === '2' &&
        q.params.get('estado') === 'PENDIENTE',
    );
    r.flush({
      pedidos: [pagoAdminFixture()],
      conteos: { PENDIENTE: 21 },
      paginacion: { pagina: 2, limite: 20, total: 21, paginas: 2 },
    });
    await promesa;
    expect(api.resultados()).toHaveLength(1);
    expect(api.paginacion().total).toBe(21);
    expect(api.estadoListado()).toBe('lista');
  });
  it('descarta listas tardías de otra cuenta', async () => {
    const p = api.cargarListado();
    const r = http.expectOne('/api/admin/pagos');
    perfil.set({ id: 'otra', rol: 'ADMIN' });
    TestBed.tick();
    r.flush({ pedidos: [pagoAdminFixture()] });
    await p;
    expect(api.resultados()).toEqual([]);
    expect(api.obtener('SOHO-TEST0001')).toBeUndefined();
  });
  it('descarta errores tardíos sin borrar la sesión nueva', async () => {
    const p = api.cargarDetalle('SOHO-TEST0001');
    const r = http.expectOne('/api/admin/pagos/SOHO-TEST0001');
    perfil.set({ id: 'otra', rol: 'ADMIN' });
    TestBed.tick();
    r.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect((await p).ok).toBe(false);
    expect(api.obtener('SOHO-TEST0001')).toBeUndefined();
  });
  it('envía la identidad y versiones revisadas y conserva confirmación real', async () => {
    const p = api.revisar('SOHO-TEST0001', {
      accion: 'aprobado',
      comprobanteId: pagoAdminFixture().pago.comprobantes[0].id,
      versionPedido: 1,
      versionPago: 1,
      confirmado: true,
      motivo: '',
      mensaje: '',
      solicitud: 'legible',
    });
    const r = http.expectOne('/api/admin/pagos/SOHO-TEST0001/decision');
    expect(r.request.body).toEqual({
      accion: 'APROBADO',
      comprobanteId: pagoAdminFixture().pago.comprobantes[0].id,
      versionPedido: 1,
      versionPago: 1,
      confirmado: true,
    });
    const aprobado = pagoAdminFixture();
    aprobado.version = 2;
    aprobado.pago.version = 2;
    aprobado.pago.estado = 'APROBADO';
    aprobado.estadoEntrega = 'CONFIRMADO';
    r.flush({ pedido: aprobado });
    expect((await p).ok).toBe(true);
    expect(api.obtener(aprobado.codigo)?.pedido.estadoPago).toBe('aprobado');
  });
  it('ante un conflicto consulta el estado y no repite la escritura', async () => {
    const p = api.revisar('SOHO-TEST0001', {
      accion: 'rechazado',
      versionPedido: 1,
      versionPago: 1,
      comprobanteId: pagoAdminFixture().pago.comprobantes[0].id,
      confirmado: true,
      motivo: 'monto',
      mensaje: 'El monto no corresponde.',
      solicitud: 'legible',
    });
    http
      .expectOne('/api/admin/pagos/SOHO-TEST0001/decision')
      .flush({}, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/admin/pagos/SOHO-TEST0001').flush({ pedido: pagoAdminFixture() });
    expect((await p).ok).toBe(false);
  });
  it('una sesión cliente no consulta ni decide pagos administrativos', async () => {
    perfil.set({ id: 'cliente', rol: 'CLIENTE' });
    TestBed.tick();
    await api.cargarListado();
    expect((await api.cargarDetalle('SOHO-TEST0001')).ok).toBe(false);
    http.expectNone('/api/admin/pagos');
  });
  it('ordena las versiones del comprobante por número, conservando revisiones anteriores', () => {
    const p = pagoAdminFixture(),
      anterior = {
        ...p.pago.comprobantes[0],
        estadoRevision: 'OBSERVADO',
        mensaje: 'Sube una captura legible.',
        motivo: 'ILEGIBLE',
        solicitudCorreccion: 'LEGIBLE',
        revisadoEn: p.fecha,
      },
      actual = {
        ...p.pago.comprobantes[0],
        id: '45093077-3e17-4197-b8ba-1aa940f6beaa',
        version: 2,
      };
    const r = adaptarPagoAdmin({ ...p, pago: { ...p.pago, comprobantes: [anterior, actual] } });
    expect(r.comprobantes[0].id).toBe(actual.id);
    expect(r.comprobantes[1].estado).toBe('observado');
  });
});
