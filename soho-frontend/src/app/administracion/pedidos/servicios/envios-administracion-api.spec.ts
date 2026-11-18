import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { autenticacionInterceptor } from '../../../tienda/cuenta/servicios/autenticacion-interceptor';
import { pedidoApi } from '../../../tienda/pedidos/servicios/pedidos-api.fixtures';
import { PagosAdministracionApi } from '../../pagos/servicios/pagos-administracion-api';
import { CambioEntregaAdmin, AccionEntregaAdmin } from '../modelos/entrega-admin';
import { EnviosAdministracionApi } from './envios-administracion-api';

const codigo = 'SOHO-TEST0001',
  ruta = `/api/admin/pedidos/${codigo}`;
export function envioAdminFixture(estado = 'CONFIRMADO', version = 2) {
  const p = pedidoApi();
  const envio =
    estado === 'CONFIRMADO'
      ? null
      : {
          preparacionIniciadaEn: '2026-11-14T13:00:00.000Z',
          transportista: estado === 'EN_PREPARACION' ? null : 'Reparto SOHO',
          referenciaSeguimiento: estado === 'EN_PREPARACION' ? null : '000123',
          despachadoEn: estado === 'EN_PREPARACION' ? null : '2026-11-14T14:00:00.000Z',
          entregadoEn: estado === 'ENTREGADO' ? '2026-11-14T15:00:00.000Z' : null,
        };
  return {
    ...p,
    version,
    estadoEntrega: estado,
    envio,
    pago: {
      ...p.pago,
      estado: 'APROBADO',
      comprobantes: p.pago.comprobantes.map((c) => ({
        ...c,
        creadoEn: p.fecha,
        estadoRevision: 'APROBADO',
        montoInformado: null,
        motivo: null,
        solicitudCorreccion: null,
        revisadoEn: p.fecha,
      })),
    },
    tipoCliente: 'registrado',
    clienteId: 'cliente',
    eventos: [],
    eventosInternos: [],
    revisores: [],
    responsablesEnvio: envio
      ? {
          preparacion: { id: 'admin', nombre: 'Sofía Admin' },
          despacho: envio.despachadoEn ? { id: 'admin', nombre: 'Sofía Admin' } : null,
          entrega: envio.entregadoEn ? { id: 'admin', nombre: 'Sofía Admin' } : null,
        }
      : null,
  };
}

