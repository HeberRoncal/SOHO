import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Cuenta } from '../../cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../cuenta/servicios/estado-autenticacion';
import { GESTIONAR_401_LOCALMENTE } from '../../cuenta/servicios/autenticacion-interceptor';
import { Carrito } from '../../carrito/servicios/carrito';
import { AccesoPedidos, ALMACENAMIENTO_PEDIDOS } from '../../pedidos/servicios/acceso-pedidos';
import { pedidoApi } from '../../pedidos/servicios/pedidos-api.fixtures';
import { CheckoutPagosApi } from './checkout-pagos-api';
import {
  idPruebaCompra,
  imagenPruebaCompra,
  instruccionPruebaCompra,
  preparacionPruebaCompra,
  recepcionPruebaCompra,
} from '../modelos/checkout.fixtures';
import { InstruccionCompra, RecepcionCompra } from '../modelos/contrato-checkout';

describe('Checkout HTTP: instrucciones, evidencia y recuperación del comprador', () => {
  let api: CheckoutPagosApi, http: HttpTestingController, almacen: Map<string, string>;
  let perfil = signal<{ id: string } | null>(null),
    lineas = signal([{ sku: 'TEST-BL-40', cantidad: 2 }]);
  let vaciar: ReturnType<typeof vi.fn>;
  const iniciar = (dueno: string | null = null, bloqueado = false) => {
    perfil = signal(dueno ? { id: dueno } : null);
    lineas = signal([{ sku: 'TEST-BL-40', cantidad: 2 }]);
    vaciar = vi.fn(() => lineas.set([]));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Cuenta,
          useValue: {
            perfil,
            estadoSesion: computed(() => (perfil() ? 'autenticado' : 'anonimo')),
            comprobarSesion: () => Promise.resolve(),
          },
        },
        { provide: Carrito, useValue: { lineas, vaciar } },
        {
          provide: ALMACENAMIENTO_PEDIDOS,
          useValue: {
            getItem: (k: string) => almacen.get(k) ?? null,
            setItem: (k: string, v: string) => {
              if (bloqueado) throw Error();
              almacen.set(k, v);
            },
            removeItem: (k: string) => almacen.delete(k),
          },
        },
      ],
    });
    api = TestBed.inject(CheckoutPagosApi);
    http = TestBed.inject(HttpTestingController);
    // La plantilla puede leer los computed antes del primer efecto de sesión.
    expect(api.consulta()).toBeNull();
    expect(api.instruccion()).toBeNull();
    TestBed.tick();
  };
  const solicitud = async (ruta: string, metodo?: string) => {
    let r: TestRequest | undefined;
    await vi.waitFor(() => {
      r = http.expectOne((q) => q.url === ruta && (!metodo || q.method === metodo));
    });
    return r!;
  };
  async function metodos(disponible = true) {
    const p = api.cargarMetodos();
    http.expectOne('/api/configuracion/pagos').flush({
      version: 1,
      disponible,
      metodos: disponible
        ? [
            { metodo: 'YAPE', nombre: 'Yape' },
            { metodo: 'PLIN', nombre: 'Plin' },
          ]
        : [],
    });
    await p;
  }
  async function emitir(): Promise<InstruccionCompra> {
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE');
    const r = await solicitud('/api/pagos/instrucciones', 'POST');
    const i = instruccionPruebaCompra(r.request.body.claveCreacionPedido);
    r.flush(i);
    expect(await p).toBe(true);
    return i;
  }
  async function recibir(i: InstruccionCompra): Promise<RecepcionCompra> {
    const p = api.recibir(imagenPruebaCompra()),
      r = await solicitud('/api/pagos/recepciones', 'POST'),
      c = recepcionPruebaCompra(i, r.request.body.claveSolicitud);
    r.flush({ recepcion: c });
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion: c });
    expect(await p).toBe(true);
    return c;
  }
  async function registrado() {
    const c = await recibir(await emitir());
    const recepcion: RecepcionCompra = {
      ...c,
      estado: 'PEDIDO_CREADO',
      pedido: { codigo: 'SOHO-TEST0001' },
    };
    const p = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion });
    expect(await p).toBe(true);
    return recepcion;
  }
  async function vincular() {
    const p = api.vincularPedido();
    (await solicitud('/api/pedidos/SOHO-TEST0001')).flush({ pedido: pedidoApi() });
    expect(await p).toBe('SOHO-TEST0001');
  }
  beforeEach(() => {
    almacen = new Map();
    iniciar();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('no revela receptor desde métodos ni emite con disponibilidad desactivada', async () => {
    await metodos(false);
    expect(api.instruccion()).toBeNull();
    expect(await api.emitir(preparacionPruebaCompra(), 'YAPE')).toBe(false);
    http.expectNone('/api/pagos/instrucciones');
  });
  it('persiste credencial y claves antes de mostrar un destino verificado', async () => {
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE'),
      r = await solicitud('/api/pagos/instrucciones');
    expect(api.instruccion()).toBeNull();
    expect(r.request.headers.get('X-Pedido-Acceso')).toMatch(/^[a-f0-9]{64}$/);
    expect(r.request.context.get(GESTIONAR_401_LOCALMENTE)).toBe(true);
    expect([...almacen.values()].join()).toContain(r.request.body.claveSolicitud);
    expect([...almacen.values()].join()).not.toContain('ana@checkout.test');
    r.flush(instruccionPruebaCompra(r.request.body.claveCreacionPedido));
    expect(await p).toBe(true);
    expect(api.instruccion()?.destino.titular).toBe('SOHO prueba');
  });
  it('no realiza IO sin almacenamiento durable', async () => {
    TestBed.resetTestingModule();
    iniciar(null, true);
    await metodos();
    expect(await api.emitir(preparacionPruebaCompra(), 'YAPE')).toBe(false);
    http.expectNone('/api/pagos/instrucciones');
  });
  it('una cuenta no envía un secreto de invitado', async () => {
    TestBed.resetTestingModule();
    iniciar('ana');
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE'),
      r = await solicitud('/api/pagos/instrucciones');
    expect(r.request.headers.has('X-Pedido-Acceso')).toBe(false);
    r.flush(instruccionPruebaCompra(r.request.body.claveCreacionPedido));
    await p;
  });
  it('recupera instrucción tras respuesta perdida y recarga, sin repetir POST', async () => {
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE'),
      r = await solicitud('/api/pagos/instrucciones'),
      i = instruccionPruebaCompra(r.request.body.claveCreacionPedido),
      key = r.request.body.claveSolicitud,
      token = r.request.headers.get('X-Pedido-Acceso');
    r.flush({}, { status: 503, statusText: 'Perdida' });
    expect(await p).toBe(false);
    TestBed.resetTestingModule();
    iniciar();
    const recuperar = api.recuperar(),
      get = await solicitud('/api/pagos/instrucciones/operaciones/' + key);
    expect(get.request.headers.get('X-Pedido-Acceso')).toBe(token);
    get.flush(i);
    expect(await recuperar).toBe(true);
    expect(api.instruccion()?.instruccionId).toBe(i.instruccionId);
  });
  it('un reintento conserva exactamente cuerpo, clave y propietario', async () => {
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE'),
      r = await solicitud('/api/pagos/instrucciones'),
      body = r.request.body;
    r.flush({}, { status: 503, statusText: 'Perdida' });
    await p;
    const retry = api.reintentar(),
      post = await solicitud('/api/pagos/instrucciones');
    expect(post.request.body).toEqual(body);
    post.flush(instruccionPruebaCompra(body.claveCreacionPedido));
    expect(await retry).toBe(true);
  });
  it('rechaza respuesta de otro checkout y conserva intento', async () => {
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE'),
      r = await solicitud('/api/pagos/instrucciones');
    r.flush(instruccionPruebaCompra());
    expect(await p).toBe(false);
    expect(api.instruccion()).toBeNull();
    expect(api.intento()).not.toBeNull();
  });
  it('cambiar método exige la acción explícita anterior al pago', async () => {
    await emitir();
    expect(await api.emitir(preparacionPruebaCompra(), 'PLIN')).toBe(false);
    expect(await api.cambiarAntesDePagar()).toBe(true);
    expect(api.instruccion()).toBeNull();
    expect(api.intento()?.instruccion.hash).toBeUndefined();
  });
  it('recibe evidencia sin volver a consultar precios, cobertura o métodos', async () => {
    const i = await emitir();
    await metodos(false);
    const c = await recibir(i);
    expect(api.consulta()?.recepcion.id).toBe(c.id);
    expect(vaciar).not.toHaveBeenCalled();
    http.expectNone('/api/pedidos');
  });
  it('un POST histórico no sustituye al GET actual', async () => {
    const i = await emitir(),
      p = api.recibir(imagenPruebaCompra()),
      r = await solicitud('/api/pagos/recepciones'),
      c = recepcionPruebaCompra(i, r.request.body.claveSolicitud);
    r.flush({ recepcion: c });
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
      recepcion: { ...c, version: 5, estado: 'PEDIDO_CREADO', pedido: { codigo: 'SOHO-TEST0001' } },
    });
    await p;
    expect(api.consulta()?.recepcion.estado).toBe('PEDIDO_CREADO');
  });
  it('recupera recepción desconocida después de recargar con la clave original', async () => {
    const i = await emitir(),
      p = api.recibir(imagenPruebaCompra()),
      r = await solicitud('/api/pagos/recepciones'),
      c = recepcionPruebaCompra(i, r.request.body.claveSolicitud);
    r.flush({}, { status: 503, statusText: 'Perdida' });
    await p;
    TestBed.resetTestingModule();
    iniciar();
    const recuperar = api.recuperar();
    (await solicitud('/api/pagos/recepciones/creacion/' + c.claveSolicitud)).flush({
      recepcion: c,
    });
    expect(await recuperar).toBe(true);
    expect(api.consulta()?.recepcion.id).toBe(c.id);
  });
  it('después de un envío incierto no sustituye imagen o número de operación', async () => {
    await emitir();
    const p = api.recibir(imagenPruebaCompra()),
      r = await solicitud('/api/pagos/recepciones');
    r.flush({}, { status: 503, statusText: 'Perdida' });
    await p;
    expect(await api.recibir({ ...imagenPruebaCompra(), numeroOperacion: '9876' })).toBe(false);
    expect(await api.recibir({ ...imagenPruebaCompra(), nombreArchivo: 'otro.png' })).toBe(false);
    http.expectNone('/api/pagos/recepciones');
  });
  it('no abre otra instrucción ni elimina el carrito por una recepción', async () => {
    const i = await emitir();
    await recibir(i);
    expect(await api.cambiarAntesDePagar()).toBe(false);
    expect(await api.emitir(preparacionPruebaCompra(), 'YAPE')).toBe(false);
    expect(vaciar).not.toHaveBeenCalled();
  });
  it('serializa doble clic y registra procesamiento con versión original', async () => {
    const c = await recibir(await emitir()),
      p = api.procesar();
    expect(api.procesar()).toBe(p);
    const r = await solicitud('/api/pagos/recepciones/' + c.id + '/procesamiento');
    expect(r.request.body.versionEsperada).toBe(c.version);
    r.flush({
      recepcion: { ...c, estado: 'REQUIERE_ATENCION', version: 3, motivos: ['PRECIO_CAMBIADO'] },
      operacion: { claveSolicitud: r.request.body.claveSolicitud, estado: 'CONFIRMADA' },
      resultado: 'REQUIERE_ATENCION',
      pedido: null,
    });
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
      recepcion: { ...c, estado: 'REQUIERE_ATENCION', version: 3, motivos: ['PRECIO_CAMBIADO'] },
    });
    expect(await p).toBe(true);
    expect(api.intento()?.operacion).toBeUndefined();
    expect(await api.procesar()).toBe(false);
  });
  it('recupera operación histórica sin degradar la recepción actual', async () => {
    const c = await recibir(await emitir()),
      p = api.procesar(),
      r = await solicitud('/api/pagos/recepciones/' + c.id + '/procesamiento'),
      key = r.request.body.claveSolicitud;
    r.flush({}, { status: 503, statusText: 'Perdida' });
    await p;
    const recuperar = api.recuperar();
    (await solicitud(`/api/pagos/recepciones/${c.id}/operaciones/${key}`)).flush({
      recepcion: { ...c, estado: 'REQUIERE_ATENCION' },
      operacion: { claveSolicitud: key, estado: 'CONFIRMADA' },
      resultado: 'REQUIERE_ATENCION',
      pedido: null,
    });
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
      recepcion: { ...c, estado: 'PEDIDO_CREADO', version: 8, pedido: { codigo: 'SOHO-TEST0001' } },
    });
    await recuperar;
    expect(api.consulta()?.recepcion.version).toBe(8);
    expect(api.consulta()?.recepcion.estado).toBe('PEDIDO_CREADO');
  });
  it('corrige solamente la imagen y conserva ceros del número original', async () => {
    const c = await recibir(await emitir()),
      consulta = {
        recepcion: {
          ...c,
          estado: 'REQUIERE_ATENCION',
          version: 3,
          motivos: ['COMPROBANTE_REQUIERE_CORRECCION'],
        },
        correccion: {
          solicitudId: idPruebaCompra(8),
          mensaje: 'Adjunta una imagen más clara',
          pendiente: true,
          versionEsperada: 3,
        },
      };
    const actualizar = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush(consulta);
    await actualizar;
    const p = api.corregir({
        ...imagenPruebaCompra(),
        nombreArchivo: 'clara.png',
        numeroOperacion: '999',
      }),
      r = await solicitud('/api/pagos/recepciones/' + c.id + '/comprobantes');
    expect(r.request.body.comprobante.numeroOperacion).toBe('001234');
    expect(r.request.body.versionEsperada).toBe(3);
    const actual = {
      ...c,
      version: 5,
      comprobante: {
        ...c.comprobante,
        id: idPruebaCompra(9),
        version: 2,
        nombreArchivo: 'clara.png',
      },
    };
    r.flush({
      recepcion: actual,
      operacion: { claveSolicitud: r.request.body.claveSolicitud, estado: 'CONFIRMADA' },
      resultado: 'ADJUNTAR_COMPROBANTE',
    });
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
      recepcion: actual,
      correccion: { ...consulta.correccion, pendiente: false, versionEsperada: 5 },
    });
    expect(await p).toBe(true);
    expect(api.consulta()?.recepcion.estado).toBe('RECIBIDA');
    expect(api.intento()?.operacion).toBeUndefined();
  });
  it('solo vincula y vacía la cesta después de consultar un pedido confirmado', async () => {
    const c = await recibir(await emitir()),
      actualizar = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
      recepcion: { ...c, estado: 'PEDIDO_CREADO', pedido: { codigo: 'SOHO-TEST0001' } },
    });
    await actualizar;
    const p = api.vincularPedido(),
      r = await solicitud('/api/pedidos/SOHO-TEST0001');
    expect(r.request.headers.get('X-Pedido-Acceso')).toBe(api.intento()?.acceso);
    r.flush({ pedido: pedidoApi() });
    expect(await p).toBe('SOHO-TEST0001');
    expect(vaciar).toHaveBeenCalledOnce();
    expect(TestBed.inject(AccesoPedidos).acceso('SOHO-TEST0001')).toBe(api.intento()?.acceso);
  });
  it('no borra una cesta modificada mientras se registra el pedido', async () => {
    const c = await recibir(await emitir()),
      actualizar = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
      recepcion: { ...c, estado: 'PEDIDO_CREADO', pedido: { codigo: 'SOHO-TEST0001' } },
    });
    await actualizar;
    lineas.set([{ sku: 'OTRO', cantidad: 1 }]);
    const p = api.vincularPedido();
    (await solicitud('/api/pedidos/SOHO-TEST0001')).flush({ pedido: pedidoApi() });
    await p;
    expect(vaciar).not.toHaveBeenCalled();
  });
  it('no ofrece acceso invitado a una recepción desconocida', async () => {
    expect(await api.abrir(idPruebaCompra(7))).toBe(false);
    http.expectNone('/api/pagos/recepciones/' + idPruebaCompra(7));
  });
  it.each([null, 'ana'])('un pedido registrado deja comprar de nuevo como %s', async (dueno) => {
    TestBed.resetTestingModule();
    iniciar(dueno);
    const c = await registrado(),
      anterior = api.intento()!;
    await vincular();
    lineas.set([{ sku: 'OTRA-ZAPATILLA', cantidad: 1 }]);
    expect(await api.recuperarCheckout()).toBe(true);
    expect(api.consulta()).toBeNull();
    expect(api.instruccion()).toBeNull();
    expect(api.intento()).toBeNull();
    expect(api.historial()[0].recepcion?.id).toBe(c.id);
    expect(lineas()).toEqual([{ sku: 'OTRA-ZAPATILLA', cantidad: 1 }]);
    const i = await emitir();
    expect(i.claveCreacionPedido).not.toBe(anterior.clave);
    expect(api.intento()?.instruccion.clave).not.toBe(anterior.instruccion.clave);
    if (!dueno) expect(api.intento()?.acceso).not.toBe(anterior.acceso);
    else expect(api.intento()?.acceso).toBeUndefined();
  });
  it('recupera una recepción antigua con pedido sin redirigir ni borrar la cesta nueva', async () => {
    const c = await registrado(),
      anterior = api.intento()!;
    const datos = JSON.parse(almacen.get('soho:compras:v1:invitado')!);
    delete datos.intentos[0].carritoAtendido;
    almacen.set('soho:compras:v1:invitado', JSON.stringify(datos));
    TestBed.resetTestingModule();
    iniciar();
    const p = api.recuperarCheckout();
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion: c });
    expect(await p).toBe(true);
    expect(api.consulta()).toBeNull();
    expect(api.accesos.enCurso()).toBeNull();
    expect(vaciar).not.toHaveBeenCalled();
    expect(api.historial()[0].acceso).toBe(anterior.acceso);
    const abrir = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion: c });
    await abrir;
    await vincular();
    expect(vaciar).not.toHaveBeenCalled();
    expect(TestBed.inject(AccesoPedidos).acceso('SOHO-TEST0001')).toBe(anterior.acceso);
  });
  it('consultar y recargar un pedido no vacía otra compra con los mismos SKU y cantidades', async () => {
    const c = await registrado();
    await vincular();
    TestBed.resetTestingModule();
    iniciar();
    const abrir = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion: c });
    await abrir;
    await vincular();
    expect(vaciar).not.toHaveBeenCalled();
    expect(lineas()).toEqual([{ sku: 'TEST-BL-40', cantidad: 2 }]);
    expect(await api.recuperarCheckout()).toBe(true);
    expect(api.consulta()).toBeNull();
  });
  it('el historial de otro pedido conserva una instrucción nueva, su clave y su secreto', async () => {
    const c = await registrado();
    await vincular();
    await api.recuperarCheckout();
    await emitir();
    const actual = api.intento()!;
    const abrir = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion: c });
    await abrir;
    await vincular();
    expect(api.accesos.enCurso()).toEqual(actual);
    TestBed.resetTestingModule();
    iniciar();
    const p = api.recuperarCheckout();
    (await solicitud('/api/pagos/instrucciones/operaciones/' + actual.instruccion.clave)).flush(
      instruccionPruebaCompra(actual.clave),
    );
    expect(await p).toBe(true);
    expect(api.intento()).toEqual(actual);
    expect(api.instruccion()?.claveCreacionPedido).toBe(actual.clave);
    expect(api.consulta()).toBeNull();
  });
  it.each(['RECIBIENDO', 'RECIBIDA', 'REQUIERE_ATENCION'] as const)(
    'retiene una recepción %s al entrar al checkout',
    async (estado) => {
      const c = await recibir(await emitir()),
        clave = api.intento()!.clave;
      const p = api.recuperarCheckout();
      (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
        recepcion: { ...c, estado },
      });
      expect(await p).toBe(true);
      expect(api.consulta()?.recepcion.estado).toBe(estado);
      expect(api.accesos.enCurso()?.clave).toBe(clave);
    },
  );
  it('un resultado incierto no se descarta al querer empezar otra compra', async () => {
    const c = await recibir(await emitir()),
      p = api.procesar();
    const post = await solicitud('/api/pagos/recepciones/' + c.id + '/procesamiento');
    const clave = post.request.body.claveSolicitud;
    post.flush({}, { status: 503, statusText: 'Perdida' });
    await p;
    const retomar = api.recuperarCheckout();
    (await solicitud(`/api/pagos/recepciones/${c.id}/operaciones/${clave}`)).flush(
      {},
      { status: 404, statusText: 'Pendiente' },
    );
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({
      recepcion: { ...c, estado: 'PEDIDO_CREADO', pedido: { codigo: 'SOHO-TEST0001' } },
    });
    expect(await retomar).toBe(true);
    expect(api.intento()?.operacion?.clave).toBe(clave);
    expect(api.consulta()?.recepcion.estado).toBe('PEDIDO_CREADO');
    expect(await api.nuevaCompra()).toBe(false);
    expect(api.accesos.enCurso()).not.toBeNull();
  });
  it('una clave nueva que todavía no se envió no se consulta como un intento perdido', async () => {
    api.accesos.preparar(null);
    expect(await api.recuperar()).toBe(true);
    expect(api.mensaje()).toBe('');
    http.expectNone((q) => q.url.startsWith('/api/pagos/instrucciones'));
  });
  it('volver antes de pagar permite recargar sin buscar la nueva clave aún sin emitir', async () => {
    await emitir();
    expect(await api.cambiarAntesDePagar()).toBe(true);
    const clave = api.intento()?.instruccion.clave;
    TestBed.resetTestingModule();
    iniciar();
    expect(await api.recuperar()).toBe(true);
    expect(api.intento()?.instruccion.clave).toBe(clave);
    expect(api.mensaje()).toBe('');
    http.expectNone((q) => q.url.startsWith('/api/pagos/instrucciones'));
  });
  it('una respuesta tardía tras cambiar de cuenta no muestra destino ni comprobante', async () => {
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE'),
      r = await solicitud('/api/pagos/instrucciones');
    perfil.set({ id: 'otra' });
    TestBed.tick();
    r.flush(instruccionPruebaCompra(r.request.body.claveCreacionPedido));
    expect(await p).toBe(false);
    expect(api.instruccion()).toBeNull();
    expect(api.intento()).toBeNull();
  });
  it('401 obliga a recuperar sesión y nunca cae a credenciales de invitado', async () => {
    TestBed.resetTestingModule();
    iniciar('ana');
    await metodos();
    const p = api.emitir(preparacionPruebaCompra(), 'YAPE'),
      r = await solicitud('/api/pagos/instrucciones');
    r.flush({}, { status: 401, statusText: 'Vencida' });
    await p;
    TestBed.tick();
    expect(api.requiereSesion()).toBe(true);
    perfil.set(null);
    TestBed.tick();
    expect(await api.recuperar()).toBe(false);
    http.expectNone((q) => q.url.startsWith('/api/pagos/'));
  });
  it('404 de una operación incierta conserva su clave y permite consultar la recepción', async () => {
    const c = await recibir(await emitir()),
      p = api.procesar(),
      r = await solicitud('/api/pagos/recepciones/' + c.id + '/procesamiento'),
      key = r.request.body.claveSolicitud;
    r.flush({}, { status: 503, statusText: 'Perdida' });
    await p;
    const recuperar = api.recuperar();
    (await solicitud(`/api/pagos/recepciones/${c.id}/operaciones/${key}`)).flush(
      {},
      { status: 404, statusText: 'No registrada' },
    );
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion: c });
    expect(await recuperar).toBe(true);
    expect(api.intento()?.operacion?.clave).toBe(key);
    expect(api.consulta()?.recepcion.id).toBe(c.id);
  });
  it('un acceso privado que deja de estar disponible retira los datos cacheados', async () => {
    const c = await recibir(await emitir()),
      p = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush(
      {},
      { status: 404, statusText: 'Sin acceso' },
    );
    expect(await p).toBe(false);
    expect(api.consulta()).toBeNull();
    expect(api.instruccion()).toBeNull();
    expect(api.intento()?.recepcion?.id).toBe(c.id);
  });
  it('un rechazo de imagen más GET 404 permite elegir otro archivo sin perder la instrucción', async () => {
    const i = await emitir(),
      p = api.recibir(imagenPruebaCompra()),
      r = await solicitud('/api/pagos/recepciones'),
      clave = r.request.body.claveSolicitud;
    r.flush({}, { status: 400, statusText: 'Imagen animada' });
    (await solicitud('/api/pagos/recepciones/creacion/' + clave)).flush(
      {},
      { status: 404, statusText: 'Sin registro' },
    );
    (await solicitud('/api/pagos/instrucciones/' + i.instruccionId)).flush(i);
    expect(await p).toBe(false);
    expect(api.intento()?.recepcion).toBeUndefined();
    expect(api.instruccion()?.instruccionId).toBe(i.instruccionId);
    const nuevo = api.recibir({ ...imagenPruebaCompra(), nombreArchivo: 'otra.png' }),
      post = await solicitud('/api/pagos/recepciones');
    expect(post.request.body.claveSolicitud).not.toBe(clave);
    const c = recepcionPruebaCompra(i, post.request.body.claveSolicitud);
    post.flush({ recepcion: c });
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush({ recepcion: c });
    expect(await nuevo).toBe(true);
  });
  it('un rechazo cuya consulta falla se conserva y se resuelve después de recargar', async () => {
    const i = await emitir(),
      p = api.recibir(imagenPruebaCompra()),
      r = await solicitud('/api/pagos/recepciones'),
      clave = r.request.body.claveSolicitud;
    r.flush({}, { status: 400, statusText: 'Imagen invalida' });
    (await solicitud('/api/pagos/recepciones/creacion/' + clave)).flush(
      {},
      { status: 503, statusText: 'No disponible' },
    );
    await p;
    expect(api.intento()?.recepcion?.rechazada).toBe(true);
    TestBed.resetTestingModule();
    iniciar();
    const recuperar = api.recuperar();
    (await solicitud('/api/pagos/recepciones/creacion/' + clave)).flush(
      {},
      { status: 404, statusText: 'Sin registro' },
    );
    (await solicitud('/api/pagos/instrucciones/' + i.instruccionId)).flush(i);
    expect(await recuperar).toBe(true);
    expect(api.intento()?.recepcion).toBeUndefined();
    expect(api.instruccion()?.instruccionId).toBe(i.instruccionId);
  });
  it('rechazar una corrección no pierde la solicitud pública ni inmoviliza otra imagen válida', async () => {
    const c = await recibir(await emitir()),
      consulta = {
        recepcion: { ...c, estado: 'REQUIERE_ATENCION', version: 3 },
        correccion: {
          solicitudId: idPruebaCompra(8),
          mensaje: 'Imagen clara',
          pendiente: true,
          versionEsperada: 3,
        },
      };
    const leer = api.abrir(c.id);
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush(consulta);
    await leer;
    const p = api.corregir(imagenPruebaCompra()),
      r = await solicitud('/api/pagos/recepciones/' + c.id + '/comprobantes'),
      clave = r.request.body.claveSolicitud;
    r.flush({}, { status: 400, statusText: 'Imagen invalida' });
    (await solicitud(`/api/pagos/recepciones/${c.id}/operaciones/${clave}`)).flush(
      {},
      { status: 404, statusText: 'Sin registro' },
    );
    (await solicitud('/api/pagos/recepciones/' + c.id)).flush(consulta);
    await p;
    expect(api.intento()?.operacion).toBeUndefined();
    expect(api.consulta()?.correccion?.pendiente).toBe(true);
  });
});
