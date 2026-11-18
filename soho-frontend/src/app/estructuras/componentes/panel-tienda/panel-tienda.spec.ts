import { proveerCatalogoPrueba } from '../../../tienda/catalogo/pruebas/catalogo.fixture';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelTienda } from './panel-tienda';
import { PresentacionTienda } from '../../servicios/presentacion-tienda';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('PanelTienda', () => {
  let componente: PanelTienda;
  let escenario: ComponentFixture<PanelTienda>;

  beforeEach(async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.open = false;
      },
    });
    await TestBed.configureTestingModule({
      imports: [PanelTienda],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(PanelTienda);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });
  afterEach(() => {
    escenario?.destroy();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
  it('presenta el menú móvil y los paneles informativos mediante la misma fuente', async () => {
    const presentacion = TestBed.inject(PresentacionTienda);
    presentacion.abrir('menu');
    escenario.detectChanges();
    await escenario.whenStable();
    const host = escenario.nativeElement as HTMLElement;
    expect(host.querySelector('dialog[open] .menu a[href="/carrito"]')).not.toBeNull();
    presentacion.informar('Información de la tienda', 'Contenido recibido para el visitante.');
    escenario.detectChanges();
    await escenario.whenStable();
    expect(host.querySelector('.menu')).toBeNull();
    expect(host.querySelector('.informacion')?.textContent).toContain('Contenido recibido');
    host.querySelector<HTMLButtonElement>('button[aria-label="Cerrar ventana"]')!.click();
    escenario.detectChanges();
    expect(presentacion.panel()).toBeNull();
    expect(host.querySelector('dialog[open]')).toBeNull();
  });
});
