import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Cuenta } from '../../cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../cuenta/servicios/estado-autenticacion';
import { Carrito } from '../../carrito/servicios/carrito';
import { FUENTE_CATALOGO } from '../../catalogo/modelos/fuente-catalogo';
import { CoberturaEntrega } from '../../finalizar-compra/servicios/cobertura-entrega';
import { PedidosApi } from './pedidos-api';
import { ALMACENAMIENTO_PEDIDOS } from './acceso-pedidos';
import { DatosEntrega } from '../../finalizar-compra/modelos/datos-entrega';
import { pedidoApi } from './pedidos-api.fixtures';
import { GESTIONAR_401_LOCALMENTE } from '../../cuenta/servicios/autenticacion-interceptor';

const datos: DatosEntrega = {
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'COMPRA@PEDIDOS.TEST',
  celular: '987654321',
  distrito: 'la-esperanza',
  direccion: 'Av. Prueba 123',
  referencia: '',
  destinatario: 'Otra Persona',
  facturacion: {
    tipo: 'boleta',
    documento: 'DNI',
    numero: '00123456',
    ruc: '20123456789',
    razonSocial: 'Campo oculto',
    domicilioFiscal: 'No se envía',
  },
};
const comprobante = {
  nombreArchivo: 'recibo.png',
  tipoArchivo: 'image/png',
  tamanoBytes: 6,
  vistaPrevia: 'data:image/png;base64,aW1hZ2Vu',
  numeroOperacion: '001234',
};
const linea = () => ({
  sku: 'TEST-BL-40',
  cantidad: 2,
  importe: 199.98,
  incidencia: null,
  producto: { nombre: 'Zapatilla de prueba', precio: 99.99, imagenes: ['/imagenes/prueba.webp'] },
  variante: { talla: '40' },
  color: { nombre: 'Blanco', imagenes: [] },
});
const estabilizar = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('Pedidos HTTP, identidad, recuperación e imágenes privadas', () => {
  let api: PedidosApi, http: HttpTestingController, almacen: Map<string, string>;
  let perfil = signal<{ id: string } | null>(null),
    lineas = signal([linea()]);
  let vaciar: ReturnType<typeof vi.fn>, catalogo: ReturnType<typeof vi.fn>;
  function iniciar(dueno: string | null = 'ana') {
    perfil = signal(dueno ? { id: dueno } : null);
    lineas = signal([linea()]);
    vaciar = vi.fn(() => lineas.set([]));
    catalogo = vi.fn();
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
        {
          provide: Carrito,
          useValue: {
            lineas,
            subtotal: signal(199.98),
            puedeContinuar: computed(() => lineas().length > 0),
            vaciar,
          },
        },
        {
          provide: CoberturaEntrega,
          useValue: {
            cotizar: () => ({
              distrito: 'la-esperanza',
              nombreDistrito: 'La Esperanza',
              costo: 0,
              plazo: null,
              tarifaReal: true,
            }),
          },
        },
        { provide: FUENTE_CATALOGO, useValue: { cargarSkus: catalogo } },
        {
          provide: ALMACENAMIENTO_PEDIDOS,
          useValue: {
            getItem: (k: string) => almacen.get(k) ?? null,
            setItem: (k: string, v: string) => almacen.set(k, v),
            removeItem: (k: string) => almacen.delete(k),
          },
        },
      ],
    });
    api = TestBed.inject(PedidosApi);
    http = TestBed.inject(HttpTestingController);
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
  async function enviar() {
    const promesa = api.registrar(datos, 'Yape', comprobante);
    await estabilizar();
    return { promesa, req: http.expectOne('/api/pedidos') };
  }
  it('envía SKU y precios esperados, conserva ceros, omite propietario y campos fiscales ocultos', async () => {
    const { promesa, req } = await enviar();
    expect(req.request.body).toMatchObject({
      contacto: { correo: 'compra@pedidos.test' },
      articulos: [{ sku: 'TEST-BL-40', cantidad: 2, precioUnitarioEsperado: '99.99' }],
      cotizacion: { costoEnvio: '0.00', plazoEntrega: null, total: '199.98' },
      facturacion: { numeroDocumento: '00123456' },
    });
    expect(req.request.body.facturacion).not.toHaveProperty('razonSocial');
    expect(req.request.body).not.toHaveProperty('usuarioId');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.context.get(GESTIONAR_401_LOCALMENTE)).toBe(true);
    expect(req.request.headers.has('X-Pedido-Acceso')).toBe(false);
    expect(vaciar).not.toHaveBeenCalled();
    req.flush({ pedido: pedidoApi(), reutilizado: false });
    expect((await promesa).correcto).toBe(true);
    expect(vaciar).toHaveBeenCalledOnce();
    expect(catalogo).toHaveBeenCalledWith(['TEST-BL-40']);
    expect([...almacen.values()].join('')).not.toMatch(/Ana|COMPRA|base64|Av\.|recibo/);
  });
  it('comparte una solicitud entre dos envíos simultáneos', async () => {
    const a = api.registrar(datos, 'Yape', comprobante),
      b = api.registrar(datos, 'Yape', comprobante);
    expect(a).toBe(b);
    await estabilizar();
    http.expectOne('/api/pedidos').flush({ pedido: pedidoApi() });
    await Promise.all([a, b]);
    expect(vaciar).toHaveBeenCalledOnce();
  });
  it('conserva acceso de invitado por pestaña al recargar, sin poner el secreto en la URL', async () => {
    TestBed.resetTestingModule();
    iniciar(null);
    const { promesa, req } = await enviar(),
      secreto = req.request.headers.get('X-Pedido-Acceso');
    expect(secreto).toMatch(/^[0-9a-f]{64}$/);
    expect(req.request.url).not.toContain(secreto!);
    req.flush({ pedido: pedidoApi() });
    await promesa;
    TestBed.resetTestingModule();
    iniciar(null);
    const lectura = api.cargar('SOHO-TEST0001');
    await estabilizar();
    const r = http.expectOne('/api/pedidos/SOHO-TEST0001');
    expect(r.request.headers.get('X-Pedido-Acceso')).toBe(secreto);
    r.flush({ pedido: pedidoApi() });
    expect((await lectura).correcto).toBe(true);
  });
  it('tras 503 recupera una compra confirmada sin volver a enviar ni vaciar antes el carrito', async () => {
    const { promesa, req } = await enviar(),
      clave = req.request.body.claveCreacion;
    req.flush({ message: 'detalle SQL' }, { status: 503, statusText: 'Unavailable' });
    await promesa;
    expect(vaciar).not.toHaveBeenCalled();
    expect(api.envioPendiente()).toBe(true);
    const repetir = api.reintentarPendiente();
    await estabilizar();
    http.expectOne(`/api/pedidos/creacion/${clave}`).flush({ pedido: pedidoApi() });
    expect((await repetir).correcto).toBe(true);
    expect(vaciar).toHaveBeenCalledOnce();
    http.expectNone((r) => r.method === 'POST');
  });
  it('si la recuperación responde 404 reenvía exactamente el cuerpo original con su clave', async () => {
    const { promesa, req } = await enviar(),
      original = structuredClone(req.request.body);
    req.flush({}, { status: 503, statusText: 'Unavailable' });
    await promesa;
    const repetir = api.reintentarPendiente();
    await estabilizar();
    http
      .expectOne(`/api/pedidos/creacion/${original.claveCreacion}`)
      .flush({}, { status: 404, statusText: 'Not Found' });
    await estabilizar();
    const reenvio = http.expectOne('/api/pedidos');
    expect(reenvio.request.body).toEqual(original);
    reenvio.flush({ pedido: pedidoApi() });
    expect((await repetir).correcto).toBe(true);
  });
  it('recupera tras recargar un resultado incierto sin conservar contacto ni imagen en disco', async () => {
    const { promesa, req } = await enviar(),
      clave = req.request.body.claveCreacion;
    req.flush({}, { status: 503, statusText: 'Unavailable' });
    await promesa;
    TestBed.resetTestingModule();
    iniciar();
    const recuperar = api.recuperarPendiente();
    await estabilizar();
    http.expectOne(`/api/pedidos/creacion/${clave}`).flush({ pedido: pedidoApi() });
    expect((await recuperar)?.correcto).toBe(true);
  });
  it('corrige una validación fallida conservando la clave del intento', async () => {
    const { promesa, req } = await enviar(),
      clave = req.request.body.claveCreacion;
    req.flush({}, { status: 400, statusText: 'Bad Request' });
    await promesa;
    const nueva = api.registrar(datos, 'Plin', { ...comprobante, nombreArchivo: 'corregido.png' });
    await estabilizar();
    http
      .expectOne(`/api/pedidos/creacion/${clave}`)
      .flush({}, { status: 404, statusText: 'Not Found' });
    await estabilizar();
    const segundo = http.expectOne('/api/pedidos');
    expect(segundo.request.body).toMatchObject({
      claveCreacion: clave,
      metodoPago: 'PLIN',
      comprobante: { nombreArchivo: 'corregido.png' },
    });
    segundo.flush({ pedido: pedidoApi() });
    await nueva;
  });
  it('descarta la respuesta de otra sesión sin limpiar el carrito ni mostrar datos privados', async () => {
    const { promesa, req } = await enviar();
    perfil.set({ id: 'otra' });
    TestBed.inject(EstadoAutenticacion).revision++;
    req.flush({ pedido: pedidoApi() });
    expect((await promesa).correcto).toBe(false);
    expect(vaciar).not.toHaveBeenCalled();
    expect(api.obtener('SOHO-TEST0001')).toBeUndefined();
  });
  it('conserva un carrito modificado durante el guardado', async () => {
    const { promesa, req } = await enviar();
    lineas.set([{ ...linea(), cantidad: 3 }]);
    req.flush({ pedido: pedidoApi() });
    expect((await promesa).correcto).toBe(true);
    expect(vaciar).not.toHaveBeenCalled();
  });
  it('no confirma una respuesta con importes incoherentes', async () => {
    const { promesa, req } = await enviar();
    req.flush({ pedido: { ...pedidoApi(), total: '1.00' } });
    expect((await promesa).correcto).toBe(false);
    expect(api.envioPendiente()).toBe(true);
    expect(vaciar).not.toHaveBeenCalled();
  });
  it('no convierte un 401 en una nueva compra de invitado', async () => {
    const { promesa, req } = await enviar();
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    await promesa;
    expect(api.requiereSesion()).toBe(true);
    expect((await api.registrar(datos, 'Yape', comprobante)).correcto).toBe(false);
    http.expectNone((r) => r.method === 'POST');
  });
  it('no consulta un pedido de invitado solo con el código visible', async () => {
    TestBed.resetTestingModule();
    iniciar(null);
    expect((await api.cargar('SOHO-TEST0001')).correcto).toBe(false);
    http.expectNone('/api/pedidos/SOHO-TEST0001');
  });
  it('pagina pedidos y distingue un error de una lista vacía', async () => {
    const carga = api.cargarMios();
    await estabilizar();
    http
      .expectOne((r) => r.url === '/api/pedidos/mios')
      .flush({
        pedidos: [pedidoApi()],
        paginacion: { pagina: 1, limite: 20, total: 21, paginas: 2 },
      });
    expect((await carga).correcto).toBe(true);
    expect(api.paginacion().total).toBe(21);
    const siguiente = api.cargarMios(2);
    await estabilizar();
    http
      .expectOne((r) => r.url === '/api/pedidos/mios' && r.params.get('pagina') === '2')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await siguiente;
    expect(api.estadoListado()).toBe('error');
  });
  it('descarta un listado que llega después de cambiar de cuenta', async () => {
    const carga = api.cargarMios();
    await estabilizar();
    const r = http.expectOne((x) => x.url === '/api/pedidos/mios');
    perfil.set({ id: 'otra' });
    r.flush({
      pedidos: [pedidoApi()],
      paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
    });
    await carga;
    expect(api.listarMios()).toEqual([]);
  });
  it('recupera un Blob por ruta autorizada, ignora la ruta recibida y revoca la URL al cerrar', async () => {
    const { promesa, req } = await enviar();
    req.flush({ pedido: pedidoApi() });
    await promesa;
    const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:privado'),
      revocar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const carga = api.cargarComprobante('SOHO-TEST0001');
    await estabilizar();
    const r = http.expectOne(
      '/api/pedidos/SOHO-TEST0001/comprobantes/32093077-3e17-4197-b8ba-1aa940f6beaa',
    );
    expect(r.request.responseType).toBe('blob');
    r.flush(new Blob(['imagen'], { type: 'image/png' }));
    expect((await carga).correcto).toBe(true);
    expect(crear).toHaveBeenCalledOnce();
    api.liberarComprobante('SOHO-TEST0001');
    expect(revocar).toHaveBeenCalledWith('blob:privado');
  });
  it('descarta un archivo que termina después de cerrar su vista', async () => {
    const { promesa, req } = await enviar();
    req.flush({ pedido: pedidoApi() });
    await promesa;
    const crear = vi.spyOn(URL, 'createObjectURL');
    const carga = api.cargarComprobante('SOHO-TEST0001');
    await estabilizar();
    const r = http.expectOne((x) => x.url.includes('/comprobantes/'));
    api.liberarComprobante('SOHO-TEST0001');
    r.flush(new Blob(['imagen'], { type: 'image/png' }));
    await carga;
    expect(crear).not.toHaveBeenCalled();
  });
  it('rechaza el cupón de demostración y más de cien pares sin escribir', async () => {
    expect((await api.registrar(datos, 'Yape', comprobante, 'DEMO10')).correcto).toBe(false);
    lineas.set([{ ...linea(), cantidad: 101 }]);
    expect((await api.registrar(datos, 'Yape', comprobante)).correcto).toBe(false);
    http.expectNone('/api/pedidos');
  });
  it('una vista computada vacía observa la primera respuesta después de recargar', async () => {
    const visible = computed(() => api.obtener('SOHO-TEST0001'));
    expect(visible()).toBeUndefined();
    const carga = api.cargar('SOHO-TEST0001');
    await estabilizar();
    http.expectOne('/api/pedidos/SOHO-TEST0001').flush({ pedido: pedidoApi() });
    await carga;
    expect(visible()?.total).toBe(199.98);
  });
  it('una lista computada observa la primera carga aunque su propietario aún no esté preparado', async () => {
    const visible = computed(() => api.listarMios());
    expect(visible()).toEqual([]);
    const carga = api.cargarMios();
    await estabilizar();
    http
      .expectOne((r) => r.url === '/api/pedidos/mios')
      .flush({
        pedidos: [pedidoApi()],
        paginacion: { pagina: 1, limite: 20, total: 1, paginas: 1 },
      });
    await carga;
    expect(visible()).toHaveLength(1);
  });
  it.each(['detalle', 'lista'])('un 401 tardío de %s no bloquea la cuenta nueva', async (tipo) => {
    const carga = tipo === 'detalle' ? api.cargar('SOHO-TEST0001') : api.cargarMios();
    await estabilizar();
    const solicitud = http.expectOne((r) =>
      tipo === 'detalle' ? r.url === '/api/pedidos/SOHO-TEST0001' : r.url === '/api/pedidos/mios',
    );
    perfil.set({ id: 'otra' });
    TestBed.inject(EstadoAutenticacion).revision++;
    solicitud.flush({}, { status: 401, statusText: 'Unauthorized' });
    await carga;
    expect(api.requiereSesion()).toBe(false);
  });
  it('una recuperación tardía no envía datos de la cuenta anterior con la sesión nueva', async () => {
    const { promesa, req } = await enviar(),
      clave = req.request.body.claveCreacion;
    req.flush({}, { status: 400, statusText: 'Bad Request' });
    await promesa;
    const repetir = api.registrar(datos, 'Yape', comprobante);
    await estabilizar();
    const consulta = http.expectOne(`/api/pedidos/creacion/${clave}`);
    perfil.set({ id: 'otra' });
    TestBed.inject(EstadoAutenticacion).revision++;
    consulta.flush({}, { status: 404, statusText: 'Not Found' });
    expect((await repetir).correcto).toBe(false);
    http.expectNone((r) => r.method === 'POST');
  });
  it('corrige con versiones esperadas sin crear otra compra ni vaciar el carrito', async () => {
    const p = api.corregir('SOHO-TEST0001', comprobante, {
      versionPedido: 2,
      versionPago: 2,
      comprobanteId: pedidoApi().pago.comprobantes[0].id,
    });
    await estabilizar();
    const r = http.expectOne('/api/pedidos/SOHO-TEST0001/comprobantes');
    expect(r.request.body).toMatchObject({
      versionPedido: 2,
      versionPago: 2,
      comprobante: { numeroOperacion: '001234' },
    });
    expect(r.request.body).not.toHaveProperty('usuarioId');
    const respuesta = pedidoApi();
    respuesta.version = 3;
    respuesta.pago.version = 3;
    r.flush({ pedido: respuesta });
    expect((await p).correcto).toBe(true);
    expect(api.obtener(respuesta.codigo)?.version).toBe(3);
    expect(vaciar).not.toHaveBeenCalled();
  });
  it('una corrección tardía no muestra datos de la cuenta anterior', async () => {
    const p = api.corregir('SOHO-TEST0001', comprobante, {
      versionPedido: 2,
      versionPago: 2,
      comprobanteId: pedidoApi().pago.comprobantes[0].id,
    });
    await estabilizar();
    const r = http.expectOne('/api/pedidos/SOHO-TEST0001/comprobantes');
    perfil.set({ id: 'otra' });
    TestBed.inject(EstadoAutenticacion).revision++;
    r.flush({ pedido: pedidoApi() });
    expect((await p).correcto).toBe(false);
    expect(api.obtener('SOHO-TEST0001')).toBeUndefined();
  });
  it('un 409 de corrección no reenvía automáticamente el archivo', async () => {
    const p = api.corregir('SOHO-TEST0001', comprobante, {
      versionPedido: 2,
      versionPago: 2,
      comprobanteId: pedidoApi().pago.comprobantes[0].id,
    });
    await estabilizar();
    http
      .expectOne('/api/pedidos/SOHO-TEST0001/comprobantes')
      .flush({}, { status: 409, statusText: 'Conflict' });
    expect((await p).mensaje).toContain('Actualízalo');
    http.expectNone((r) => r.method === 'POST');
  });
  it('un 401 del comprobante retira la información privada y pide iniciar sesión', async () => {
    const { promesa, req } = await enviar();
    req.flush({ pedido: pedidoApi() });
    await promesa;
    const carga = api.cargarComprobante('SOHO-TEST0001');
    await estabilizar();
    http
      .expectOne((r) => r.url.includes('/comprobantes/'))
      .flush(new Blob([], { type: 'application/json' }), {
        status: 401,
        statusText: 'Unauthorized',
      });
    await carga;
    expect(api.requiereSesion()).toBe(true);
    expect(api.obtener('SOHO-TEST0001')).toBeUndefined();
  });
});
