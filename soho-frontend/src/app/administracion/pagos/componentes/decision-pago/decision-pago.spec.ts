import { TestBed } from '@angular/core/testing';
import { DecisionPago } from './decision-pago';
import { PagosAdministracion } from '../../servicios/pagos-administracion';
import { PEDIDOS_ADMIN_DEMO } from '../../../cambios/datos/pedidos-posventa-demo';
import { PagoAdmin } from '../../modelos/pago-admin';

describe('Confirmación de revisión administrativa', () => {
  let revisar: ReturnType<typeof vi.fn>;
  const pago = (): PagoAdmin => ({
    pedido: { ...PEDIDOS_ADMIN_DEMO[0], remoto: true, version: 2, versionPago: 2 },
    comprobantes: [
      {
        id: 'primero',
        nombre: 'primero.png',
        fecha: '2026-11-14T12:00:00Z',
        estado: 'pendiente',
        monto: null,
      },
    ],
  });
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    revisar = vi.fn();
    TestBed.configureTestingModule({
      imports: [DecisionPago],
      providers: [{ provide: PagosAdministracion, useValue: { remoto: true, revisar } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
  it('conserva el comprobante y las versiones que se abrieron aunque llegue una versión nueva', async () => {
    revisar.mockResolvedValue({ ok: false, error: 'El comprobante cambió.' });
    const fixture = TestBed.createComponent(DecisionPago),
      inicial = pago();
    fixture.componentRef.setInput('pago', inicial);
    fixture.componentRef.setInput('accion', 'aprobado');
    fixture.detectChanges();
    fixture.componentRef.setInput('pago', {
      ...inicial,
      pedido: { ...inicial.pedido, version: 3, versionPago: 3 },
      comprobantes: [{ ...inicial.comprobantes[0], id: 'nuevo' }],
    });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(revisar).toHaveBeenCalledWith(
      inicial.pedido.codigo,
      expect.objectContaining({ comprobanteId: 'primero', versionPedido: 2, versionPago: 2 }),
    );
    expect(fixture.nativeElement.textContent).toContain('El comprobante cambió.');
  });
  it('bloquea doble envío mientras espera la confirmación del backend', async () => {
    let terminar!: (valor: { ok: boolean }) => void;
    revisar.mockReturnValue(
      new Promise((r) => {
        terminar = r;
      }),
    );
    const fixture = TestBed.createComponent(DecisionPago);
    fixture.componentRef.setInput('pago', pago());
    fixture.componentRef.setInput('accion', 'aprobado');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('input[type=checkbox]').click();
    const form = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(revisar).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    terminar({ ok: true });
    await fixture.whenStable();
  });
});
