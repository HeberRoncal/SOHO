import { proveerCoberturaPrueba } from '../finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from './pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { ALMACENAMIENTO_FAVORITOS } from '../../estructuras/servicios/presentacion-tienda';
// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('Página de catálogo', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ALMACENAMIENTO_FAVORITOS, useValue: null }],
    }),
  );
  it('debe cargar los filtros y el orden de la URL', async () => {
    const navegador = await RouterTestingHarness.create(
      '/zapatillas?marca=Nike&desde=500&orden=precio-descendente',
    );
    const tarjetas = navegador.routeNativeElement!.querySelectorAll('app-tarjeta-producto');
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0].textContent).toContain('Pegasus Premium');
    expect(
      navegador.routeNativeElement!.querySelector<HTMLInputElement>(
        'input[name="orden-catalogo"]:checked',
      )!.value,
    ).toBe('precio-descendente');
  });
  it('debe mostrar el rango inválido y recuperar el catálogo al limpiar', async () => {
    const navegador = await RouterTestingHarness.create('/zapatillas?desde=800&hasta=200');
    expect(navegador.routeNativeElement!.querySelector('[role=alert]')!.textContent).toContain(
      'mínimo',
    );
    expect(navegador.routeNativeElement!.querySelectorAll('app-tarjeta-producto')).toHaveLength(0);
    (navegador.routeNativeElement!.querySelector('.borrar-todo') as HTMLButtonElement).click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas');
    expect(
      navegador.routeNativeElement!.querySelector<HTMLInputElement>(
        'input[name="orden-catalogo"]:checked',
      )!.value,
    ).toBe('relevancia');
    expect(
      navegador.routeNativeElement!.querySelectorAll('app-tarjeta-producto').length,
    ).toBeGreaterThan(0);
  });
  it('debe actualizar la URL cuando se cambia un filtro', async () => {
    const navegador = await RouterTestingHarness.create('/zapatillas');
    const etiqueta = [
      ...navegador.routeNativeElement!.querySelectorAll('app-filtros-catalogo label'),
    ].find((elemento) => elemento.textContent?.trim() === 'Nike')!;
    (etiqueta.querySelector('input') as HTMLInputElement).click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('marca=Nike');
  });
  it('debe seleccionar Relevancia por defecto y restaurarla al borrar todo', async () => {
    const navegador = await RouterTestingHarness.create('/zapatillas');
    const elemento = navegador.routeNativeElement!;
    const relevancia = elemento.querySelector<HTMLInputElement>('input[value="relevancia"]')!;
    expect(relevancia.checked).toBe(true);
    elemento.querySelector<HTMLInputElement>('input[value="precio-descendente"]')!.click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas?orden=precio-descendente');
    expect(relevancia.checked).toBe(false);
    const borrar = elemento.querySelector<HTMLButtonElement>('.borrar-todo')!;
    expect(borrar.disabled).toBe(false);
    borrar.click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas');
    expect(relevancia.checked).toBe(true);
    expect(relevancia.disabled).toBe(false);
    expect(borrar.disabled).toBe(true);
    expect(elemento.querySelectorAll('app-tarjeta-producto').length).toBeGreaterThan(0);
  });
  it.each(['hombre', 'mujer', 'unisex'])(
    'debe conservar la sección %s al borrar los filtros adicionales',
    async (seccion) => {
      const navegador = await RouterTestingHarness.create(
        '/zapatillas-' + seccion + '?marca=Nike&desde=500&orden=precio-descendente',
      );
      navegador.routeNativeElement!.querySelector<HTMLButtonElement>('.borrar-todo')!.click();
      await navegador.fixture.whenStable();
      const elemento = navegador.routeNativeElement!;
      expect(TestBed.inject(Router).url).toBe('/zapatillas-' + seccion);
      expect(elemento.querySelector<HTMLInputElement>('input[value="relevancia"]')!.checked).toBe(
        true,
      );
      expect(elemento.querySelector<HTMLButtonElement>('.borrar-todo')!.disabled).toBe(true);
      expect(elemento.querySelector('.numero-filtros')!.textContent?.trim()).toBe('1');
      expect(
        elemento.querySelector('.aplicados .etiquetas button')!.textContent?.trim().toLowerCase(),
      ).toBe(seccion);
      expect(elemento.querySelectorAll('app-tarjeta-producto').length).toBeGreaterThan(0);
    },
  );
  it('debe combinar géneros y volver a una sección al desmarcar uno conservando marca y orden', async () => {
    const navegador = await RouterTestingHarness.create(
      '/zapatillas-hombre?marca=Nike&orden=precio-ascendente',
    );
    const mujer = [
      ...navegador.routeNativeElement!.querySelectorAll('app-filtros-catalogo label'),
    ].find((elemento) => elemento.textContent?.trim() === 'Mujer')!;
    mujer.querySelector('input')!.click();
    await navegador.fixture.whenStable();
    const router = TestBed.inject(Router);
    expect(router.parseUrl(router.url).queryParams['genero']).toEqual(['Hombre', 'Mujer']);
    expect(router.parseUrl(router.url).queryParams['marca']).toBe('Nike');
    expect(router.parseUrl(router.url).queryParams['orden']).toBe('precio-ascendente');
    expect(
      navegador.routeNativeElement!.querySelector('.numero-filtros')!.textContent?.trim(),
    ).toBe('3');
    const hombre = [
      ...navegador.routeNativeElement!.querySelectorAll('app-filtros-catalogo label'),
    ].find((elemento) => elemento.textContent?.trim() === 'Hombre')!;
    hombre.querySelector('input')!.click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas-mujer?marca=Nike&orden=precio-ascendente');
    expect(navegador.routeNativeElement!.querySelector('h1')!.textContent).toContain('mujer');
    const mujerActual = [
      ...navegador.routeNativeElement!.querySelectorAll('app-filtros-catalogo label'),
    ].find((elemento) => elemento.textContent?.trim() === 'Mujer')!;
    mujerActual.querySelector('input')!.click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas?marca=Nike&orden=precio-ascendente');
  });
  it('debe restaurar una combinación de la URL y quitar solamente la etiqueta elegida', async () => {
    const navegador = await RouterTestingHarness.create('/zapatillas?genero=Mujer&genero=Unisex');
    const seleccionados = navegador.routeNativeElement!.querySelectorAll<HTMLInputElement>(
      'app-filtros-catalogo input[name$="-genero"]:checked',
    );
    expect([...seleccionados].map((input) => input.value)).toEqual(['Mujer', 'Unisex']);
    expect([...seleccionados].every((input) => input.type === 'checkbox')).toBe(true);
    const quitar = [
      ...navegador.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
        '.aplicados .etiquetas button',
      ),
    ].find((boton) => boton.textContent?.trim() === 'Mujer')!;
    quitar.click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas-unisex');
    expect(
      navegador.routeNativeElement!.querySelector('.numero-filtros')!.textContent?.trim(),
    ).toBe('1');
  });
  it('debe marcar y desmarcar los tres géneros desde Todos', async () => {
    const navegador = await RouterTestingHarness.create('/zapatillas?genero=Hombre&genero=Mujer');
    const todos = () =>
      [...navegador.routeNativeElement!.querySelectorAll('app-filtros-catalogo label')]
        .find((elemento) => elemento.textContent?.trim() === 'Todos')!
        .querySelector('input')!;
    expect(todos().indeterminate).toBe(true);
    todos().click();
    await navegador.fixture.whenStable();
    expect(todos().checked).toBe(true);
    expect(todos().indeterminate).toBe(false);
    expect(
      navegador.routeNativeElement!.querySelector('.numero-filtros')!.textContent?.trim(),
    ).toBe('3');
    todos().click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas');
    expect(navegador.routeNativeElement!.querySelector('.numero-filtros')).toBeNull();
  });
  it.each(['hombre', 'mujer'])(
    'debe quitar el género %s desde su etiqueta conservando los demás filtros',
    async (seccion) => {
      const navegador = await RouterTestingHarness.create('/zapatillas-' + seccion + '?marca=Nike');
      const elemento = navegador.routeNativeElement!;
      expect(elemento.querySelector('.numero-filtros')!.textContent?.trim()).toBe('2');
      const etiqueta = [
        ...elemento.querySelectorAll<HTMLButtonElement>('.aplicados .etiquetas button'),
      ].find((boton) => boton.textContent?.trim().toLowerCase() === seccion)!;
      etiqueta.click();
      await navegador.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/zapatillas?marca=Nike');
      expect(
        navegador.routeNativeElement!.querySelector('.numero-filtros')!.textContent?.trim(),
      ).toBe('1');
    },
  );
  it.each(['novedades', 'ofertas'])(
    'debe conservar la sección %s y limpiar solamente los filtros adicionales',
    async (seccion) => {
      const navegador = await RouterTestingHarness.create(
        '/zapatillas-' + seccion + '?genero=Mujer&marca=Nike&orden=precio-descendente',
      );
      navegador.routeNativeElement!.querySelector<HTMLButtonElement>('.borrar-todo')!.click();
      await navegador.fixture.whenStable();
      const elemento = navegador.routeNativeElement!;
      expect(TestBed.inject(Router).url).toBe('/zapatillas-' + seccion);
      expect(elemento.querySelector<HTMLButtonElement>('.borrar-todo')!.disabled).toBe(true);
      expect(elemento.querySelector('.numero-filtros')).toBeNull();
      expect(elemento.querySelector<HTMLInputElement>('input[value="relevancia"]')!.checked).toBe(
        true,
      );
      expect(elemento.querySelectorAll('app-tarjeta-producto').length).toBeGreaterThan(0);
    },
  );
  it('debe quitar la selección base de Ofertas y conservar el género adicional al salir de esa sección', async () => {
    const navegador = await RouterTestingHarness.create('/zapatillas-ofertas?genero=Hombre');
    const etiqueta = [
      ...navegador.routeNativeElement!.querySelectorAll('app-filtros-catalogo label'),
    ].find((elemento) => elemento.textContent?.trim() === 'Solo ofertas')!;
    etiqueta.querySelector('input')!.click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/zapatillas-hombre');
  });
});
