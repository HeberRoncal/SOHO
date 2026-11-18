import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Cuenta } from '../cuenta/servicios/cuenta';
import { Carrito } from '../carrito/servicios/carrito';
import { Pedidos } from '../pedidos/servicios/pedidos';
import { CheckoutCompra } from './checkout-compra';
import { CheckoutPagosApi } from './servicios/checkout-pagos-api';
import { CoberturaEntrega } from './servicios/cobertura-entrega';
import { ResumenCheckout } from './componentes/resumen-checkout/resumen-checkout';
import { ConsultaRecepcion, InstruccionCompra } from './modelos/contrato-checkout';
import { imagenPruebaCompra, instruccionPruebaCompra, recepcionPruebaCompra } from './modelos/checkout.fixtures';
import { ImagenComprobante } from './componentes/imagen-comprobante/imagen-comprobante';

describe('Volver a los datos desde instrucciones de pago', () => {
  let instruccion = signal<InstruccionCompra | null>(null);
  let intento = signal<{ instruccion: { hash?: string }; recepcion?: { id: string } } | null>(null);
  let ocupado = signal(false);
  let consulta = signal<ConsultaRecepcion | null>(null);
  let cambiar: ReturnType<typeof vi.fn>,
    confirmarEnvio: ReturnType<typeof vi.fn>,
    emitir: ReturnType<typeof vi.fn>,
    recibir: ReturnType<typeof vi.fn>,
    completarRegistro: ReturnType<typeof vi.fn>;
  let mostrarOriginal: PropertyDescriptor | undefined,
    cerrarOriginal: PropertyDescriptor | undefined;
  beforeEach(() => {
    const i = instruccionPruebaCompra();
    i.preparacion.facturacion = {
      tipo: 'BOLETA',
      tipoDocumento: 'DNI',
      numeroDocumento: '00123456',
    };
    i.preparacion.entrega.referencia = 'Junto al parque';
    instruccion = signal<InstruccionCompra | null>(i);
    intento = signal<{ instruccion: { hash?: string }; recepcion?: { id: string } } | null>({
      instruccion: {},
    });
    ocupado = signal(false);
    consulta = signal<ConsultaRecepcion | null>(null);
    recibir = vi.fn(async () => {
      consulta.set({ recepcion: recepcionPruebaCompra(instruccion()!) });
      return true;
    });
    completarRegistro = vi.fn(async (): Promise<string | null> => 'SOHO-TEST0001');
    cambiar = vi.fn(async () => {
      instruccion.set(null);
      return true;
    });
    emitir = vi.fn(async (preparacion, metodo) => {
      const nuevo = instruccionPruebaCompra();
      nuevo.preparacion = preparacion;
      nuevo.metodo = metodo;
      instruccion.set(nuevo);
      return true;
    });
    const entrega = {
      distrito: 'la-esperanza',
      nombreDistrito: 'La Esperanza',
      costo: 0,
      plazo: null,
    };
    confirmarEnvio = vi.fn(async () => entrega);
    mostrarOriginal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    cerrarOriginal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    });
    TestBed.configureTestingModule({
      imports: [CheckoutCompra],
      providers: [
        provideRouter([]),
        {
          provide: Cuenta,
          useValue: {
            perfil: signal(null),
            estadoSesion: signal('anonimo'),
            direcciones: signal([]),
            comprobarSesion: async () => {},
          },
        },
        {
          provide: Carrito,
          useValue: {
            lineas: signal([{ sku: 'TEST-BL-40', cantidad: 2, importe: 199.98 }]),
            subtotal: signal(199.98),
            puedeContinuar: signal(true),
          },
        },
        {
          provide: Pedidos,
          useValue: {
            recuperarPendiente: async () => null,
            envioPendiente: signal(false),
            requiereSesion: signal(false),
            articulos: signal([
              {
                sku: 'TEST-BL-40',
                nombre: 'Zapatilla de prueba',
                color: 'Blanco',
                talla: '40',
                imagen: '',
                cantidad: 2,
                precioUnitario: 99.99,
                importe: 199.98,
              },
            ]),
          },
        },
        {
          provide: CoberturaEntrega,
          useValue: {
            cargar: async () => {},
            confirmar: confirmarEnvio,
            cotizar: (d: string) => (d === 'la-esperanza' ? entrega : null),
            invalidar: () => {},
            estado: signal('lista'),
            cotizando: signal(false),
            mensaje: signal(''),
            mensajeCotizacion: signal(''),
            zonas: [
              { codigo: 'la-esperanza', nombre: 'La Esperanza', tarifa: 0, habilitada: true },
            ],
          },
        },
        {
          provide: CheckoutPagosApi,
          useValue: {
            instruccion,
            intento,
            ocupado,
            mensaje: signal(''),
            requiereSesion: signal(false),
            historial: signal([]),
            consulta,
            metodos: signal({
              disponible: true,
              version: 1,
              metodos: [
                { metodo: 'YAPE', nombre: 'Yape' },
                { metodo: 'PLIN', nombre: 'Plin' },
              ],
            }),
            cargarMetodos: async () => {},
            recuperar: async () => true,
            recuperarCheckout: async () => true,
            cambiarAntesDePagar: cambiar,
            emitir,
            recibir,
            completarRegistro,
          },
        },
      ],
    });
    TestBed.overrideComponent(CheckoutCompra, {
      remove: { imports: [ResumenCheckout] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    if (mostrarOriginal)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', mostrarOriginal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (cerrarOriginal) Object.defineProperty(HTMLDialogElement.prototype, 'close', cerrarOriginal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  async function crear() {
    const f = TestBed.createComponent(CheckoutCompra);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    await vi.waitFor(() => {
      f.detectChanges();
      expect(
        f.nativeElement.querySelector('app-pasos-compra li:nth-child(2).actual'),
      ).not.toBeNull();
    });
    return f;
  }
  function boton(f: Awaited<ReturnType<typeof crear>>, texto: string): HTMLButtonElement {
    const b = [...f.nativeElement.querySelectorAll('button')].find(
      (b: any) => b.textContent.trim() === texto,
    );
    if (!b) throw Error('Falta el botón ' + texto);
    return b as HTMLButtonElement;
  }
  it('un solo envío del comprobante registra el pedido y abre su confirmación', async () => {
    const f = await crear();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    f.debugElement.query(By.directive(ImagenComprobante)).componentInstance.enviado.emit(imagenPruebaCompra());
    await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith(['/pedido', 'SOHO-TEST0001']));
    expect(recibir).toHaveBeenCalledOnce();
    expect(completarRegistro).toHaveBeenCalledOnce();
    expect(recibir.mock.invocationCallOrder[0]).toBeLessThan(completarRegistro.mock.invocationCallOrder[0]);
  });
  it('bloquea otro envío mientras espera el registro y conserva la recepción si no se confirma', async () => {
    const f = await crear();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    let terminar!: (codigo: string | null) => void;
    completarRegistro.mockImplementation(() => new Promise<string | null>((r) => terminar = r));
    const imagen = f.debugElement.query(By.directive(ImagenComprobante)).componentInstance as ImagenComprobante;
    imagen.enviado.emit(imagenPruebaCompra());
    await vi.waitFor(() => expect(completarRegistro).toHaveBeenCalledOnce());
    f.detectChanges();
    expect(imagen.ocupado()).toBe(true);
    imagen.enviado.emit(imagenPruebaCompra());
    expect(recibir).toHaveBeenCalledOnce();
    expect(navegar).not.toHaveBeenCalled();
    terminar(null);
    await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith(['/recepcion', consulta()!.recepcion.id]));
  });
  it('no continúa el registro si no se confirmó la recepción del archivo', async () => {
    const f = await crear();
    recibir.mockResolvedValue(false);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    f.debugElement.query(By.directive(ImagenComprobante)).componentInstance.enviado.emit(imagenPruebaCompra());
    await vi.waitFor(() => expect(recibir).toHaveBeenCalledOnce());
    await f.whenStable();
    expect(completarRegistro).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });
  it('la cabecera solicita una decisión sin descartar instrucciones al hacer clic', async () => {
    const f = await crear();
    boton(f, 'Volver a datos y envío').click();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#confirmar-cambio-entrega').open).toBe(true);
    expect(cambiar).not.toHaveBeenCalled();
    expect(instruccion()).not.toBeNull();
  });
  it('cancelar conserva el importe, el receptor y la instrucción', async () => {
    const f = await crear(),
      anterior = instruccion();
    boton(f, 'Volver a datos y envío').click();
    await f.whenStable();
    boton(f, 'Conservar pago y continuar').click();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#confirmar-cambio-entrega').open).toBe(false);
    expect(instruccion()).toBe(anterior);
    expect(cambiar).not.toHaveBeenCalled();
  });
  it('confirmar que no pagó vuelve al formulario con contacto, destinatario, referencia y boleta', async () => {
    const f = await crear();
    boton(f, 'Volver a datos y envío').click();
    await f.whenStable();
    boton(f, 'Todavía no pagué: editar datos').click();
    await f.whenStable();
    f.detectChanges();
    expect(cambiar).toHaveBeenCalledOnce();
    expect(f.nativeElement.querySelector('#entrega-correo').value).toBe('ana@checkout.test');
    expect(f.nativeElement.querySelector('#entrega-direccion').value).toBe('Av. Prueba 123');
    expect(f.nativeElement.querySelector('#entrega-destinatario').value).toBe('Ana Prueba');
    expect(f.nativeElement.querySelector('#entrega-referencia').value).toBe('Junto al parque');
    expect(f.nativeElement.querySelector('#fiscal-numero').value).toBe('00123456');
    expect(confirmarEnvio).toHaveBeenCalledWith('la-esperanza');
    expect(f.nativeElement.querySelector('app-instrucciones-compra')).toBeNull();
  });
  it('el paso Datos y envío abre la misma decisión', async () => {
    const f = await crear();
    const b = f.nativeElement.querySelector('app-pasos-compra button') as HTMLButtonElement;
    b.click();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#confirmar-cambio-entrega').open).toBe(true);
    expect(cambiar).not.toHaveBeenCalled();
  });
  it('conserva la factura después de recuperar instrucciones y volver', async () => {
    instruccion.update((i) => ({
      ...i!,
      preparacion: {
        ...i!.preparacion,
        facturacion: {
          tipo: 'FACTURA',
          tipoDocumento: 'RUC',
          numeroDocumento: '20123456789',
          razonSocial: 'Comercial Prueba',
          domicilioFiscal: 'Av. Fiscal 456',
        },
      },
    }));
    const f = await crear();
    boton(f, 'Volver a datos y envío').click();
    await f.whenStable();
    boton(f, 'Todavía no pagué: editar datos').click();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#fiscal-ruc').value).toBe('20123456789');
    expect(f.nativeElement.querySelector('#fiscal-razon').value).toBe('Comercial Prueba');
    expect(f.nativeElement.querySelector('#fiscal-domicilio').value).toBe('Av. Fiscal 456');
  });
  it('si la preparación no puede cambiarse conserva el pago y muestra la decisión', async () => {
    cambiar.mockResolvedValue(false);
    const f = await crear();
    boton(f, 'Volver a datos y envío').click();
    await f.whenStable();
    boton(f, 'Todavía no pagué: editar datos').click();
    await f.whenStable();
    f.detectChanges();
    expect(instruccion()).not.toBeNull();
    expect(f.nativeElement.querySelector('app-instrucciones-compra')).not.toBeNull();
    expect(f.nativeElement.querySelector('#confirmar-cambio-entrega').open).toBe(true);
  });
  it('el enlace de volver queda deshabilitado durante un envío', async () => {
    const f = await crear();
    ocupado.set(true);
    f.detectChanges();
    expect(boton(f, 'Volver a datos y envío').disabled).toBe(true);
    expect(f.nativeElement.querySelector('app-pasos-compra button')).toBeNull();
    expect(cambiar).not.toHaveBeenCalled();
  });
  it('con un comprobante en recepción no ofrece editar datos ni descarta el envío', async () => {
    intento.set({ instruccion: {}, recepcion: { id: 'pendiente' } });
    const f = await crear();
    expect(f.nativeElement.querySelector('app-cabecera-compra button.volver')).toBeNull();
    expect(f.nativeElement.querySelector('app-cabecera-compra a.volver').textContent).toContain(
      'Ir a la tienda',
    );
    expect(f.nativeElement.querySelector('app-pasos-compra button')).toBeNull();
    expect(cambiar).not.toHaveBeenCalled();
  });
  it('elegir otro método pide confirmar que no pagó y cancelar conserva el método histórico', async () => {
    const f = await crear();
    (f.nativeElement.querySelector('input[value="PLIN"]') as HTMLInputElement).click();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#confirmar-cambio-entrega').open).toBe(true);
    expect(instruccion()?.metodo).toBe('YAPE');
    expect(emitir).not.toHaveBeenCalled();
    boton(f, 'Conservar pago y continuar').click();
    await f.whenStable();
    f.detectChanges();
    expect(instruccion()?.metodo).toBe('YAPE');
    expect(cambiar).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('input[value="YAPE"]').checked).toBe(true);
  });
  it('cambia de método en el mismo paso, reemite la compra y conserva contacto y factura', async () => {
    const f = await crear();
    (f.nativeElement.querySelector('input[value="PLIN"]') as HTMLInputElement).click();
    await f.whenStable();
    boton(f, 'Todavía no pagué: cambiar método').click();
    await vi.waitFor(() => expect(emitir).toHaveBeenCalledOnce());
    await f.whenStable();
    f.detectChanges();
    expect(emitir.mock.calls[0][1]).toBe('PLIN');
    expect(emitir.mock.calls[0][0].contacto.correo).toBe('ana@checkout.test');
    expect(emitir.mock.calls[0][0].facturacion.numeroDocumento).toBe('00123456');
    expect(instruccion()?.metodo).toBe('PLIN');
    expect(f.nativeElement.querySelector('app-instrucciones-compra')).not.toBeNull();
    expect(f.nativeElement.querySelector('#entrega-correo')).toBeNull();
  });
});
