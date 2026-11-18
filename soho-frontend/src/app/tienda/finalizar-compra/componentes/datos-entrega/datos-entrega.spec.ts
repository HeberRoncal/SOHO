import { proveerCoberturaPrueba } from '../../pruebas/cobertura.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatosEntrega } from './datos-entrega';

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('DatosEntrega', () => {
  let componente: DatosEntrega;
  let escenario: ComponentFixture<DatosEntrega>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatosEntrega],
    }).compileComponents();

    escenario = TestBed.createComponent(DatosEntrega);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
  it('permite continuar con factura sin exigir el documento oculto de boleta', async () => {
    const confirmado = vi.fn();
    componente.confirmado.subscribe(confirmado);
    const vista = escenario.nativeElement as HTMLElement;
    [...vista.querySelectorAll<HTMLButtonElement>('.segmentado button')]
      .find((boton) => boton.textContent?.trim() === 'Factura')!
      .click();
    await escenario.whenStable();
    const datos = {
      'entrega-correo': 'ana@ejemplo.com',
      'entrega-nombres': 'Ana',
      'entrega-apellidos': 'Pérez',
      'entrega-celular': '987654321',
      'fiscal-ruc': '20123456789',
      'fiscal-razon': 'Empresa SAC',
      'fiscal-domicilio': 'Av. Perú 123',
      'entrega-distrito': 'trujillo',
      'entrega-direccion': 'Calle Los Pinos 123',
    };
    for (const [id, valor] of Object.entries(datos)) {
      const entrada = vista.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
      entrada.value = valor;
      entrada.dispatchEvent(
        new Event(entrada.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
      );
    }
    await escenario.whenStable();
    vista
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await escenario.whenStable();
    expect(confirmado).toHaveBeenCalledOnce();
    expect(confirmado.mock.calls[0][0].facturacion.tipo).toBe('factura');
  });
});
