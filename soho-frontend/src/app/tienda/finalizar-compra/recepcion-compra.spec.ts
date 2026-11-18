import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Cuenta } from '../cuenta/servicios/cuenta';
import { RecepcionCompra } from './recepcion-compra';
import { CheckoutPagosApi } from './servicios/checkout-pagos-api';
import { ConsultaRecepcion } from './modelos/contrato-checkout';
import { idPruebaCompra, recepcionPruebaCompra } from './modelos/checkout.fixtures';

describe('Recepción privada del comprador', () => {
  const r = recepcionPruebaCompra();
  let api: {
    consulta: ReturnType<typeof signal<ConsultaRecepcion | null>>;
    intento: ReturnType<typeof signal<null | { operacion?: { tipo: string } }>>;
    ocupado: ReturnType<typeof signal<boolean>>;
    requiereSesion: ReturnType<typeof signal<boolean>>;
    mensaje: ReturnType<typeof signal<string>>;
    abrir: ReturnType<typeof vi.fn>;
    vincularPedido: ReturnType<typeof vi.fn>;
    completarRegistro: ReturnType<typeof vi.fn>;
    procesar: ReturnType<typeof vi.fn>;
    comprobante: ReturnType<typeof vi.fn>;
    reintentar: ReturnType<typeof vi.fn>;
  };
  let ruta: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    api = {
      consulta: signal<ConsultaRecepcion | null>({ recepcion: r }),
      intento: signal(null),
      ocupado: signal(false),
      requiereSesion: signal(false),
      mensaje: signal(''),
      abrir: vi.fn(async () => true),
      vincularPedido: vi.fn(async () => null),
      completarRegistro: vi.fn(async (): Promise<string | null> => null),
      procesar: vi.fn(async () => true),
      comprobante: vi.fn(async () => 'blob:privada'),
      reintentar: vi.fn(async () => true),
    };
    ruta = new BehaviorSubject(convertToParamMap({ id: r.id }));
    TestBed.configureTestingModule({
      imports: [RecepcionCompra],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: ruta, snapshot: { queryParams: {} } } },
        { provide: CheckoutPagosApi, useValue: api },
        { provide: Cuenta, useValue: { perfil: signal(null) } },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  const crear = async () => {
    const f = TestBed.createComponent(RecepcionCompra);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  };
  it('continúa el registro al abrir la recepción y dirige al paso de confirmación', async () => {
    api.completarRegistro.mockImplementation(async () => {
      api.consulta.set({
        recepcion: { ...r, estado: 'PEDIDO_CREADO', pedido: { codigo: 'SOHO-TEST0001' } },
      });
      return 'SOHO-TEST0001';
    });
    const f = await crear();
    expect(api.completarRegistro).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/pedido', 'SOHO-TEST0001']);
    expect(f.nativeElement.querySelector('app-pasos-compra li:nth-child(3).actual')).toBeTruthy();
    expect(f.nativeElement.textContent).not.toContain('Pago aprobado');
    expect(f.nativeElement.textContent).not.toContain('Registrar mi pedido');
  });
  it('ofrece reintentar solo cuando no pudo completar el registro automático', async () => {
    const f = await crear();
    const b = [...f.nativeElement.querySelectorAll('button')].find(
      (b: any) => b.textContent.trim() === 'Reintentar registro',
    ) as HTMLButtonElement;
    expect(b).toBeTruthy();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    b.click();
    await f.whenStable();
    expect(api.completarRegistro).toHaveBeenCalledTimes(2);
  });
  it('atención comercial no permite procesar ni pide otra transferencia', async () => {
    api.consulta.set({
      recepcion: { ...r, estado: 'REQUIERE_ATENCION', motivos: ['PRECIO_CAMBIADO'] },
    });
    const f = await crear();
    expect(f.nativeElement.textContent).toContain('No necesitas volver a pagar');
    expect(f.nativeElement.textContent).not.toContain('Registrar mi pedido');
  });
  it('muestra mensaje público y corrección sin permitir editar el número', async () => {
    api.consulta.set({
      recepcion: { ...r, estado: 'REQUIERE_ATENCION' },
      correccion: {
        solicitudId: idPruebaCompra(9),
        mensaje: 'La fecha no se ve',
        pendiente: true,
        versionEsperada: 3,
      },
    });
    const f = await crear();
    expect(f.nativeElement.textContent).toContain('La fecha no se ve');
    expect(f.nativeElement.querySelector('input[type=file]')).toBeTruthy();
    expect(f.nativeElement.querySelector('#numero-operacion')).toBeNull();
    expect(f.nativeElement.textContent).toContain('Conservaremos el número');
  });
  it('recepción pendiente solicita el mismo archivo y permite actualizar', async () => {
    api.consulta.set({
      recepcion: {
        ...r,
        estado: 'RECIBIENDO',
        comprobante: { ...r.comprobante, estadoArchivo: 'PENDIENTE', confirmadoEn: null },
      },
    });
    const f = await crear();
    expect(f.nativeElement.textContent).toContain('archivo original');
    expect(f.nativeElement.textContent).not.toContain('Ver comprobante recibido');
    expect(f.nativeElement.textContent).not.toContain('Registrar mi pedido');
  });
  it('no muestra una recepción cacheada al navegar a otra referencia', async () => {
    const f = await crear();
    ruta.next(convertToParamMap({ id: idPruebaCompra(10) }));
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-instrucciones-compra')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain(r.referencia);
  });
  it('retira y revoca la imagen al perder acceso', async () => {
    const revocar = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override revokeObjectURL = revocar;
      },
    );
    const f = await crear();
    const b = [...f.nativeElement.querySelectorAll('button')].find(
      (b: any) => b.textContent.trim() === 'Ver comprobante recibido',
    ) as HTMLButtonElement;
    b.click();
    await f.whenStable();
    f.detectChanges();
    expect(
      f.nativeElement.querySelector('img[alt="Comprobante privado de esta recepción"]'),
    ).toBeTruthy();
    api.consulta.set(null);
    TestBed.tick();
    f.detectChanges();
    expect(revocar).toHaveBeenCalledWith('blob:privada');
    expect(
      f.nativeElement.querySelector('img[alt="Comprobante privado de esta recepción"]'),
    ).toBeNull();
  });
  it('un pedido creado dirige al seguimiento y no vuelve a procesar', async () => {
    api.consulta.set({
      recepcion: { ...r, estado: 'PEDIDO_CREADO', pedido: { codigo: 'SOHO-TEST0001' } },
    });
    const f = await crear();
    expect(api.completarRegistro).toHaveBeenCalledOnce();
    expect(f.nativeElement.textContent).toContain('Ver mi pedido');
    const seguir = [...f.nativeElement.querySelectorAll('a')].find(
      (a: any) => a.textContent.trim() === 'Empezar otra compra',
    ) as HTMLAnchorElement;
    expect(seguir.getAttribute('href')).toBe('/finalizar-compra');
    expect(seguir.closest('details')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Registrar mi pedido');
    expect(f.nativeElement.textContent).not.toContain('Pago pendiente de revisión.');
  });
});
