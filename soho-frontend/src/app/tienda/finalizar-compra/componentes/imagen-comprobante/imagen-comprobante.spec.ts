import { TestBed } from '@angular/core/testing';
import { ImagenComprobante } from './imagen-comprobante';
describe('Selección de la imagen original del comprobante', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 420;
        naturalHeight = 520;
        decode = async () => {};
      },
    );
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  function crear() {
    const f = TestBed.createComponent(ImagenComprobante);
    f.detectChanges();
    return f;
  }
  function elegir(f: ReturnType<typeof crear>, archivo: File) {
    const input = f.nativeElement.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
    input.dispatchEvent(new Event('change'));
    f.detectChanges();
  }
  it.each(['application/pdf', 'image/svg+xml', 'text/plain'])(
    'rechaza %s sin leer bytes',
    (tipo) => {
      const f = crear();
      elegir(f, new File(['datos'], 'imagen', { type: tipo }));
      expect(f.nativeElement.textContent).toContain('Elige una imagen');
      expect(f.nativeElement.querySelector('img')).toBeNull();
    },
  );
  it('rechaza archivos vacíos', () => {
    const f = crear();
    elegir(f, new File([], 'recibo.png', { type: 'image/png' }));
    expect(f.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
  });
  it('emite los bytes originales y conserva ceros iniciales', async () => {
    const f = crear(),
      recibir = vi.fn();
    f.componentInstance.enviado.subscribe(recibir);
    elegir(f, new File(['original'], 'recibo.png', { type: 'image/png' }));
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.querySelector('img')).toBeTruthy();
    });
    const numero = f.nativeElement.querySelector('#numero-operacion');
    numero.value = '001234';
    numero.dispatchEvent(new Event('input'));
    f.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    expect(recibir).toHaveBeenCalledWith(
      expect.objectContaining({
        vistaPrevia: 'data:image/png;base64,b3JpZ2luYWw=',
        numeroOperacion: '001234',
        tamanoBytes: 8,
      }),
    );
  });
  it('no emite mientras está ocupado ni expone número editable en corrección', () => {
    const f = crear(),
      recibir = vi.fn();
    f.componentInstance.enviado.subscribe(recibir);
    f.componentRef.setInput('ocupado', true);
    f.componentRef.setInput('correccion', true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('#numero-operacion')).toBeNull();
    f.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    expect(recibir).not.toHaveBeenCalled();
  });
  it('rechaza imágenes con dimensiones excesivas', async () => {
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 9000;
        naturalHeight = 520;
        decode = async () => {};
      },
    );
    const f = crear();
    elegir(f, new File(['original'], 'recibo.png', { type: 'image/png' }));
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('demasiado grande');
    });
    expect(f.nativeElement.querySelector('img')).toBeNull();
  });
  it('admite arrastrar un archivo conservando sus bytes originales', async () => {
    const f = crear(),
      r = vi.fn();
    f.componentInstance.enviado.subscribe(r);
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', {
      value: { files: [new File(['original'], 'arrastrado.png', { type: 'image/png' })] },
    });
    f.nativeElement.querySelector('.subir').dispatchEvent(e);
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.querySelector('img')).toBeTruthy();
    });
    f.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    expect(r).toHaveBeenCalledWith(
      expect.objectContaining({
        nombreArchivo: 'arrastrado.png',
        vistaPrevia: 'data:image/png;base64,b3JpZ2luYWw=',
      }),
    );
  });
  it('no permite preparar ni enviar el archivo sin un método verificado', () => {
    const f = crear(),
      r = vi.fn();
    f.componentInstance.enviado.subscribe(r);
    f.componentRef.setInput('habilitado', false);
    f.detectChanges();
    elegir(f, new File(['original'], 'recibo.png', { type: 'image/png' }));
    expect(f.nativeElement.querySelector('.subir').disabled).toBe(true);
    expect(f.nativeElement.querySelector('img')).toBeNull();
    expect(r).not.toHaveBeenCalled();
  });
  it('cambiar la instrucción retira el archivo y número de la transferencia anterior', async () => {
    const f = crear();
    elegir(f, new File(['original'], 'recibo.png', { type: 'image/png' }));
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.querySelector('img')).toBeTruthy();
    });
    const n = f.nativeElement.querySelector('#numero-operacion');
    n.value = '001234';
    n.dispatchEvent(new Event('input'));
    f.componentRef.setInput('referencia', 'otra-instruccion');
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('img')).toBeNull();
    expect(n.value).toBe('');
  });
});
