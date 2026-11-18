import { proveerCatalogoPrueba } from '../catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NavigationStart, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DetalleProducto } from './detalle-producto';
import { ALMACENAMIENTO_FAVORITOS } from '../../estructuras/servicios/presentacion-tienda';
import { ALMACENAMIENTO_CARRITO } from '../carrito/servicios/carrito-local';
import { Carrito } from '../carrito/servicios/carrito';
import { afterEach, vi } from 'vitest';
import { FUENTE_CATALOGO, FuenteCatalogo } from '../catalogo/modelos/fuente-catalogo';
import { PRODUCTOS_CATALOGO_PRUEBA } from '../catalogo/pruebas/productos.fixtures';
import { Producto } from '../catalogo/modelos/producto';
// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Detalle de producto', () => {
  it('conserva el scroll al elegir talla y lo restablece al entrar a otro producto', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=BL');
    const router = TestBed.inject(Router);
    const politicas: (string | undefined)[] = [];
    const eventos = router.events.subscribe((evento) => {
      if (evento instanceof NavigationStart)
        politicas.push(router.currentNavigation()?.extras.scroll);
    });
    const talla = navegador.routeNativeElement!.querySelector<HTMLInputElement>(
      'input[type="radio"][value="40"]',
    )!;
    talla.checked = true;
    talla.dispatchEvent(new Event('change', { bubbles: true }));
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/producto/samba?color=BL&talla=40');
    expect(politicas).toEqual(['manual']);
    await navegador.navigateByUrl('/producto/no-existe');
    expect(politicas).toEqual(['manual', undefined]);
    eventos.unsubscribe();
  });
  afterEach(() => vi.useRealTimers());
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'producto/:identificador', component: DetalleProducto }]),
        { provide: ALMACENAMIENTO_FAVORITOS, useValue: null },
        { provide: ALMACENAMIENTO_CARRITO, useValue: null },
      ],
    }),
  );
  it('debe mostrar un estado propio cuando no existe el producto', async () => {
    const navegador = await RouterTestingHarness.create('/producto/no-existe');
    expect(navegador.routeNativeElement!.querySelector('h1')!.textContent).toContain(
      'Producto no encontrado',
    );
    expect(navegador.routeNativeElement!.querySelector('app-selector-variantes')).toBeNull();
  });
  it('presenta la marca encima y evita repetirla en el nombre histórico', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba');
    expect(navegador.routeNativeElement!.querySelector('.marca-producto')!.textContent).toBe(
      'adidas',
    );
    expect(navegador.routeNativeElement!.querySelector('h1')!.textContent).toBe('Samba OG');
    expect(TestBed.inject(FUENTE_CATALOGO).obtener('samba')!.nombre).toBe('adidas Samba OG');
  });
  it('conserva el nombre cuando se ha guardado sin incluir la marca', async () => {
    const fuente = TestBed.inject(FUENTE_CATALOGO);
    const producto = fuente.obtener('samba')!;
    vi.spyOn(fuente, 'obtener').mockReturnValue({ ...producto, nombre: 'Samba OG' });
    const navegador = await RouterTestingHarness.create('/producto/samba');
    expect(navegador.routeNativeElement!.querySelector('.marca-producto')!.textContent).toBe(
      'adidas',
    );
    expect(navegador.routeNativeElement!.querySelector('h1')!.textContent).toBe('Samba OG');
  });
  it('debe bloquear la compra sin talla o con una combinación agotada', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba');
    expect(
      (navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled,
    ).toBe(true);
    await navegador.navigateByUrl('/producto/samba?color=BL&talla=38');
    expect(
      (navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(navegador.routeNativeElement!.querySelector('.error')!.textContent).toContain(
      'no está disponible',
    );
  });
  it('debe bloquear una combinación con color inexistente aunque la talla exista', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=INVALIDO&talla=40');
    expect(
      (navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('debe bloquear una talla US de una URL anterior sin convertirla automáticamente', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=BL&talla=8');
    expect(
      (navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(navegador.routeNativeElement!.querySelector('.error')).not.toBeNull();
    expect(navegador.routeNativeElement!.querySelector('.cabecera-tallas')!.textContent).toContain(
      'EU',
    );
  });
  it('debe mostrar el SKU y el precio común al seleccionar una variante disponible', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=BL&talla=40');
    expect(
      (navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(navegador.routeNativeElement!.querySelector('.sku')!.textContent).toContain(
      'AD-SAMBAOG-BL-40',
    );
    const precio = navegador.routeNativeElement!.querySelector(
      '.informacion app-precio-producto',
    )!.textContent;
    await navegador.navigateByUrl('/producto/samba?color=NG&talla=40');
    expect(navegador.routeNativeElement!.querySelector('.sku')!.textContent).toContain(
      'AD-SAMBAOG-NG-40',
    );
    expect(
      navegador.routeNativeElement!.querySelector('.informacion app-precio-producto')!.textContent,
    ).toBe(precio);
    expect(
      navegador.routeNativeElement!.querySelector('.principal')!.getAttribute('src'),
    ).toContain('samba_b.png');
  });
  it('debe borrar la talla y reiniciar la cantidad al cambiar el color', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=BL&talla=40');
    (
      navegador.routeNativeElement!.querySelector(
        'button[aria-label="Aumentar cantidad"]',
      ) as HTMLButtonElement
    ).click();
    await navegador.fixture.whenStable();
    expect(
      navegador.routeNativeElement!.querySelector('app-control-cantidad span')!.textContent,
    ).toContain('2');
    (
      navegador.routeNativeElement!.querySelector(
        'button[aria-label="Color Negro"]',
      ) as HTMLButtonElement
    ).click();
    await navegador.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/producto/samba?color=NG');
    expect(
      (navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('debe agregar la variante seleccionada y avisar al alcanzar el stock acumulado', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=NG&talla=40');
    const boton = navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement;
    vi.useFakeTimers();
    boton.click();
    navegador.fixture.detectChanges();
    const carrito = TestBed.inject(Carrito);
    expect(carrito.lineas()[0].sku).toBe('AD-SAMBAOG-NG-40');
    expect(carrito.unidades()).toBe(1);
    expect(boton.textContent).toContain('Agregando');
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.disabled).toBe(true);
    boton.click();
    expect(carrito.unidades()).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    navegador.fixture.detectChanges();
    expect(boton.textContent).toContain('Añadido');
    expect(boton.querySelector('app-icono[nombre="verificar"]')).not.toBeNull();
    expect(boton.getAttribute('aria-busy')).toBe('false');
    expect(navegador.routeNativeElement!.querySelector('.respuesta-carrito a')).toBeNull();
    expect(navegador.routeNativeElement!.querySelector('.respuesta-carrito.visible')).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    navegador.fixture.detectChanges();
    expect(boton.textContent).toContain('Agregar al carrito');
    expect(boton.disabled).toBe(false);
    carrito.cambiarCantidad('AD-SAMBAOG-NG-40', 5);
    boton.click();
    navegador.fixture.detectChanges();
    expect(carrito.unidades()).toBe(5);
    expect(navegador.routeNativeElement!.querySelector('.respuesta-carrito.error')).not.toBeNull();
    expect(boton.textContent).not.toContain('Añadido');
  });

  it('debe cancelar la confirmación anterior al cambiar la cantidad seleccionada', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=NG&talla=40');
    vi.useFakeTimers();
    const boton = navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement;
    boton.click();
    navegador.fixture.detectChanges();
    (
      navegador.routeNativeElement!.querySelector(
        'button[aria-label="Aumentar cantidad"]',
      ) as HTMLButtonElement
    ).click();
    navegador.fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(2200);
    navegador.fixture.detectChanges();
    expect(boton.textContent).toContain('Agregar al carrito');
    expect(TestBed.inject(Carrito).unidades()).toBe(1);
    expect(boton.disabled).toBe(false);
  });

  it('debe cancelar los temporizadores al abandonar la vista sin duplicar el producto agregado', async () => {
    const navegador = await RouterTestingHarness.create('/producto/samba?color=NG&talla=40');
    const carrito = TestBed.inject(Carrito);
    vi.useFakeTimers();
    (navegador.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).click();
    navegador.fixture.destroy();
    await vi.advanceTimersByTimeAsync(2500);
    expect(carrito.unidades()).toBe(1);
  });
});

describe('Fichas por color y enlaces anteriores', () => {
  beforeEach(() => {
    const base = PRODUCTOS_CATALOGO_PRUEBA.find((p) => p.identificador === 'samba')!;
    const colores = base.colores;
    const productos: Producto[] = ['BL', 'NG'].map((c) => ({
      ...base,
      identificador: c === 'BL' ? 'samba' : 'samba-negro',
      nombre: base.nombre + (c === 'BL' ? ' Blanco' : ' Negro'),
      colores: colores.filter((x) => x.codigo === c),
      variantes: base.variantes.filter((v) => v.codigoColor === c),
      imagenes: [c === 'BL' ? '/imagenes/productos/samba.png' : '/imagenes/productos/samba_b.png'],
      otrosColores: [
        {
          slug: c === 'BL' ? 'samba-negro' : 'samba',
          codigo: c === 'BL' ? 'NG' : 'BL',
          nombre: c === 'BL' ? 'Negro' : 'Blanco',
          hexadecimal: c === 'BL' ? '#000000' : '#FFFFFF',
        },
      ],
    }));
    const fuente: FuenteCatalogo = {
      productos,
      marcas: [],
      consultar: () => productos,
      obtener: (id) => productos.find((p) => p.identificador === id),
      estaDisponible: (v) => v.habilitada && v.existencias > v.cantidadReservada,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'producto/:identificador', component: DetalleProducto }]),
        { provide: FUENTE_CATALOGO, useValue: fuente },
        { provide: ALMACENAMIENTO_FAVORITOS, useValue: null },
        { provide: ALMACENAMIENTO_CARRITO, useValue: null },
      ],
    });
  });
  it('resuelve samba?color=NG sin perder la talla o mostrar el SKU del Blanco', async () => {
    const h = await RouterTestingHarness.create('/producto/samba?color=NG&talla=40');
    await h.fixture.whenStable();
    h.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/producto/samba-negro?talla=40');
    expect(h.routeNativeElement!.querySelector('h1')!.textContent).toContain('Negro');
    expect(h.routeNativeElement!.querySelector('.sku')!.textContent).toContain('AD-SAMBAOG-NG-40');
  });
  it('el enlace a otro color navega a su ficha conservando una talla seleccionada', async () => {
    const h = await RouterTestingHarness.create('/producto/samba?talla=40');
    const a = h.routeNativeElement!.querySelector('a[aria-label="Ver Negro"]') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toContain('/producto/samba-negro?talla=40');
    a.click();
    await h.fixture.whenStable();
    h.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/producto/samba-negro?talla=40');
    expect((h.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
  it('un color desconocido sigue bloqueando la compra sin sustituirlo silenciosamente', async () => {
    const h = await RouterTestingHarness.create('/producto/samba?color=AZ&talla=40');
    await h.fixture.whenStable();
    expect((h.routeNativeElement!.querySelector('.agregar') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(TestBed.inject(Router).url).toContain('color=AZ');
  });
});

describe('Cambio de color con respuesta pendiente', () => {
  let productos: Producto[];
  let solicitudes: Map<string, Subject<Producto | undefined>>;
  beforeEach(() => {
    const base = PRODUCTOS_CATALOGO_PRUEBA.find((p) => p.identificador === 'samba')!;
    productos = ['BL', 'NG'].map((codigo) => ({
      ...base,
      identificador: codigo === 'BL' ? 'samba' : 'samba-negro',
      nombre: codigo === 'BL' ? 'Samba Blanco' : 'Samba Negro',
      colores: base.colores.filter((c) => c.codigo === codigo),
      variantes: base.variantes.filter((v) => v.codigoColor === codigo),
      otrosColores: [
        {
          slug: codigo === 'BL' ? 'samba-negro' : 'samba',
          codigo: codigo === 'BL' ? 'NG' : 'BL',
          nombre: codigo === 'BL' ? 'Negro' : 'Blanco',
          hexadecimal: '#000000',
        },
      ],
    }));
    solicitudes = new Map();
    const fuente: FuenteCatalogo = {
      productos,
      marcas: [],
      consultar: () => productos,
      obtener: (slug) => productos.find((p) => p.identificador === slug),
      obtenerProducto: (slug) => {
        const pendiente = new Subject<Producto | undefined>();
        solicitudes.set(slug, pendiente);
        return pendiente.asObservable();
      },
      estaDisponible: (v) => v.habilitada && v.existencias > v.cantidadReservada,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'producto/:identificador', component: DetalleProducto }]),
        { provide: FUENTE_CATALOGO, useValue: fuente },
        { provide: ALMACENAMIENTO_FAVORITOS, useValue: null },
        { provide: ALMACENAMIENTO_CARRITO, useValue: null },
      ],
    });
  });
  async function montar() {
    const h = await RouterTestingHarness.create('/producto/samba?talla=40');
    solicitudes.get('samba')!.next(productos[0]);
    await h.fixture.whenStable();
    h.detectChanges();
    return h;
  }
  async function negro(h: RouterTestingHarness) {
    h.routeNativeElement!.querySelector<HTMLAnchorElement>('a[aria-label="Ver Negro"]')!.click();
    await h.fixture.whenStable();
    h.detectChanges();
  }
  it('mantiene la ficha y la imagen durante la consulta y bloquea compras del color anterior', async () => {
    const h = await montar(),
      imagen = h.routeNativeElement!.querySelector('img.principal');
    await negro(h);
    expect(h.routeNativeElement!.querySelector('img.principal')).toBe(imagen);
    expect(h.routeNativeElement!.querySelector('h1')!.textContent).toBe('Samba Blanco');
    expect(h.routeNativeElement!.textContent).not.toContain('Cargando producto');
    expect(h.routeNativeElement!.querySelector('.ficha-esqueleto')).toBeNull();
    expect(h.routeNativeElement!.querySelector<HTMLButtonElement>('.agregar')!.disabled).toBe(true);
    (h.routeDebugElement!.componentInstance as DetalleProducto)['agregarAlCarrito']();
    expect(TestBed.inject(Carrito).unidades()).toBe(0);
    solicitudes.get('samba-negro')!.next(productos[1]);
    await h.fixture.whenStable();
    h.detectChanges();
    expect(h.routeNativeElement!.querySelector('h1')!.textContent).toBe('Samba Negro');
    expect(h.routeNativeElement!.querySelector<HTMLButtonElement>('.agregar')!.disabled).toBe(
      false,
    );
    expect(h.routeNativeElement!.querySelector('.sku')!.textContent).toContain('NG-40');
  });
  it('mantiene la ficha ante un fallo y permite reintentar sin una pantalla de carga', async () => {
    const h = await montar();
    await negro(h);
    solicitudes.get('samba-negro')!.error(Error('sin conexión'));
    await h.fixture.whenStable();
    h.detectChanges();
    expect(h.routeNativeElement!.querySelector('h1')!.textContent).toBe('Samba Blanco');
    expect(h.routeNativeElement!.querySelector('.error-color')).not.toBeNull();
    expect(h.routeNativeElement!.querySelector<HTMLButtonElement>('.agregar')!.disabled).toBe(true);
    h.routeNativeElement!.querySelector<HTMLButtonElement>('.error-color button')!.click();
    await h.fixture.whenStable();
    solicitudes.get('samba-negro')!.next(productos[1]);
    await h.fixture.whenStable();
    h.detectChanges();
    expect(h.routeNativeElement!.querySelector('.error-color')).toBeNull();
    expect(h.routeNativeElement!.querySelector('h1')!.textContent).toBe('Samba Negro');
  });
  it('descarta una respuesta antigua si se vuelve al color inicial antes de terminar', async () => {
    const h = await montar();
    await negro(h);
    const anterior = solicitudes.get('samba-negro')!;
    h.routeNativeElement!.querySelector<HTMLButtonElement>(
      'button[aria-label="Color Blanco"]',
    )!.click();
    await h.fixture.whenStable();
    anterior.next(productos[1]);
    await h.fixture.whenStable();
    h.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/producto/samba?talla=40');
    expect(h.routeNativeElement!.querySelector('h1')!.textContent).toBe('Samba Blanco');
    solicitudes.get('samba')!.next(productos[0]);
    await h.fixture.whenStable();
    h.detectChanges();
    expect(h.routeNativeElement!.querySelector<HTMLButtonElement>('.agregar')!.disabled).toBe(
      false,
    );
  });
  it('retira la ficha anterior cuando el color solicitado ya no está publicado', async () => {
    const h = await montar();
    await negro(h);
    solicitudes.get('samba-negro')!.next(undefined);
    await h.fixture.whenStable();
    h.detectChanges();
    expect(h.routeNativeElement!.querySelector('h1')!.textContent).toBe('Producto no encontrado');
    expect(h.routeNativeElement!.querySelector('.agregar')).toBeNull();
  });
  it('no muestra la ficha anterior al navegar a un producto ajeno al modelo', async () => {
    const h = await montar();
    await h.navigateByUrl('/producto/otro-producto');
    h.detectChanges();
    expect(h.routeNativeElement!.querySelector('img.principal')).toBeNull();
    expect(h.routeNativeElement!.querySelector('.ficha-esqueleto')).not.toBeNull();
    expect(h.routeNativeElement!.textContent).not.toContain('Samba Blanco');
  });
});
