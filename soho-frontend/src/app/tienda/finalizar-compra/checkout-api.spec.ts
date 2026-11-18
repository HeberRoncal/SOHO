import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CheckoutCompra } from './checkout-compra';
import { FUENTE_COBERTURA } from './servicios/cobertura-entrega';
import { CoberturaApi } from './servicios/cobertura-api';
import { Cuenta } from '../cuenta/servicios/cuenta';
import { PerfilCuenta, DireccionCuenta } from '../cuenta/modelos/cuenta';
import { Carrito } from '../carrito/servicios/carrito';
import { Pedidos } from '../pedidos/servicios/pedidos';
import { CheckoutPagosApi } from './servicios/checkout-pagos-api';

const perfil: PerfilCuenta = {
  id: 'ana',
  nombres: 'Ana María',
  apellidos: 'Pérez',
  correo: 'ana@ejemplo.com',
  celular: '',
  verificado: true,
  proveedor: 'correo',
};
const guardada: DireccionCuenta = {
  id: 'casa',
  etiqueta: 'Casa',
  destinatario: 'María del Carmen de la Cruz',
  celular: '987654321',
  distrito: 'trujillo',
  direccion: 'Calle Casa 123',
  referencia: 'Portón verde',
  predeterminada: true,
};
const zonas = [
  { codigo: 'trujillo', nombre: 'Trujillo', tarifa: '7.25', habilitada: true, plazo: null },
  { codigo: 'moche', nombre: 'Moche', tarifa: null, habilitada: false, plazo: null },
];

