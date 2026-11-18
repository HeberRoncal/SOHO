import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { ConfiguracionPagosApi } from './configuracion-pagos-api';
import { DatosCargaQr } from '../modelos/configuracion-pagos';
import {
  ADMIN_PAGOS,
  OTRO_ADMIN_PAGOS,
  CLAVE_PAGOS,
  ID_QR_PAGOS,
  qrPagosFixture,
  consultaPagosFixture,
  publicacionPagosFixture,
  archivoPagosFixture,
} from '../modelos/configuracion-pagos.fixtures';

describe('Publicaciones y cargas reales de Configuración Pagos', () => {
  let api: ConfiguracionPagosApi, http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>(null),
    estadoSesion = signal('autenticado');
  const base = '/api/admin/configuracion/pagos',
    almacen = 'soho:configuracion-pagos:operaciones:' + ADMIN_PAGOS;
  function configurar() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion } },
      ],
    });
    api = TestBed.inject(ConfiguracionPagosApi);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  }
  beforeEach(() => {
    sessionStorage.clear();
    perfil.set({ id: ADMIN_PAGOS, rol: 'ADMIN' });
    estadoSesion.set('autenticado');
    configurar();
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });
  async function leer(version = 0) {
    const p = api.abrir();
    http.expectOne(base).flush(consultaPagosFixture(version));
    await p;
  }
  function editar() {
    api.campo('YAPE', 'activo', true);
    api.campo('YAPE', 'celular', '987 654 321');
    api.campo('YAPE', 'titular', 'SOHO pruebas');
  }
  async function terminar(
    p: Promise<void>,
    configuracion: ReturnType<typeof publicacionPagosFixture>['configuracion'],
  ) {
    await Promise.resolve();
    http.expectOne(base).flush({ ...consultaPagosFixture(), configuracion });
    await p;
  }
  async function subirPendiente() {
    const p = api.cargarQr('YAPE', archivoPagosFixture()),
      r = await vi.waitFor(() => http.expectOne(base + '/qr'));
    const datos = JSON.parse(r.request.body.get('datos'));
    r.flush(
      { archivo: qrPagosFixture('YAPE', 'PENDIENTE') },
      { status: 202, statusText: 'Accepted' },
    );
    await p;
    return datos.claveCarga as string;
  }
  it('consulta versión cero sin activar los valores de demostración', async () => {
    await leer();
    expect(api.actual()?.version).toBe(0);
    expect(api.borrador().every((m) => !m.activo && !m.celular)).toBe(true);
    expect(api.cambios()).toBe(false);
  });
  it('cancela lecturas al actualizar o salir', async () => {
    const a = api.abrir(),
      r = http.expectOne(base);
    const b = api.cargar();
    expect(r.cancelled).toBe(true);
    http.expectOne(base).flush(consultaPagosFixture());
    await Promise.all([a, b]);
    const c = api.cargar(),
      s = http.expectOne(base);
    api.salir();
    expect(s.cancelled).toBe(true);
    await c;
  });
  it('no consulta sin ADMIN ni ofrece demostración', async () => {
    perfil.set({ id: ADMIN_PAGOS, rol: 'CLIENTE' });
    TestBed.tick();
    await api.abrir();
    http.expectNone(base);
    expect(api.borrador()).toEqual([]);
    expect(api.estado()).toBe('sin-permiso');
  });
  it('retira datos al cambiar de cuenta y no incorpora una respuesta anterior', async () => {
    const p = api.abrir(),
      r = http.expectOne(base);
    perfil.set({ id: OTRO_ADMIN_PAGOS, rol: 'ADMIN' });
    expect(api.actual()).toBeNull();
    TestBed.tick();
    expect(r.cancelled).toBe(true);
    await p;
    expect(api.borrador()).toEqual([]);
  });
  it('mantiene el borrador al fallar o cambiar la publicación vigente', async () => {
    await leer();
    editar();
    let p = api.cargar();
    http.expectOne(base).flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(api.borrador()[0].titular).toBe('SOHO pruebas');
    p = api.cargar();
    http.expectOne(base).flush(consultaPagosFixture(2));
    await p;
    expect(api.versionBorrador()).toBe(0);
    expect(api.desactualizado()).toBe(true);
    expect(api.puedePublicar()).toBe(false);
    api.descartar();
    expect(api.versionBorrador()).toBe(2);
  });
  it('no escribe sin confirmación o con receptor inválido', async () => {
    await leer();
    editar();
    await expect(api.publicar(false)).rejects.toThrow();
    api.campo('YAPE', 'celular', '123');
    await expect(api.publicar(true)).rejects.toThrow();
    http.expectNone((r) => r.method === 'PATCH');
    expect(api.publicacion()).toBeNull();
  });
  it('persiste el cuerpo antes del PATCH y bloquea edición y doble envío', async () => {
    await leer();
    editar();
    const p = api.publicar(true),
      r = http.expectOne(base),
      cuerpo = r.request.body;
    expect(r.request.method).toBe('PATCH');
    expect(JSON.parse(sessionStorage.getItem(almacen)!).publicacion).toEqual(cuerpo);
    api.campo('YAPE', 'titular', 'Otro');
    expect(api.borrador()[0].titular).toBe('SOHO pruebas');
    await expect(api.publicar(true)).rejects.toThrow();
    http.expectNone(base);
    const resultado = publicacionPagosFixture(cuerpo);
    r.flush(resultado);
    await terminar(p, resultado.configuracion);
    expect(api.publicacion()?.fase).toBe('confirmada');
    await api.reenviarPublicacion();
    http.expectNone(base);
    api.cerrarPublicacion();
    expect(api.versionBorrador()).toBe(1);
    expect(api.cambios()).toBe(false);
  });
  it('conserva un PATCH incierto y un GET 404 sin otra clave', async () => {
    await leer();
    editar();
    let p = api.publicar(true),
      r = http.expectOne(base),
      cuerpo = r.request.body;
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    p = api.recuperarPublicacion();
    http
      .expectOne(base + '/operaciones/' + cuerpo.claveSolicitud)
      .flush({}, { status: 404, statusText: 'Not Found' });
    await p;
    expect(api.publicacion()?.fase).toBe('incierta');
    api.cerrarPublicacion();
    expect(api.publicacion()).not.toBeNull();
    p = api.reenviarPublicacion();
    r = http.expectOne(base);
    expect(r.request.body).toEqual(cuerpo);
    const resultado = publicacionPagosFixture(cuerpo);
    r.flush(resultado);
    await terminar(p, resultado.configuracion);
  });
  it('un GET histórico no sustituye la publicación vigente', async () => {
    await leer();
    editar();
    let p = api.publicar(true);
    const r = http.expectOne(base),
      cuerpo = r.request.body;
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    p = api.recuperarPublicacion();
    http
      .expectOne(base + '/operaciones/' + cuerpo.claveSolicitud)
      .flush(publicacionPagosFixture(cuerpo));
    await terminar(p, consultaPagosFixture(3).configuracion);
    expect(api.publicacion()?.resultado?.version).toBe(1);
    expect(api.actual()?.version).toBe(3);
  });
  it('una lectura posterior fallida no repite una publicación confirmada', async () => {
    await leer();
    editar();
    const p = api.publicar(true),
      r = http.expectOne(base);
    r.flush(publicacionPagosFixture(r.request.body));
    await Promise.resolve();
    http.expectOne(base).flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(api.publicacion()?.fase).toBe('confirmada');
    expect(api.estado()).toBe('error');
    await api.reenviarPublicacion();
    http.expectNone(base);
  });
  it('un conflicto conserva datos hasta descartar expresamente y usar la versión actual', async () => {
    await leer();
    editar();
    const p = api.publicar(true);
    http.expectOne(base).flush({}, { status: 409, statusText: 'Conflict' });
    await terminar(p, consultaPagosFixture(2).configuracion);
    expect(api.publicacion()?.fase).toBe('rechazada');
    expect(api.versionBorrador()).toBe(0);
    api.cerrarPublicacion();
    expect(api.versionBorrador()).toBe(2);
    expect(api.publicacion()).toBeNull();
  });
  it('no incorpora publicaciones de una cuenta que ya salió', async () => {
    await leer();
    editar();
    const p = api.publicar(true),
      r = http.expectOne(base);
    perfil.set({ id: OTRO_ADMIN_PAGOS, rol: 'ADMIN' });
    TestBed.tick();
    r.flush(publicacionPagosFixture(r.request.body));
    await p;
    expect(api.publicacion()).toBeNull();
    expect(api.actual()).toBeNull();
  });
  it('un 403 retira publicación y datos privados', async () => {
    await leer();
    editar();
    const p = api.publicar(true);
    http.expectOne(base).flush({}, { status: 403, statusText: 'Forbidden' });
    await p;
    expect(api.actual()).toBeNull();
    expect(api.borrador()).toEqual([]);
    expect(api.estado()).toBe('sin-permiso');
  });
  it('no envía si el almacenamiento está bloqueado', async () => {
    await leer();
    editar();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('Quota');
    });
    await expect(api.publicar(true)).rejects.toThrow(/almacenamiento/);
    http.expectNone(base);
  });
  it('conserva recuperación dañada y bloquea nuevas escrituras', async () => {
    http.verify();
    TestBed.resetTestingModule();
    sessionStorage.setItem(almacen, '{incorrecto');
    configurar();
    await leer();
    editar();
    await expect(api.publicar(true)).rejects.toThrow();
    expect(api.errorRecuperacion()).not.toBe('');
    expect(sessionStorage.getItem(almacen)).toBe('{incorrecto');
    http.expectNone(base);
  });
  it('restaura una publicación tras recargar, sin enviarla automáticamente', async () => {
    await leer();
    editar();
    const p = api.publicar(true),
      r = http.expectOne(base),
      clave = r.request.body.claveSolicitud;
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    http.verify();
    TestBed.resetTestingModule();
    configurar();
    expect(api.publicacion()?.cuerpo.claveSolicitud).toBe(clave);
    http.expectNone(base);
  });
  it('reserva nombre, SHA-256 y clave antes del multipart; no cambia la publicación', async () => {
    await leer();
    const p = api.cargarQr('YAPE', archivoPagosFixture()),
      r = await vi.waitFor(() => http.expectOne(base + '/qr'));
    const d = JSON.parse(r.request.body.get('datos'));
    expect(r.request.headers.has('Content-Type')).toBe(false);
    expect(JSON.parse(sessionStorage.getItem(almacen)!).cargas[0].claveCarga).toBe(d.claveCarga);
    r.flush({ archivo: qrPagosFixture() }, { status: 201, statusText: 'Created' });
    await p;
    expect(api.carga('YAPE')?.fase).toBe('confirmada');
    expect(api.borrador()[0].qr).toBeNull();
    expect(api.actual()?.version).toBe(0);
    api.usarQr('YAPE');
    expect(api.borrador()[0].qr?.id).toBe(ID_QR_PAGOS);
    expect(api.cambios()).toBe(true);
    api.quitarQr('YAPE');
    expect(api.borrador()[0].qr).toBeNull();
    http.expectNone((r) => r.method === 'DELETE');
  });
  it('no publica mientras una carga siga pendiente y respeta la próxima revisión', async () => {
    await leer();
    editar();
    const clave = await subirPendiente();
    expect(api.cargasPendientes()).toBe(true);
    await expect(api.publicar(true)).rejects.toThrow();
    await api.recuperarCarga('YAPE');
    http.expectNone(base + '/qr/cargas/' + clave);
    const despues = Date.now() + 6000;
    vi.spyOn(Date, 'now').mockReturnValue(despues);
    const p = api.recuperarCarga('YAPE');
    http.expectOne(base + '/qr/cargas/' + clave).flush({ archivo: qrPagosFixture() });
    await p;
    expect(api.carga('YAPE')?.fase).toBe('confirmada');
    expect(api.puedePublicar()).toBe(true);
  });
  it('rechaza otro archivo para una carga incierta y reenvía el mismo sin nueva clave', async () => {
    await leer();
    let p = api.cargarQr('YAPE', archivoPagosFixture()),
      r = await vi.waitFor(() => http.expectOne(base + '/qr'));
    const clave = JSON.parse(r.request.body.get('datos')).claveCarga;
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    await expect(api.cargarQr('YAPE', archivoPagosFixture('otro.png'))).rejects.toThrow(
      /mismo archivo/,
    );
    http.expectNone(base + '/qr');
    p = api.cargarQr('YAPE', archivoPagosFixture());
    r = await vi.waitFor(() => http.expectOne(base + '/qr'));
    expect(JSON.parse(r.request.body.get('datos')).claveCarga).toBe(clave);
    r.flush({ archivo: qrPagosFixture() }, { status: 201, statusText: 'Created' });
    await p;
  });
  it('un GET 404 de carga conserva su identidad y permite reenviar el original', async () => {
    await leer();
    const p = api.cargarQr('YAPE', archivoPagosFixture()),
      r = await vi.waitFor(() => http.expectOne(base + '/qr'));
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    const clave = api.carga('YAPE')!.datos.claveCarga,
      q = api.recuperarCarga('YAPE');
    http
      .expectOne(base + '/qr/cargas/' + clave)
      .flush({}, { status: 404, statusText: 'Not Found' });
    await q;
    api.cerrarCarga('YAPE');
    expect(api.carga('YAPE')?.datos.claveCarga).toBe(clave);
  });
  it('una carga restaurada puede consultarse sin conservar bytes', async () => {
    await leer();
    let p = api.cargarQr('YAPE', archivoPagosFixture()),
      r = await vi.waitFor(() => http.expectOne(base + '/qr'));
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    const clave = api.carga('YAPE')!.datos.claveCarga;
    http.verify();
    TestBed.resetTestingModule();
    configurar();
    expect(api.carga('YAPE')?.datos.claveCarga).toBe(clave);
    p = api.recuperarCarga('YAPE');
    http.expectOne(base + '/qr/cargas/' + clave).flush({ archivo: qrPagosFixture() });
    await p;
    expect(api.carga('YAPE')?.fase).toBe('confirmada');
  });
  it('no reutiliza el resultado QR de otra billetera', async () => {
    await leer();
    const p = api.cargarQr('YAPE', archivoPagosFixture()),
      r = await vi.waitFor(() => http.expectOne(base + '/qr'));
    r.flush({ archivo: qrPagosFixture('PLIN') }, { status: 201, statusText: 'Created' });
    await p;
    expect(api.carga('YAPE')?.fase).toBe('incierta');
    expect(api.borrador()[0].qr).toBeNull();
  });
  it('permite recuperar un QR confirmado aunque las nuevas cargas estén deshabilitadas', async () => {
    const datos: DatosCargaQr = {
      claveCarga: CLAVE_PAGOS,
      metodo: 'YAPE',
      nombre: 'qr.png',
      tipo: 'image/png',
      tamano: 13,
      sha256: 'a'.repeat(64),
      archivoId: null,
    };
    http.verify();
    TestBed.resetTestingModule();
    sessionStorage.setItem(
      almacen,
      JSON.stringify({ version: 1, responsable: ADMIN_PAGOS, publicacion: null, cargas: [datos] }),
    );
    configurar();
    const p = api.abrir(),
      c = consultaPagosFixture();
    c.capacidades.cargarQr = false;
    http.expectOne(base).flush(c);
    await p;
    const q = api.recuperarCarga('YAPE');
    http.expectOne(base + '/qr/cargas/' + CLAVE_PAGOS).flush({ archivo: qrPagosFixture() });
    await q;
    api.usarQr('YAPE');
    expect(api.borrador()[0].qr?.id).toBe(ID_QR_PAGOS);
  });
});
