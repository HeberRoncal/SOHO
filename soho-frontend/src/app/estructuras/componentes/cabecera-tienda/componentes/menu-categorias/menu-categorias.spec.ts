import { proveerCatalogoPrueba } from '../../../../../tienda/catalogo/pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MenuCategorias } from './menu-categorias';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Submenús de categorías', () => {
  let vista: ComponentFixture<MenuCategorias>;
  const activador = (grupo: string): HTMLElement =>
    vista.nativeElement.querySelector(
      '[data-seccion="' +
        grupo +
        '"] .titulo-seccion, [data-seccion="' +
        grupo +
        '"] .activador-movil',
    );
  const pasarCursor = async (grupo: string) => {
    const evento = new Event('pointerenter');
    Object.defineProperty(evento, 'pointerType', { value: 'mouse' });
    vista.nativeElement.querySelector('[data-seccion="' + grupo + '"]').dispatchEvent(evento);
    await vista.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuCategorias],
      providers: [provideRouter([])],
    }).compileComponents();

    vista = TestBed.createComponent(MenuCategorias);
    await vista.whenStable();
  });

  it('debe abrir un único submenú al pasar el cursor y mantener los títulos sin acción de clic', async () => {
    const hombre = activador('zapatillas-hombre');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    expect(hombre.tagName).toBe('SPAN');
    expect(
      vista.nativeElement.querySelector(
        '[data-seccion="zapatillas-hombre"] .cabecera-grupo a, [data-seccion="zapatillas-hombre"] .cabecera-grupo button',
      ),
    ).toBeNull();
    await pasarCursor('zapatillas-hombre');
    const submenu = vista.nativeElement.querySelector('#' + hombre.getAttribute('aria-controls'));
    expect(submenu.hidden).toBe(false);
    expect(submenu.querySelector('a[href="/zapatillas-hombre?categoria=Urbano"]')).toBeTruthy();
    hombre.click();
    await vista.whenStable();
    expect(navegar).not.toHaveBeenCalled();
    expect(submenu.hidden).toBe(false);
    await pasarCursor('zapatillas-mujer');
    expect(submenu.hidden).toBe(true);
    expect(
      vista.nativeElement.querySelector('[data-seccion="zapatillas-mujer"] .submenu').hidden,
    ).toBe(false);
  });
  it('debe cerrar con Escape sin volver a abrirse al restaurar el foco', async () => {
    const hombre = activador('zapatillas-hombre');
    await pasarCursor('zapatillas-hombre');
    hombre.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await vista.whenStable();
    expect(
      vista.nativeElement.querySelector('[data-seccion="zapatillas-hombre"] .submenu').hidden,
    ).toBe(true);
    expect(
      vista.nativeElement.querySelector('[data-seccion="zapatillas-hombre"] .titulo-seccion'),
    ).toBe(document.activeElement);
  });
  it('debe cerrar al pulsar fuera del componente', async () => {
    await pasarCursor('zapatillas-hombre');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vista.whenStable();
    expect(
      vista.nativeElement.querySelector('[data-seccion="zapatillas-hombre"] .submenu').hidden,
    ).toBe(true);
  });
  it('debe desplegar las categorías en celular sin navegar al tocar la sección', async () => {
    vista.componentRef.setInput('movil', true);
    vista.componentRef.setInput('identificador', 'navegacion-movil');
    await vista.whenStable();
    const hombre = activador('zapatillas-hombre');
    expect(hombre.classList.contains('activador-movil')).toBe(true);
    hombre.click();
    await vista.whenStable();
    expect(hombre.getAttribute('aria-expanded')).toBe('true');
    expect(hombre.getAttribute('aria-controls')).toBe('navegacion-movil-zapatillas-hombre');
    hombre.click();
    await vista.whenStable();
    expect(hombre.getAttribute('aria-expanded')).toBe('false');
  });
  it.each([false, true])('Ofertas navega sin submen? (m?vil: %s)', async (movil) => {
    vista.componentRef.setInput('movil', movil);
    await vista.whenStable();
    const ofertas = activador('zapatillas-ofertas');
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    expect(ofertas.tagName).toBe('A');
    expect(ofertas.getAttribute('href')).toBe('/zapatillas-ofertas');
    expect(ofertas.hasAttribute('aria-expanded')).toBe(false);
    expect(ofertas.hasAttribute('aria-controls')).toBe(false);
    await pasarCursor('zapatillas-ofertas');
    expect(
      vista.nativeElement.querySelector('[data-seccion="zapatillas-ofertas"] .submenu'),
    ).toBeNull();
    expect(
      vista.nativeElement.querySelector('[data-seccion="zapatillas-ofertas"].abierto'),
    ).toBeNull();
    ofertas.click();
    await vista.whenStable();
    expect(navegar).toHaveBeenCalled();
    const destino = navegar.mock.calls[0][0];
    expect(typeof destino === 'string' ? destino : router.serializeUrl(destino)).toBe(
      '/zapatillas-ofertas',
    );
  });
});
