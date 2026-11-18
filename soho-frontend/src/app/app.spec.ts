import { proveerCoberturaPrueba } from './tienda/finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from './tienda/catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { ALMACENAMIENTO_FAVORITOS } from './estructuras/servicios/presentacion-tienda';
import { Title } from '@angular/platform-browser';
import { ALMACENAMIENTO_CARRITO } from './tienda/carrito/servicios/carrito-local';
import { Carrito } from './tienda/carrito/servicios/carrito';
// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('Aplicación SOHO', () => {
  it('debe cargar el inicio mediante las rutas y mostrar una sola portada principal', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
    const escenario = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await escenario.whenStable();
    expect(escenario.nativeElement.querySelectorAll('h1')).toHaveLength(1);
    expect(escenario.nativeElement.querySelector('h1')?.textContent).toContain('Tu estilo.');
    expect(escenario.nativeElement.querySelector('app-cabecera-tienda')).toBeTruthy();
    expect(escenario.nativeElement.querySelector('app-pie-tienda')).toBeTruthy();
  });
});

describe('Navegación de la tienda', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: ALMACENAMIENTO_FAVORITOS, useValue: null },
        { provide: ALMACENAMIENTO_CARRITO, useValue: null },
      ],
    }).compileComponents();
  });

  it('debe permitir acceder directamente a /favoritos dentro de la estructura de tienda', async () => {
    const escenario = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/favoritos');
    await escenario.whenStable();
    expect(escenario.nativeElement.querySelector('main h1')?.textContent).toContain(
      'Tus favoritos',
    );
    expect(escenario.nativeElement.querySelectorAll('main')).toHaveLength(1);
    expect(escenario.nativeElement.querySelector('app-cabecera-tienda')).toBeTruthy();
    expect(escenario.nativeElement.querySelector('app-pie-tienda')).toBeTruthy();
    expect(escenario.nativeElement.querySelector('dialog')?.open).toBe(false);
  });

  it('debe conservar el título del producto al cambiar su variante y actualizarlo para otro modelo', async () => {
    const escenario = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/producto/samba');
    await escenario.whenStable();
    expect(TestBed.inject(Title).getTitle()).toBe('adidas Samba OG | SOHO');
    await router.navigateByUrl('/producto/samba?color=NG&talla=40');
    await escenario.whenStable();
    expect(TestBed.inject(Title).getTitle()).toBe('adidas Samba OG | SOHO');
    await router.navigateByUrl('/producto/af1');
    await escenario.whenStable();
    expect(TestBed.inject(Title).getTitle()).toContain('Air Force');
  });

  it('debe navegar desde el corazón de la cabecera y marcar el enlace como página actual', async () => {
    const escenario = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await escenario.whenStable();
    escenario.nativeElement.querySelector('app-cabecera-tienda a[href="/favoritos"]').click();
    await escenario.whenStable();
    expect(router.url).toBe('/favoritos');
    expect(
      escenario.nativeElement
        .querySelector('app-cabecera-tienda a[href="/favoritos"]')
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(escenario.nativeElement.querySelector('dialog')?.open).toBe(false);
  });

  it('debe abrir el carrito dedicado desde la cabecera y contar unidades', async () => {
    const escenario = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    TestBed.inject(Carrito).agregar('NK-AF107-BL-40', 3);
    await escenario.whenStable();
    const enlace = escenario.nativeElement.querySelector('app-cabecera-tienda a[href="/carrito"]');
    expect(enlace.getAttribute('aria-label')).toBe('Carrito: 3 productos');
    enlace.click();
    await escenario.whenStable();
    expect(router.url).toBe('/carrito');
    expect(escenario.nativeElement.querySelectorAll('main')).toHaveLength(1);
    expect(escenario.nativeElement.querySelector('main h1').textContent).toContain('Tu carrito');
    expect(TestBed.inject(Title).getTitle()).toBe('Tu carrito | SOHO');
    expect(enlace.getAttribute('aria-current')).toBe('page');
  });
});
