import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ZoomImagen } from '../../../../compartido/directivas/zoom-imagen';
import { VisorImagenes } from './visor-imagenes';

describe('Visor de imágenes', () => {
  let vista: ComponentFixture<VisorImagenes>;
  let dialogo: HTMLDialogElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VisorImagenes] }).compileComponents();
    vista = TestBed.createComponent(VisorImagenes);
    vista.componentRef.setInput('imagenes', ['/primera.png', '/segunda.png', '/tercera.png']);
    vista.componentRef.setInput('descripcion', 'Zapatillas SOHO');
    await vista.whenStable();
    dialogo = vista.nativeElement.querySelector('dialog');
    // JSDOM no implementa la capa modal nativa; se comprueba además en Chrome.
    dialogo.showModal = () => dialogo.setAttribute('open', '');
    dialogo.close = () => dialogo.removeAttribute('open');
  });

  async function abrir(indice = 0) {
    vista.componentRef.setInput('indice', indice);
    vista.componentRef.setInput('abierto', true);
    await vista.whenStable();
  }

  it('debe abrir la fotografía seleccionada con zoom activado únicamente por clic', async () => {
    await abrir(1);
    expect(dialogo.open).toBe(true);
    expect(dialogo.querySelector('.fotografia')?.getAttribute('src')).toBe('/segunda.png');
    const zoom = vista.debugElement.query(By.directive(ZoomImagen)).injector.get(ZoomImagen);
    expect(zoom.activacion()).toBe('clic');
    expect(dialogo.querySelector('.superficie')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('debe recorrer las fotos con flechas, teclado y miniaturas sin salir del visor', async () => {
    await abrir(2);
    (dialogo.querySelector('[aria-label="Imagen siguiente"]') as HTMLButtonElement).click();
    await vista.whenStable();
    expect(vista.componentInstance.indice()).toBe(0);
    dialogo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await vista.whenStable();
    expect(vista.componentInstance.indice()).toBe(2);
    (dialogo.querySelector('[aria-label="Mostrar imagen 2"]') as HTMLButtonElement).click();
    await vista.whenStable();
    expect(vista.componentInstance.indice()).toBe(1);
    expect(dialogo.querySelector('.miniaturas .activa')?.getAttribute('aria-label')).toBe(
      'Mostrar imagen 2',
    );
    expect(dialogo.open).toBe(true);
  });

  it('debe emitir el cierre mediante Escape y el botón, y quitar la foto al cerrar', async () => {
    let cierres = 0;
    vista.componentInstance.cerrado.subscribe(() => cierres++);
    await abrir();
    const cancelar = new Event('cancel', { cancelable: true });
    dialogo.dispatchEvent(cancelar);
    expect(cancelar.defaultPrevented).toBe(true);
    (dialogo.querySelector('[aria-label="Cerrar visor"]') as HTMLButtonElement).click();
    expect(cierres).toBe(2);
    vista.componentRef.setInput('abierto', false);
    await vista.whenStable();
    expect(dialogo.open).toBe(false);
    expect(dialogo.querySelector('.fotografia')).toBeNull();
  });

  it('debe ocultar la navegación cuando solo existe una fotografía', async () => {
    vista.componentRef.setInput('imagenes', ['/unica.png']);
    await abrir();
    expect(dialogo.querySelector('.anterior')).toBeNull();
    expect(dialogo.querySelector('.siguiente')).toBeNull();
    expect(dialogo.querySelector('.miniaturas')).toBeNull();
  });

  it('debe restablecer el estado accesible del zoom al cerrar y volver a abrir', async () => {
    await abrir();
    const zoom = vista.debugElement.query(By.directive(ZoomImagen)).injector.get(ZoomImagen);
    zoom.cambioZoom.emit(true);
    await vista.whenStable();
    expect(dialogo.querySelector('.superficie')?.getAttribute('aria-pressed')).toBe('true');
    vista.componentRef.setInput('abierto', false);
    await vista.whenStable();
    vista.componentRef.setInput('abierto', true);
    await vista.whenStable();
    expect(dialogo.querySelector('.superficie')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('debe mantener el recorrido de Tab y Mayús + Tab dentro del visor', async () => {
    await abrir();
    const botones = dialogo.querySelectorAll<HTMLButtonElement>('button');
    const primero = botones[0];
    const ultimo = botones[botones.length - 1];
    ultimo.focus();
    dialogo.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(primero);
    dialogo.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(ultimo);
  });
});