describe('Checkout con cobertura remota', () => {
  let vista: ComponentFixture<CheckoutCompra>, http: HttpTestingController;
  let actual = signal<PerfilCuenta | null>(null),
    agenda = signal<readonly DireccionCuenta[]>([]);
  let cargarDirecciones: ReturnType<typeof vi.fn>, emitir: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });
  const dom = () => vista.nativeElement as HTMLElement;
  async function iniciar(
    usuario: PerfilCuenta | null = null,
    carga?: () => Promise<{ correcto: boolean; mensaje: string }>,
  ) {
    actual = signal(usuario);
    agenda = signal<readonly DireccionCuenta[]>(usuario ? [guardada] : []);
    cargarDirecciones = vi.fn(carga ?? (() => Promise.resolve({ correcto: true, mensaje: '' })));
    emitir = vi.fn(async () => false);
    await TestBed.configureTestingModule({
      imports: [CheckoutCompra],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FUENTE_COBERTURA, useExisting: CoberturaApi },
        {
          provide: Cuenta,
          useValue: {
            perfil: actual,
            estadoSesion: signal(usuario ? 'autenticado' : 'anonimo'),
            comprobarSesion: async () => {},
            direcciones: agenda,
            cargarDirecciones,
          },
        },
        {
          provide: Carrito,
          useValue: {
            puedeContinuar: signal(true),
            subtotal: signal(300),
            lineas: signal([{ sku: 'TEST-40', cantidad: 1, importe: 300 }]),
          },
        },
        {
          provide: Pedidos,
          useValue: {
            articulos: signal([
              {
                sku: 'TEST-40',
                nombre: 'Prueba',
                color: 'Blanco',
                talla: '40',
                imagen: '',
                cantidad: 1,
                precioUnitario: 300,
                importe: 300,
              },
            ]),
            recuperarPendiente: async () => null,
            envioPendiente: signal(false),
            requiereSesion: signal(false),
          },
        },
        {
          provide: CheckoutPagosApi,
          useValue: {
            instruccion: signal(null),
            intento: signal(null),
            ocupado: signal(false),
            mensaje: signal(''),
            requiereSesion: signal(false),
            historial: signal([]),
            consulta: signal(null),
            metodos: signal({
              disponible: true,
              version: 1,
              metodos: [
                { metodo: 'YAPE', nombre: 'Yape' },
                { metodo: 'PLIN', nombre: 'Plin' },
              ],
            }),
            cargarMetodos: async () => {},
            recuperarCheckout: async () => true,
            emitir,
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    vista = TestBed.createComponent(CheckoutCompra);
    vista.detectChanges();
    await Promise.resolve();
    http.expectOne('/api/cobertura').flush({ zonas });
    await estabilizar();
    await vi.waitFor(() => {
      vista.detectChanges();
      expect(dom().querySelector('app-datos-entrega')).not.toBeNull();
    });
  }
  function poner(id: string, valor: string) {
    const el = dom().querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
    el.value = valor;
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    vista.detectChanges();
  }
  async function cotizar(costo = '7.25') {
    http.expectOne('/api/cobertura/trujillo/cotizacion').flush({
      cotizacion: {
        distrito: 'trujillo',
        nombreDistrito: 'Trujillo',
        costo,
        moneda: 'PEN',
        plazo: null,
      },
    });
    await estabilizar();
  }
  async function estabilizar() {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
      vista.detectChanges();
    }
    await vista.whenStable();
    vista.detectChanges();
  }
  async function completar() {
    for (const [id, valor] of Object.entries({
      'entrega-nombres': 'Ana',
      'entrega-apellidos': 'Pérez',
      'entrega-correo': 'compra@ejemplo.com',
      'entrega-celular': '987654321',
      'fiscal-numero': '12345678',
      'entrega-direccion': 'Calle Manual 321',
    }))
      poner(id, valor);
    poner('entrega-distrito', 'trujillo');
    await cotizar();
  }
  function continuar() {
    dom()
      .querySelector('app-datos-entrega form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    vista.detectChanges();
  }
  afterEach(() => {
    try {
      http?.verify();
    } finally {
      vista?.destroy();
      TestBed.resetTestingModule();
    }
  });
  it('permite comprar como invitado sin consultar direcciones privadas', async () => {
    await iniciar();
    await completar();
    expect(cargarDirecciones).not.toHaveBeenCalled();
    continuar();
    expect(dom().textContent).toContain('Confirmando envío');
    await cotizar();
    expect(dom().querySelector('.selector-metodos')).toBeTruthy();
  });
  it('no presenta el subtotal como total confirmado mientras falta cotización', async () => {
    await iniciar();
    expect(dom().textContent).toContain('Total pendiente de envío');
    expect(dom().querySelector<HTMLButtonElement>('.continuar')!.disabled).toBe(true);
  });
  it('copia la dirección elegida sin dividir destinatarios ni sobrescribir contacto y factura', async () => {
    await iniciar(perfil);
    poner('entrega-correo', 'compra@ejemplo.com');
    poner('fiscal-numero', '87654321');
    poner('direccion-guardada', 'casa');
    await cotizar();
    const valor = (id: string) => dom().querySelector<HTMLInputElement>('#' + id)!.value;
    expect(valor('entrega-destinatario')).toBe(guardada.destinatario);
    expect(valor('entrega-nombres')).toBe('Ana María');
    expect(valor('entrega-apellidos')).toBe('Pérez');
    expect(valor('entrega-correo')).toBe('compra@ejemplo.com');
    expect(valor('fiscal-numero')).toBe('87654321');
    expect(valor('entrega-direccion')).toBe(guardada.direccion);
    expect(valor('entrega-celular')).toBe(guardada.celular);
  });
  it('una agenda que termina tarde no reemplaza una dirección escrita manualmente', async () => {
    let resolver!: (r: { correcto: boolean; mensaje: string }) => void;
    await iniciar(
      perfil,
      () =>
        new Promise((r) => {
          resolver = r;
        }),
    );
    poner('entrega-direccion', 'Calle Manual 321');
    resolver({ correcto: true, mensaje: '' });
    await estabilizar();
    expect(dom().querySelector<HTMLInputElement>('#entrega-direccion')!.value).toBe(
      'Calle Manual 321',
    );
    expect(dom().querySelector<HTMLSelectElement>('#direccion-guardada')!.value).toBe('');
  });
  it('al perder la sesión retira direcciones, destinatario y datos anteriores', async () => {
    await iniciar(perfil);
    poner('direccion-guardada', 'casa');
    await cotizar();
    actual.set(null);
    await estabilizar();
    expect(dom().querySelector('#direccion-guardada')).toBeNull();
    expect(dom().querySelector<HTMLInputElement>('#entrega-destinatario')!.value).toBe('');
    expect(dom().querySelector<HTMLInputElement>('#entrega-correo')!.value).toBe('');
  });
  it('una dirección guardada sin cobertura se conserva para corregirla y bloquea avanzar', async () => {
    await iniciar(perfil);
    agenda.set([{ ...guardada, distrito: 'moche' }]);
    vista.detectChanges();
    poner('direccion-guardada', 'casa');
    http
      .expectOne('/api/cobertura/moche/cotizacion')
      .flush({ codigo: 'COBERTURA_DESHABILITADA' }, { status: 422, statusText: 'Error' });
    await estabilizar();
    expect(dom().querySelector<HTMLInputElement>('#entrega-direccion')!.value).toBe(
      guardada.direccion,
    );
    expect(dom().textContent).toContain('deshabilitada');
    expect(dom().querySelector<HTMLButtonElement>('.continuar')!.disabled).toBe(true);
  });
  it('si cambia la tarifa antes de pago requiere revisar y confirmar el nuevo total', async () => {
    await iniciar();
    await completar();
    continuar();
    await cotizar('8.50');
    expect(dom().querySelector('.selector-metodos')).toBeNull();
    expect(dom().textContent).toContain('envío cambió');
    expect(dom().querySelector<HTMLInputElement>('#entrega-direccion')!.value).toBe(
      'Calle Manual 321',
    );
    continuar();
    await cotizar('8.50');
    expect(dom().querySelector('.selector-metodos')).toBeTruthy();
  });
  it('un error al confirmar no avanza ni borra el formulario; permite reintentar', async () => {
    await iniciar();
    await completar();
    continuar();
    http
      .expectOne('/api/cobertura/trujillo/cotizacion')
      .flush({}, { status: 503, statusText: 'Error' });
    await estabilizar();
    expect(dom().querySelector('.selector-metodos')).toBeNull();
    expect(dom().querySelector<HTMLInputElement>('#entrega-correo')!.value).toBe(
      'compra@ejemplo.com',
    );
    const reintentar = [...dom().querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Reintentar envío'),
    )!;
    reintentar.click();
    await cotizar();
    continuar();
    await cotizar();
    expect(dom().querySelector('.selector-metodos')).toBeTruthy();
  });
  it('ignora un doble envío mientras confirma la tarifa', async () => {
    await iniciar();
    await completar();
    continuar();
    continuar();
    const solicitudes = http.match('/api/cobertura/trujillo/cotizacion');
    expect(solicitudes).toHaveLength(1);
    solicitudes[0].flush({
      cotizacion: {
        distrito: 'trujillo',
        nombreDistrito: 'Trujillo',
        costo: '7.25',
        moneda: 'PEN',
        plazo: null,
      },
    });
    await estabilizar();
  });
  async function elegirYape() {
    dom().querySelector<HTMLInputElement>('.billetera input')!.click();
    await estabilizar();
  }
  it('emite la preparación con el precio y el envío aceptados mediante el servicio actual', async () => {
    await iniciar();
    await completar();
    continuar();
    await cotizar();
    await elegirYape();
    expect(emitir).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        articulos: [{ sku: 'TEST-40', cantidad: 1, precioUnitarioEsperado: '300.00' }],
        cotizacion: { costoEnvio: '7.25', plazoEntrega: null, total: '307.25' },
      }),
      'YAPE',
    );
  });
  it('no emite instrucciones mientras la tarifa nueva requiere confirmación', async () => {
    await iniciar();
    await completar();
    continuar();
    await cotizar('8.50');
    expect(dom().querySelector('.selector-metodos')).toBeNull();
    expect(emitir).not.toHaveBeenCalled();
    continuar();
    await cotizar('8.50');
    await elegirYape();
    expect(emitir.mock.calls[0][0].cotizacion.total).toBe('308.50');
  });
  it('conserva contacto, destinatario completo y documento fiscal al emitir instrucciones', async () => {
    await iniciar(perfil);
    poner('fiscal-numero', '12345678');
    poner('direccion-guardada', 'casa');
    await cotizar();
    continuar();
    await cotizar();
    await elegirYape();
    expect(emitir).toHaveBeenCalledOnce();
    const preparacion = emitir.mock.calls[0][0];
    expect(preparacion.contacto).toEqual({
      nombres: perfil.nombres,
      apellidos: perfil.apellidos,
      correo: perfil.correo,
    });
    expect(preparacion.entrega.destinatario).toBe(guardada.destinatario);
    expect(preparacion.facturacion.numeroDocumento).toBe('12345678');
  });
});
