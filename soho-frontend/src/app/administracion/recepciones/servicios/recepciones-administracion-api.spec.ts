import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { RecepcionesAdministracionApi } from './recepciones-administracion-api';
import {
  ID_ADMIN,
  ID_COMPROBANTE,
  ID_OPERACION,
  ID_RECEPCION,
  ID_OTRA_RECEPCION,
  detalleRecepcionFixture,
  listadoRecepcionesFixture,
  resultadoRecepcionFixture,
} from '../modelos/recepciones.fixtures';

describe('Recepciones administrativas reales', () => {
  let api: RecepcionesAdministracionApi, http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>(null),
    estadoSesion = signal('autenticado');
  const base = '/api/admin/recepciones',
    ruta = base + '/' + ID_RECEPCION,
    almacen = 'soho:recepciones:decisiones:' + ID_ADMIN;
  function configurar() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil, estadoSesion } },
      ],
    });
    api = TestBed.inject(RecepcionesAdministracionApi);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  }
  beforeEach(() => {
    sessionStorage.clear();
    perfil.set({ id: ID_ADMIN, rol: 'ADMIN' });
    estadoSesion.set('autenticado');
    configurar();
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });
  async function ficha() {
    const p = api.cargarDetalle(ID_RECEPCION);
    http.expectOne(ruta).flush(detalleRecepcionFixture());
    await p;
  }
  const enviar = (correccion = false) =>
    api.decidir(
      ID_RECEPCION,
      correccion ? 'SOLICITAR_CORRECCION' : 'REGISTRAR_PEDIDO',
      'Revisión del caso original',
      'Adjunta la imagen de la misma transferencia.',
      true,
      !correccion,
    );
  const post = (correccion = false) =>
    http.expectOne(ruta + (correccion ? '/solicitud-correccion' : '/registro-pedido'));
  async function lecturaTrasResultado(p: Promise<void>, version = 4) {
    await Promise.resolve();
    const d = detalleRecepcionFixture();
    d.recepcion.version = version;
    http.expectOne(ruta).flush(d);
    await p;
  }
  it('consulta filtros remotos y no calcula conteos desde la página', async () => {
    const p = api.cargarListado({ busqueda: 'Ana %', estado: 'REQUIERE_ATENCION', pagina: '1' }),
      r = http.expectOne((q) => q.url === base);
    expect(r.request.params.get('busqueda')).toBe('Ana %');
    expect(r.request.params.get('estado')).toBe('REQUIERE_ATENCION');
    r.flush(listadoRecepcionesFixture());
    await p;
    expect(api.recepciones()).toHaveLength(1);
    expect(api.resumen()?.RECIBIDA).toBe(4);
  });
  it('cancela la búsqueda anterior y los detalles al salir', async () => {
    const a = api.cargarListado({ busqueda: 'vieja' }),
      vieja = http.expectOne((q) => q.params.get('busqueda') === 'vieja');
    const b = api.cargarListado({ busqueda: 'nueva' });
    expect(vieja.cancelled).toBe(true);
    http.expectOne((q) => q.params.get('busqueda') === 'nueva').flush(listadoRecepcionesFixture());
    await Promise.all([a, b]);
    const c = api.cargarDetalle(ID_RECEPCION),
      detalle = http.expectOne(ruta);
    api.salirDetalle();
    expect(detalle.cancelled).toBe(true);
    await c;
    expect(api.detalle()).toBeNull();
  });
  it('no consulta sin ADMIN ni intenta fuentes de demostración', async () => {
    perfil.set({ id: ID_ADMIN, rol: 'CLIENTE' });
    TestBed.tick();
    await api.cargarListado();
    http.expectNone(base);
    expect(api.estadoListado()).toBe('sin-permiso');
  });
  it('no consulta referencias inválidas', async () => {
    await api.cargarDetalle('../otra');
    http.expectNone(base + '/../otra');
    expect(api.estadoDetalle()).toBe('ausente');
  });
  it('retira datos inmediatamente al cambiar de cuenta', async () => {
    await ficha();
    perfil.set({ id: ID_OTRA_RECEPCION, rol: 'ADMIN' });
    expect(api.detalle()).toBeNull();
    TestBed.tick();
    expect(api.recepciones()).toEqual([]);
  });
  it('retira detalle y conteos ante 403', async () => {
    await ficha();
    const p = api.cargarListado();
    http.expectOne(base).flush({}, { status: 403, statusText: 'Forbidden' });
    await p;
    expect(api.detalle()).toBeNull();
    expect(api.resumen()).toBeNull();
    expect(api.estadoDetalle()).toBe('sin-permiso');
  });
  it('distingue un 404 de infraestructura y permite reintentar la consulta', async () => {
    let p = api.cargarDetalle(ID_RECEPCION);
    http.expectOne(ruta).flush({}, { status: 404, statusText: 'Not Found' });
    await p;
    expect(api.estadoDetalle()).toBe('ausente');
    p = api.cargarDetalle(ID_RECEPCION);
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(api.estadoDetalle()).toBe('error');
    await ficha();
    expect(api.estadoDetalle()).toBe('lista');
  });
  it('rechaza respuestas inválidas sin habilitar decisiones', async () => {
    const p = api.cargarDetalle(ID_RECEPCION),
      d = detalleRecepcionFixture();
    d.recepcion.instruccion.importeReferencia = '1.00';
    http.expectOne(ruta).flush(d);
    await p;
    expect(api.detalle()).toBeNull();
    expect(api.estadoDetalle()).toBe('error');
  });
  it('exige motivo y confirmación antes de generar una escritura', async () => {
    await ficha();
    await expect(
      api.decidir(ID_RECEPCION, 'REGISTRAR_PEDIDO', 'abc', '', false, true),
    ).rejects.toThrow();
    await expect(
      api.decidir(ID_RECEPCION, 'REGISTRAR_PEDIDO', '  ', '', true, true),
    ).rejects.toThrow();
    http.expectNone(ruta + '/registro-pedido');
    expect(sessionStorage.getItem(almacen)).toBeNull();
  });
  it('guarda el cuerpo exacto antes del POST y bloquea el doble envío', async () => {
    await ficha();
    const p = enviar(),
      r = post();
    const cuerpo = r.request.body;
    expect(cuerpo).toEqual({
      claveSolicitud: expect.any(String),
      comprobanteActualId: ID_COMPROBANTE,
      versionEsperada: 3,
      motivo: 'Revisión del caso original',
      confirmado: true,
      aceptarCondicionesOriginales: true,
    });
    expect(JSON.parse(sessionStorage.getItem(almacen)!).intentos[0].cuerpo).toEqual(cuerpo);
    await enviar();
    http.expectNone(ruta + '/registro-pedido');
    r.flush(resultadoRecepcionFixture(cuerpo.claveSolicitud));
    await lecturaTrasResultado(p);
    expect(api.intento(ID_RECEPCION)?.estado).toBe('confirmada');
    expect(api.intento(ID_RECEPCION)?.mensaje).toMatch(/pendiente de revisión/);
    await api.reenviar(ID_RECEPCION);
    http.expectNone(ruta + '/registro-pedido');
  });
  it('separa motivo interno y mensaje al solicitar corrección', async () => {
    await ficha();
    const p = enviar(true),
      r = post(true);
    expect(r.request.body.mensaje).toMatch(/misma transferencia/);
    expect(r.request.body.aceptarCondicionesOriginales).toBeUndefined();
    r.flush(resultadoRecepcionFixture(r.request.body.claveSolicitud, true));
    await lecturaTrasResultado(p);
    expect(api.intento(ID_RECEPCION)?.resultado?.resultado).toBe('SOLICITAR_CORRECCION');
  });
  it('conserva un POST incierto y reenvía el mismo cuerpo sin otra clave', async () => {
    await ficha();
    let p = enviar(),
      r = post();
    const cuerpo = r.request.body;
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(api.intento(ID_RECEPCION)?.estado).toBe('incierta');
    await api.decidir(ID_RECEPCION, 'REGISTRAR_PEDIDO', 'Otro texto', '', true, true);
    http.expectNone(ruta + '/registro-pedido');
    p = api.reenviar(ID_RECEPCION);
    r = post();
    expect(r.request.body).toEqual(cuerpo);
    r.flush(resultadoRecepcionFixture(cuerpo.claveSolicitud));
    await lecturaTrasResultado(p);
  });
  it('un GET 404 no descarta una escritura cuyo resultado se desconoce', async () => {
    await ficha();
    let p = enviar();
    const r = post();
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    p = api.recuperar(ID_RECEPCION);
    http
      .expectOne(ruta + '/operaciones/' + r.request.body.claveSolicitud)
      .flush({}, { status: 404, statusText: 'Not Found' });
    await p;
    expect(api.intento(ID_RECEPCION)?.estado).toBe('incierta');
    api.cerrarIntento(ID_RECEPCION);
    expect(api.intento(ID_RECEPCION)).toBeDefined();
  });
  it('respeta Retry-After y recupera un 202 sin repetir POST', async () => {
    await ficha();
    let p = enviar(),
      r = post();
    const clave = r.request.body.claveSolicitud;
    r.flush(resultadoRecepcionFixture(clave, false, true), {
      status: 202,
      statusText: 'Accepted',
      headers: { 'Retry-After': '5' },
    });
    await p;
    expect(api.intento(ID_RECEPCION)?.estado).toBe('pendiente');
    await api.recuperar(ID_RECEPCION);
    http.expectNone(ruta + '/operaciones/' + clave);
    const despues = Date.now() + 6000;
    vi.spyOn(Date, 'now').mockReturnValue(despues);
    p = api.recuperar(ID_RECEPCION);
    http.expectOne(ruta + '/operaciones/' + clave).flush(resultadoRecepcionFixture(clave));
    await lecturaTrasResultado(p, 7);
    expect(api.detalle()?.recepcion.version).toBe(7);
    expect(api.intento(ID_RECEPCION)?.resultado?.recepcion.version).toBe(4);
  });
  it('un fallo de la lectura posterior no repite la decisión confirmada', async () => {
    await ficha();
    const p = enviar(),
      r = post();
    r.flush(resultadoRecepcionFixture(r.request.body.claveSolicitud));
    await Promise.resolve();
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(api.intento(ID_RECEPCION)?.estado).toBe('confirmada');
    expect(api.estadoDetalle()).toBe('error');
    await api.reenviar(ID_RECEPCION);
    http.expectNone(ruta + '/registro-pedido');
  });
  it('un conflicto definitivo exige leer el estado vigente antes de otra decisión', async () => {
    await ficha();
    const p = enviar(),
      r = post();
    r.flush({}, { status: 409, statusText: 'Conflict' });
    await lecturaTrasResultado(p, 5);
    expect(api.intento(ID_RECEPCION)?.estado).toBe('rechazada');
    await api.reenviar(ID_RECEPCION);
    http.expectNone(ruta + '/registro-pedido');
    api.cerrarIntento(ID_RECEPCION);
    expect(api.intento(ID_RECEPCION)).toBeUndefined();
  });
  it('una respuesta de otra clave queda incierta y no anuncia éxito', async () => {
    await ficha();
    const p = enviar(),
      r = post();
    r.flush(resultadoRecepcionFixture(ID_OPERACION));
    await p;
    expect(api.intento(ID_RECEPCION)?.estado).toBe('incierta');
  });
  it('un cambio de cuenta durante el POST no incorpora el resultado anterior', async () => {
    await ficha();
    const p = enviar(),
      r = post();
    perfil.set({ id: ID_OTRA_RECEPCION, rol: 'ADMIN' });
    TestBed.tick();
    r.flush(resultadoRecepcionFixture(r.request.body.claveSolicitud));
    await p;
    expect(api.intento(ID_RECEPCION)).toBeUndefined();
    expect(api.detalle()).toBeNull();
    expect(api.pendientes()).toEqual([]);
  });
  it('no publica una imagen que llega después de salir del detalle', async () => {
    const p = api.comprobante(ID_RECEPCION, ID_COMPROBANTE);
    const rechazo = expect(p).rejects.toThrow();
    const r = http.expectOne(ruta + '/comprobantes/' + ID_COMPROBANTE);
    api.salirDetalle();
    expect(r.cancelled).toBe(true);
    await rechazo;
  });
  it('solo admite blobs privados de imagen dentro del límite', async () => {
    let p = api.comprobante(ID_RECEPCION, ID_COMPROBANTE);
    const rechazo = expect(p).rejects.toThrow();
    http
      .expectOne(ruta + '/comprobantes/' + ID_COMPROBANTE)
      .flush(new Blob(['{}'], { type: 'application/json' }));
    await rechazo;
    p = api.comprobante(ID_RECEPCION, ID_COMPROBANTE);
    http
      .expectOne(ruta + '/comprobantes/' + ID_COMPROBANTE)
      .flush(new Blob(['imagen'], { type: 'image/png' }));
    expect((await p).type).toBe('image/png');
  });
  it('recupera el intento de esta pestaña tras recrear la aplicación', async () => {
    await ficha();
    let p = enviar();
    const r = post(),
      clave = r.request.body.claveSolicitud;
    r.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    http.verify();
    TestBed.resetTestingModule();
    configurar();
    expect(api.intento(ID_RECEPCION)?.cuerpo.claveSolicitud).toBe(clave);
    p = api.recuperar(ID_RECEPCION);
    http.expectOne(ruta + '/operaciones/' + clave).flush(resultadoRecepcionFixture(clave));
    await p;
    expect(api.intento(ID_RECEPCION)?.estado).toBe('confirmada');
  });
  it('bloquea escrituras con recuperación dañada y conserva el registro', async () => {
    http.verify();
    TestBed.resetTestingModule();
    sessionStorage.setItem(almacen, '{incorrecto');
    configurar();
    await ficha();
    expect(api.errorRecuperacion()).not.toBe('');
    await expect(enviar()).rejects.toThrow();
    http.expectNone(ruta + '/registro-pedido');
    expect(sessionStorage.getItem(almacen)).toBe('{incorrecto');
  });
  it('no envía si no se puede conservar la clave antes del POST', async () => {
    await ficha();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('Quota');
    });
    await expect(enviar()).rejects.toThrow(/almacenamiento/);
    http.expectNone(ruta + '/registro-pedido');
    expect(api.intento(ID_RECEPCION)).toBeUndefined();
  });
});
