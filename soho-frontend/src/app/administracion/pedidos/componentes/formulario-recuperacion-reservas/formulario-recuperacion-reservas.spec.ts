import { TestBed } from '@angular/core/testing';
import { FormularioRecuperacionReservas } from './formulario-recuperacion-reservas';
import { RecuperacionReservasApi } from '../../servicios/recuperacion-reservas-api';
import { adaptarPagoAdmin } from '../../../pagos/servicios/pagos-administracion-api';
import { adaptarPlanRecuperacion } from '../../modelos/recuperacion-reservas';
import {
  MOTIVO_RECUPERACION,
  planRecuperacionFixture,
  recuperacionApiFixture,
} from '../../servicios/recuperacion-reservas.fixtures';

describe('Confirmación de recuperación de reservas', () => {
  const pedido = () => adaptarPagoAdmin(recuperacionApiFixture()).pedido;
  const plan = () => adaptarPlanRecuperacion(planRecuperacionFixture(), pedido());
  let consultar: ReturnType<typeof vi.fn>, guardar: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    consultar = vi.fn().mockResolvedValue({ ok: true, plan: plan() });
    guardar = vi.fn().mockResolvedValue({ ok: true });
    TestBed.configureTestingModule({
      imports: [FormularioRecuperacionReservas],
      providers: [{ provide: RecuperacionReservasApi, useValue: { consultar, guardar } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
  const abrir = async () => {
    const f = TestBed.createComponent(FormularioRecuperacionReservas);
    f.componentRef.setInput('pedido', pedido());
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  };
  const completar = (raiz: HTMLElement) => {
    const texto = raiz.querySelector('textarea')!;
    texto.value = MOTIVO_RECUPERACION;
    texto.dispatchEvent(new Event('input', { bubbles: true }));
    (raiz.querySelector('input[type=checkbox]') as HTMLInputElement).click();
  };
  const enviar = (raiz: HTMLElement) =>
    raiz
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  it('muestra unidades, disponibilidad y plazo antes de confirmar', async () => {
    const f = await abrir();
    expect(f.nativeElement.textContent).toContain('2 unidades necesarias · 5 disponibles');
    expect(f.nativeElement.textContent).toContain('24 horas desde la confirmación');
    expect(guardar).not.toHaveBeenCalled();
  });
  it('exige un motivo y confirmación y enfoca el error', async () => {
    const f = await abrir();
    enviar(f.nativeElement);
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('motivo');
    expect(guardar).not.toHaveBeenCalled();
  });
  it('envía las versiones del plan abierto y una confirmación explícita', async () => {
    const f = await abrir();
    completar(f.nativeElement);
    enviar(f.nativeElement);
    await f.whenStable();
    expect(guardar).toHaveBeenCalledWith(pedido().codigo, {
      versionPedido: 3,
      versionPago: 2,
      motivo: MOTIVO_RECUPERACION,
      confirmado: true,
    });
  });
  it('bloquea envío y salida durante la escritura', async () => {
    let terminar!: (valor: { ok: boolean }) => void;
    guardar.mockReturnValue(
      new Promise((r) => {
        terminar = r;
      }),
    );
    const f = await abrir();
    completar(f.nativeElement);
    enviar(f.nativeElement);
    enviar(f.nativeElement);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.puedeSalir()).toBe(false);
    terminar({ ok: true });
    await f.whenStable();
  });
  it('conserva el motivo ante un conflicto y exige actualizar y confirmar otra vez', async () => {
    guardar.mockResolvedValue({ ok: false, requiereActualizar: true, error: 'El stock cambió.' });
    const f = await abrir();
    completar(f.nativeElement);
    enviar(f.nativeElement);
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('textarea').value).toBe(MOTIVO_RECUPERACION);
    expect(f.nativeElement.querySelector('.confirmar-recuperacion').disabled).toBe(true);
    f.nativeElement.querySelector('.actualizar-recuperacion').click();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('input[type=checkbox]').checked).toBe(false);
    expect(f.nativeElement.querySelector('textarea').value).toBe(MOTIVO_RECUPERACION);
  });
  it('bloquea confirmar después de recibir una versión diferente del pedido', async () => {
    const f = await abrir();
    completar(f.nativeElement);
    f.componentRef.setInput('pedido', { ...pedido(), version: 9 });
    f.detectChanges();
    enviar(f.nativeElement);
    await f.whenStable();
    expect(guardar).not.toHaveBeenCalled();
  });
  it('una consulta fallida no habilita guardar y permite reintentar', async () => {
    consultar.mockResolvedValueOnce({ ok: false, error: 'Sin conexión.' });
    const f = await abrir();
    expect(f.nativeElement.querySelector('.confirmar-recuperacion').disabled).toBe(true);
    expect(f.nativeElement.textContent).toContain('Sin conexión.');
    f.nativeElement.querySelector('.actualizar-recuperacion').click();
    await f.whenStable();
    f.detectChanges();
    expect(consultar).toHaveBeenCalledTimes(2);
    expect(f.nativeElement.textContent).toContain('24 horas');
  });
  it('pide descartar el borrador antes de cerrar', async () => {
    const f = await abrir();
    completar(f.nativeElement);
    await f.whenStable();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(f.componentInstance.puedeSalir()).toBe(false);
    expect(confirmar).toHaveBeenCalledTimes(1);
  });
  it('una falta de stock se muestra y bloquea la confirmación sin borrar el motivo', async () => {
    consultar.mockResolvedValueOnce({
      ok: true,
      plan: { ...plan(), puedeRecuperar: false, motivoBloqueo: 'Faltan unidades.' },
    });
    const f = await abrir();
    expect(f.nativeElement.textContent).toContain('Faltan unidades.');
    expect(f.nativeElement.querySelector('.confirmar-recuperacion').disabled).toBe(true);
  });
});
