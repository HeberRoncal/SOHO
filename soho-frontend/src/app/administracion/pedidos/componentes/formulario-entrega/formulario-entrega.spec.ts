import { TestBed } from '@angular/core/testing';
import { FormularioEntrega } from './formulario-entrega';
import { PedidosAdministracion } from '../../servicios/pedidos-administracion';
import { PEDIDOS_ADMIN_DEMO } from '../../../cambios/datos/pedidos-posventa-demo';
import { PedidoAdmin } from '../../modelos/pedido-admin';
import { AccionEntregaAdmin } from '../../modelos/entrega-admin';

describe('Formulario de preparación y entrega real', () => {
  let guardar: ReturnType<typeof vi.fn>, cargar: ReturnType<typeof vi.fn>, actual: PedidoAdmin;
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    actual = {
      ...PEDIDOS_ADMIN_DEMO[4],
      remoto: true,
      version: 3,
      estadoPago: 'aprobado',
      estadoEntrega: 'en-preparacion',
    };
    guardar = vi.fn().mockResolvedValue({ ok: true, errores: {} });
    cargar = vi.fn().mockResolvedValue({ ok: true });
    TestBed.configureTestingModule({
      imports: [FormularioEntrega],
      providers: [
        {
          provide: PedidosAdministracion,
          useValue: { guardarEntrega: guardar, cargarDetalle: cargar, obtener: () => actual },
        },
      ],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
  function abrir(accion: AccionEntregaAdmin = 'enviar') {
    const f = TestBed.createComponent(FormularioEntrega);
    f.componentRef.setInput('pedido', actual);
    f.componentRef.setInput('accion', accion);
    f.detectChanges();
    return f;
  }
  function escribir(f: ReturnType<typeof abrir>, campo: string, valor: string) {
    const e = f.nativeElement.querySelector(`[formcontrolname=${campo}]`) as HTMLInputElement;
    e.value = valor;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    f.detectChanges();
  }
  function enviar(f: ReturnType<typeof abrir>) {
    f.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    f.detectChanges();
  }
  it('explica el descuento real y la privacidad sin ofrecer valores de demostración', () => {
    const f = abrir(),
      t = f.nativeElement.textContent;
    expect(t).toContain('descontará las unidades del stock físico');
    expect(t).toContain('no se muestra al cliente');
    expect(t).not.toContain('Usar datos de ejemplo');
    expect(t).not.toContain('Cambio de demostración');
    expect(f.nativeElement.querySelector('button[type=submit]').textContent).toContain(
      'Registrar envío',
    );
  });
  it('valida campos y enfoca el resumen antes de enviar', async () => {
    const f = abrir();
    await f.whenStable();
    enviar(f);
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 10));
    expect(guardar).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('Indica un transportista');
    expect(
      f.nativeElement.querySelector('[formcontrolname=empresa]').getAttribute('aria-invalid'),
    ).toBe('true');
    expect(document.activeElement).toBe(f.nativeElement.querySelector('#errores-entrega'));
  });
  it('bloquea doble envío y cierre hasta adoptar la respuesta confirmada', async () => {
    let terminar!: (r: { ok: boolean; errores: Record<string, string> }) => void;
    guardar.mockReturnValue(
      new Promise((r) => {
        terminar = r;
      }),
    );
    const f = abrir(),
      registrado = vi.fn(),
      cerrado = vi.fn();
    f.componentInstance.registrado.subscribe(registrado);
    f.componentInstance.cerrado.subscribe(cerrado);
    await f.whenStable();
    escribir(f, 'empresa', 'Reparto SOHO');
    escribir(f, 'seguimiento', '000123');
    enviar(f);
    enviar(f);
    f.nativeElement.querySelector('button[aria-label="Cerrar ventana"]').click();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(cerrado).not.toHaveBeenCalled();
    expect(registrado).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('fieldset').disabled).toBe(true);
    expect(f.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    terminar({ ok: true, errores: {} });
    await f.whenStable();
    expect(registrado).toHaveBeenCalledWith('enviar');
  });
  it('conserva borrador y exige consultar después de un resultado incierto', async () => {
    guardar.mockResolvedValueOnce({
      ok: false,
      errores: { estado: 'Actualiza para confirmar el resultado.' },
      requiereActualizar: true,
    });
    const f = abrir();
    await f.whenStable();
    escribir(f, 'empresa', 'Reparto SOHO');
    escribir(f, 'seguimiento', '000123');
    escribir(f, 'nota', 'Embalaje privado');
    enviar(f);
    await f.whenStable();
    expect(f.nativeElement.querySelector('[formcontrolname=nota]').value).toBe('Embalaje privado');
    expect(f.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    enviar(f);
    expect(guardar).toHaveBeenCalledTimes(1);
    actual = { ...actual, version: 4 };
    f.componentRef.setInput('pedido', actual);
    f.detectChanges();
    const boton = [...f.nativeElement.querySelectorAll('button')].find((b: unknown) =>
      (b as HTMLButtonElement).textContent?.includes('Actualizar pedido'),
    ) as HTMLButtonElement;
    boton.click();
    await f.whenStable();
    expect(cargar).toHaveBeenCalledWith(actual.codigo);
    expect(f.nativeElement.querySelector('[formcontrolname=seguimiento]').value).toBe('000123');
    expect(f.nativeElement.querySelector('button[type=submit]').disabled).toBe(false);
    enviar(f);
    await f.whenStable();
    expect(guardar).toHaveBeenLastCalledWith(
      actual.codigo,
      expect.objectContaining({ versionPedido: 4, nota: 'Embalaje privado' }),
    );
  });
  it('no adopta silenciosamente una versión que cambió mientras la ventana estaba abierta', async () => {
    const f = abrir();
    await f.whenStable();
    escribir(f, 'empresa', 'Reparto SOHO');
    escribir(f, 'seguimiento', '000123');
    actual = { ...actual, version: 4 };
    f.componentRef.setInput('pedido', actual);
    f.detectChanges();
    enviar(f);
    await f.whenStable();
    expect(guardar).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('El pedido cambió');
    expect(f.nativeElement.querySelector('[formcontrolname=seguimiento]').value).toBe('000123');
  });
  it('entregar requiere una confirmación explícita del cliente recibido', async () => {
    actual = {
      ...actual,
      estadoEntrega: 'enviado',
      seguimiento: { empresa: 'Reparto SOHO', codigo: '000123' },
    };
    const f = abrir('entregar');
    await f.whenStable();
    enviar(f);
    await f.whenStable();
    expect(guardar).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('Confirma que el pedido fue entregado');
    f.nativeElement.querySelector('input[type=checkbox]').click();
    enviar(f);
    await f.whenStable();
    expect(guardar).toHaveBeenCalledWith(
      actual.codigo,
      expect.objectContaining({ accion: 'entregar', confirmado: true }),
    );
  });
  it('protege el borrador ante cierre o navegación sin bloquear un formulario vacío', async () => {
    const f = abrir(),
      cerrado = vi.fn();
    f.componentInstance.cerrado.subscribe(cerrado);
    await f.whenStable();
    expect(f.componentInstance.puedeSalir()).toBe(true);
    escribir(f, 'nota', 'Un borrador');
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    f.nativeElement.querySelector('button[aria-label="Cerrar ventana"]').click();
    expect(cerrado).not.toHaveBeenCalled();
    expect(f.componentInstance.puedeSalir()).toBe(false);
    confirmar.mockReturnValue(true);
    f.nativeElement.querySelector('button[aria-label="Cerrar ventana"]').click();
    expect(cerrado).toHaveBeenCalledTimes(1);
  });
});
