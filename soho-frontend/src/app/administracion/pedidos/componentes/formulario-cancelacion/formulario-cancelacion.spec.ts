import { TestBed } from '@angular/core/testing';
import { FormularioCancelacion } from './formulario-cancelacion';
import { PedidosAdministracion } from '../../servicios/pedidos-administracion';
import { adaptarPagoAdmin } from '../../../pagos/servicios/pagos-administracion-api';
import { cancelacionApiFixture as fixture } from '../../servicios/cancelaciones-administracion-api.fixtures';
import { PedidoAdmin } from '../../modelos/pedido-admin';

describe('Formulario real de cancelación y liberación', () => {
  let guardar: ReturnType<typeof vi.fn>,
    liberar: ReturnType<typeof vi.fn>,
    cargar: ReturnType<typeof vi.fn>,
    actual: PedidoAdmin;
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    actual = adaptarPagoAdmin(fixture()).pedido;
    guardar = vi.fn().mockResolvedValue({ ok: true, errores: {} });
    liberar = vi.fn().mockResolvedValue({ ok: true, errores: {} });
    cargar = vi.fn().mockResolvedValue({ ok: true });
    TestBed.configureTestingModule({
      imports: [FormularioCancelacion],
      providers: [
        {
          provide: PedidosAdministracion,
          useValue: {
            guardarCancelacion: guardar,
            liberarReservas: liberar,
            actualizarCancelacion: cargar,
            obtener: () => actual,
          },
        },
      ],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
  function abrir(liberacion = false) {
    const f = TestBed.createComponent(FormularioCancelacion);
    f.componentRef.setInput('pedido', actual);
    f.componentRef.setInput('liberar', liberacion);
    f.detectChanges();
    return f;
  }
  function motivo(f: ReturnType<typeof abrir>, valor = 'Cancelación solicitada por el cliente.') {
    const e = f.nativeElement.querySelector('textarea');
    e.value = valor;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    f.detectChanges();
  }
  function seleccionar(f: ReturnType<typeof abrir>, valor = 'CONSERVAR') {
    f.nativeElement.querySelector('input[value=' + valor + ']').click();
    f.detectChanges();
  }
  function confirmar(f: ReturnType<typeof abrir>) {
    f.nativeElement.querySelector('input[type=checkbox]').click();
    f.detectChanges();
  }
  function enviar(f: ReturnType<typeof abrir>) {
    f.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    f.detectChanges();
  }
  it('describe consecuencias reales y privacidad; no preselecciona la decisión', () => {
    const f = abrir(),
      t = f.nativeElement.textContent;
    expect(t).toContain('Solo el equipo de SOHO');
    expect(t).toContain('no realizan un reembolso');
    expect(t).toContain('2 unidades');
    expect(t).not.toContain('Simular');
    expect(f.nativeElement.querySelector('input[type=radio]:checked')).toBeNull();
  });
  it('valida motivo, elección y confirmación y enfoca el resumen', async () => {
    const f = abrir();
    await f.whenStable();
    enviar(f);
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 10));
    expect(guardar).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('Elige si se liberan');
    expect(f.nativeElement.querySelector('textarea').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(f.nativeElement.querySelector('#errores-cancelacion'));
  });
  it('no pide elección cuando solo hay reservas automáticas', async () => {
    actual = adaptarPagoAdmin(
      fixture({ consultables: 0, automaticas: 2, pago: 'PENDIENTE' }),
    ).pedido;
    const f = abrir();
    await f.whenStable();
    expect(f.nativeElement.querySelector('input[type=radio]')).toBeNull();
    motivo(f);
    confirmar(f);
    enviar(f);
    await f.whenStable();
    expect(guardar).toHaveBeenCalledWith(
      actual.codigo,
      expect.not.objectContaining({ decisionReservasConsultadas: expect.anything() }),
    );
  });
  it('bloquea campos, doble envío y cierre hasta la respuesta', async () => {
    let terminar!: (v: unknown) => void;
    guardar.mockReturnValue(new Promise((r) => (terminar = r)));
    const f = abrir(),
      registrado = vi.fn(),
      cerrado = vi.fn();
    f.componentInstance.registrado.subscribe(registrado);
    f.componentInstance.cerrado.subscribe(cerrado);
    await f.whenStable();
    motivo(f);
    seleccionar(f);
    confirmar(f);
    enviar(f);
    enviar(f);
    f.nativeElement.querySelector('[aria-label="Cerrar ventana"]').click();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(cerrado).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('fieldset.campos').disabled).toBe(true);
    terminar({ ok: true, errores: {} });
    await f.whenStable();
    expect(registrado).toHaveBeenCalledTimes(1);
  });
  it.each(['version', 'versionPago'] as const)(
    'no actualiza silenciosamente %s mientras está abierto',
    async (campo) => {
      const f = abrir();
      await f.whenStable();
      motivo(f);
      seleccionar(f);
      confirmar(f);
      actual = { ...actual, [campo]: 3 };
      f.componentRef.setInput('pedido', actual);
      f.detectChanges();
      enviar(f);
      await f.whenStable();
      expect(guardar).not.toHaveBeenCalled();
      expect(f.nativeElement.textContent).toContain('Actualiza antes de continuar');
    },
  );
  it('conserva borrador ante error; actualizar adopta versiones y exige reconfirmar', async () => {
    guardar.mockResolvedValueOnce({
      ok: false,
      errores: { estado: 'Actualiza para comprobar el resultado.' },
      requiereActualizar: true,
    });
    const f = abrir();
    await f.whenStable();
    motivo(f);
    seleccionar(f);
    confirmar(f);
    enviar(f);
    await f.whenStable();
    expect(f.nativeElement.querySelector('textarea').value).toContain('Cancelación solicitada');
    expect(f.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    actual = { ...actual, version: 3 };
    f.componentRef.setInput('pedido', actual);
    f.detectChanges();
    [...f.nativeElement.querySelectorAll('button')]
      .find((b: any) => b.textContent.includes('Actualizar pedido'))
      .click();
    await f.whenStable();
    expect(cargar).toHaveBeenCalledWith(actual.codigo);
    expect(f.nativeElement.querySelector('input[type=checkbox]').checked).toBe(false);
    expect(f.nativeElement.querySelector('textarea').value).toContain('Cancelación solicitada');
    confirmar(f);
    enviar(f);
    await f.whenStable();
    expect(guardar).toHaveBeenLastCalledWith(
      actual.codigo,
      expect.objectContaining({
        versionPedido: 3,
        versionPago: 2,
        decisionReservasConsultadas: 'CONSERVAR',
      }),
    );
  });
  it('la liberación no pide otro motivo y exige confirmación explícita', async () => {
    actual = adaptarPagoAdmin(fixture({ cancelado: true, conservar: true })).pedido;
    const f = abrir(true);
    await f.whenStable();
    expect(f.nativeElement.querySelector('textarea')).toBeNull();
    expect(f.nativeElement.textContent).toContain('2 unidades');
    enviar(f);
    await f.whenStable();
    expect(liberar).not.toHaveBeenCalled();
    confirmar(f);
    enviar(f);
    await f.whenStable();
    expect(liberar).toHaveBeenCalledWith(actual.codigo, {
      versionPedido: 3,
      versionPago: 2,
      confirmado: true,
    });
    expect(guardar).not.toHaveBeenCalled();
  });
  it('protege el borrador al cerrar y navegar', async () => {
    const f = abrir(),
      cerrado = vi.fn();
    f.componentInstance.cerrado.subscribe(cerrado);
    await f.whenStable();
    expect(f.componentInstance.puedeSalir()).toBe(true);
    motivo(f);
    const pregunta = vi.spyOn(window, 'confirm').mockReturnValue(false);
    f.nativeElement.querySelector('[aria-label="Cerrar ventana"]').click();
    expect(cerrado).not.toHaveBeenCalled();
    expect(f.componentInstance.puedeSalir()).toBe(false);
    pregunta.mockReturnValue(true);
    f.nativeElement.querySelector('[aria-label="Cerrar ventana"]').click();
    expect(cerrado).toHaveBeenCalledTimes(1);
  });
  it.each(['cancelado', 'enviado', 'liberado'] as const)(
    'bloquea el formulario abierto cuando otra operación lo deja %s',
    async (cambio) => {
      if (cambio === 'liberado')
        actual = adaptarPagoAdmin(fixture({ cancelado: true, conservar: true })).pedido;
      const f = abrir(cambio === 'liberado');
      await f.whenStable();
      if (cambio !== 'liberado') {
        motivo(f);
        seleccionar(f);
      }
      confirmar(f);
      actual =
        cambio === 'enviado'
          ? { ...actual, estadoEntrega: 'enviado', version: 3 }
          : adaptarPagoAdmin(
              fixture({ cancelado: true, conservar: true, liberado: cambio === 'liberado' }),
            ).pedido;
      f.componentRef.setInput('pedido', actual);
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain(
        'El estado actual del pedido ya no admite esta acción',
      );
      expect(f.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
      enviar(f);
      await f.whenStable();
      expect(guardar).not.toHaveBeenCalled();
      expect(liberar).not.toHaveBeenCalled();
    },
  );
});