describe('Preparación, despacho y entrega mediante API', () => {
  let api: EnviosAdministracionApi, cache: PagosAdministracionApi, http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>(null);
  const cambio = (
    accion: AccionEntregaAdmin = 'preparar',
    versionPedido = 2,
  ): CambioEntregaAdmin => ({
    accion,
    versionPedido,
    estadoEsperado:
      accion === 'preparar' ? 'confirmado' : accion === 'enviar' ? 'en-preparacion' : 'enviado',
    empresa: ' Reparto SOHO ',
    seguimiento: ' 000123 ',
    nota: ' Nota privada\n Embalaje revisado ',
    confirmado: accion === 'entregar',
  });
  beforeEach(() => {
    perfil.set({ id: 'admin', rol: 'ADMIN' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion: signal('autenticado') } },
      ],
    });
    api = TestBed.inject(EnviosAdministracionApi);
    cache = TestBed.inject(PagosAdministracionApi);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  async function cargar(estado = 'CONFIRMADO', version = 2) {
    const p = api.actualizar(codigo);
    http.expectOne(ruta).flush({ pedido: envioAdminFixture(estado, version) });
    expect((await p).ok).toBe(true);
  }
  function escritura(accion = 'preparacion') {
    http.match('/api/auth/csrf').forEach((r) => r.flush({ csrfToken: 'a'.repeat(64) }));
    return http.expectOne(`${ruta}/${accion}`);
  }
  const microtareas = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  it.each([
    ['preparar', 'CONFIRMADO', 'EN_PREPARACION', 'preparacion'],
    ['enviar', 'EN_PREPARACION', 'ENVIADO', 'envio'],
    ['entregar', 'ENVIADO', 'ENTREGADO', 'entrega'],
  ] as const)(
    'confirma %s con CSRF, versión y solo sus campos autorizados',
    async (accion, origen, destino, endpoint) => {
      await cargar(origen);
      const p = api.guardar(codigo, cambio(accion));
      const r = escritura(endpoint);
      expect(r.request.withCredentials).toBe(true);
      expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
      expect(r.request.body).toEqual({
        versionPedido: 2,
        nota: 'Nota privada\n Embalaje revisado',
        ...(accion === 'enviar'
          ? { transportista: 'Reparto SOHO', referenciaSeguimiento: '000123' }
          : {}),
        ...(accion === 'entregar' ? { confirmado: true } : {}),
      });
      expect(cache.obtener(codigo)?.pedido.estadoEntrega).toBe(
        origen.toLowerCase().replaceAll('_', '-'),
      );
      r.flush({ pedido: envioAdminFixture(destino, 3) });
      expect((await p).ok).toBe(true);
      expect(cache.obtener(codigo)?.pedido.estadoEntrega).toBe(
        destino.toLowerCase().replaceAll('_', '-'),
      );
    },
  );
  it('bloquea doble envío y conserva el estado confirmado mientras espera', async () => {
    await cargar();
    const p = api.guardar(codigo, cambio());
    const r = escritura();
    expect((await api.guardar(codigo, cambio())).ok).toBe(false);
    http.expectNone((q) => q.url === ruta + '/preparacion');
    expect(cache.obtener(codigo)?.pedido.estadoEntrega).toBe('confirmado');
    r.flush({ pedido: envioAdminFixture('EN_PREPARACION', 3) });
    expect((await p).ok).toBe(true);
  });
  it('consulta tras una respuesta perdida y reconoce la preparación persistida sin otro POST', async () => {
    await cargar();
    const p = api.guardar(codigo, cambio());
    escritura().flush({}, { status: 503, statusText: 'Respuesta perdida' });
    await microtareas();
    http.expectOne(ruta).flush({ pedido: envioAdminFixture('EN_PREPARACION', 3) });
    expect(await p).toMatchObject({ ok: true, recuperado: true });
    expect(cache.obtener(codigo)?.pedido.responsablesEnvio?.preparacion?.id).toBe('admin');
  });
  it('una respuesta perdida de despacho conserva los ceros y el seguimiento confirmado', async () => {
    await cargar('EN_PREPARACION', 3);
    const p = api.guardar(codigo, cambio('enviar', 3));
    escritura('envio').error(new ProgressEvent('error'));
    await microtareas();
    http.expectOne(ruta).flush({ pedido: envioAdminFixture('ENVIADO', 4) });
    expect(await p).toMatchObject({ ok: true, recuperado: true });
    expect(cache.obtener(codigo)?.pedido.seguimiento).toEqual({
      empresa: 'Reparto SOHO',
      codigo: '000123',
    });
  });
  it('si también falla la consulta bloquea otro POST hasta una lectura explícita', async () => {
    await cargar();
    const p = api.guardar(codigo, cambio());
    escritura().error(new ProgressEvent('error'));
    await microtareas();
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(await p).toMatchObject({ ok: false, requiereActualizar: true });
    expect(await api.guardar(codigo, cambio())).toMatchObject({
      ok: false,
      requiereActualizar: true,
    });
    http.expectNone((q) => q.method === 'POST');
    await cargar();
    const otra = api.guardar(codigo, cambio());
    escritura().flush({ pedido: envioAdminFixture('EN_PREPARACION', 3) });
    expect((await otra).ok).toBe(true);
  });
  it('un conflicto adopta la lectura actual sin repetir la etapa ni afirmar éxito propio', async () => {
    await cargar();
    const p = api.guardar(codigo, cambio());
    escritura().flush({ codigo: 'ENTREGA_CAMBIADA' }, { status: 409, statusText: 'Conflict' });
    await microtareas();
    http.expectOne(ruta).flush({ pedido: envioAdminFixture('EN_PREPARACION', 3) });
    expect(await p).toMatchObject({ ok: false, requiereActualizar: true });
    expect((await api.guardar(codigo, cambio())).ok).toBe(false);
    http.expectNone((q) => q.method === 'POST');
  });
  it('explica la inconsistencia de inventario y conserva la etapa previa', async () => {
    await cargar('EN_PREPARACION', 3);
    const p = api.guardar(codigo, cambio('enviar', 3));
    escritura('envio').flush(
      { codigo: 'INVENTARIO_INCONSISTENTE' },
      { status: 409, statusText: 'Conflict' },
    );
    await microtareas();
    http.expectOne(ruta).flush({ pedido: envioAdminFixture('EN_PREPARACION', 3) });
    expect((await p).errores['estado']).toContain('inventario');
    expect(cache.obtener(codigo)?.pedido.estadoEntrega).toBe('en-preparacion');
  });
  it.each([400, 429])(
    'maneja un rechazo %s sin repetir la escritura ni afirmar un cambio',
    async (status) => {
      await cargar();
      const p = api.guardar(codigo, cambio());
      escritura().flush({}, { status, statusText: 'Rejected' });
      expect((await p).ok).toBe(false);
      expect(cache.obtener(codigo)?.pedido.version).toBe(2);
      http.expectNone(ruta);
    },
  );
  it('retira el detalle privado cuando se pierde la autorización', async () => {
    await cargar();
    const p = api.guardar(codigo, cambio());
    escritura().flush({}, { status: 403, statusText: 'Forbidden' });
    expect((await p).ok).toBe(false);
    expect(cache.obtener(codigo)).toBeUndefined();
  });
  it.each(['respuesta', 'error'])('descarta una %s tardía de otra sesión', async (tipo) => {
    await cargar();
    const p = api.guardar(codigo, cambio()),
      r = escritura();
    perfil.set({ id: 'otro-admin', rol: 'ADMIN' });
    TestBed.tick();
    if (tipo === 'respuesta') r.flush({ pedido: envioAdminFixture('EN_PREPARACION', 3) });
    else r.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect((await p).ok).toBe(false);
    expect(cache.obtener(codigo)).toBeUndefined();
    http.expectNone(ruta);
  });
  it('descarta una respuesta de la misma cuenta tras renovar la sesión', async () => {
    await cargar();
    const p = api.guardar(codigo, cambio()),
      r = escritura();
    TestBed.inject(EstadoAutenticacion).invalidar('Sesión cambiada');
    r.flush({ pedido: envioAdminFixture('EN_PREPARACION', 3) });
    expect((await p).ok).toBe(false);
    expect(cache.obtener(codigo)).toBeUndefined();
  });
  it('rechaza versiones viejas, datos inválidos y cuentas cliente antes de escribir', async () => {
    await cargar('EN_PREPARACION', 3);
    expect((await api.guardar(codigo, cambio('enviar', 2))).ok).toBe(false);
    expect((await api.guardar(codigo, { ...cambio('enviar', 3), empresa: 'x' })).ok).toBe(false);
    perfil.set({ id: 'cliente', rol: 'CLIENTE' });
    TestBed.tick();
    expect((await api.actualizar(codigo)).ok).toBe(false);
    expect((await api.guardar(codigo, cambio('enviar', 3))).ok).toBe(false);
    http.expectNone((q) => q.method === 'POST');
  });
  it('un listado atrasado no devuelve el estado anterior al despacho', async () => {
    await cargar('EN_PREPARACION', 3);
    const lista = cache.cargarListado({}, 'pedidos'),
      r = http.expectOne('/api/admin/pedidos');
    const p = api.guardar(codigo, cambio('enviar', 3));
    escritura('envio').flush({ pedido: envioAdminFixture('ENVIADO', 4) });
    await p;
    r.flush({
      pedidos: [envioAdminFixture('EN_PREPARACION', 3)],
      conteos: { APROBADO: 1 },
      paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
    });
    await lista;
    expect(cache.resultados()[0].pedido.estadoEntrega).toBe('enviado');
    expect(cache.obtener(codigo)?.pedido.version).toBe(4);
  });
});
