import { proveerCatalogoPrueba } from '../../catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { ALMACENAMIENTO_CARRITO, CarritoLocal } from './carrito-local';
import { CatalogoPrueba } from '../../catalogo/pruebas/catalogo.fixture';
import { PRODUCTOS_CATALOGO_PRUEBA } from '../../catalogo/pruebas/productos.fixtures';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Carrito local de invitado', () => {
  let guardado: string | null;
  beforeEach(() => {
    guardado = null;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ALMACENAMIENTO_CARRITO,
          useValue: {
            getItem: () => guardado,
            setItem: (_clave: string, valor: string) => (guardado = valor),
          },
        },
      ],
    });
  });

  it('debe agrupar el mismo SKU y sumar el subtotal en céntimos', () => {
    const carrito = TestBed.inject(CarritoLocal);
    expect(carrito.agregar('AD-SAMBAOG-BL-40', 1).correcto).toBe(true);
    expect(carrito.agregar('AD-SAMBAOG-BL-40', 2).correcto).toBe(true);
    expect(carrito.lineas()).toHaveLength(1);
    expect(carrito.unidades()).toBe(3);
    expect(carrito.subtotal()).toBe(1499.7);
    expect(carrito.puedeContinuar()).toBe(true);
    expect(JSON.parse(guardado!).articulos).toEqual([{ sku: 'AD-SAMBAOG-BL-40', cantidad: 3 }]);
    expect(guardado).not.toContain('precio');
  });

  it('debe separar colores y tallas diferentes del mismo modelo', () => {
    const carrito = TestBed.inject(CarritoLocal);
    carrito.agregar('AD-SAMBAOG-BL-40', 1);
    carrito.agregar('AD-SAMBAOG-NG-40', 1);
    carrito.agregar('AD-SAMBAOG-BL-41', 1);
    expect(carrito.lineas()).toHaveLength(3);
    expect(carrito.lineas().map((linea) => linea.color?.nombre)).toEqual([
      'Blanco',
      'Negro',
      'Blanco',
    ]);
  });

  it('debe usar el mismo inventario unisex al agregar desde Hombre y Mujer', () => {
    const catalogo = TestBed.inject(CatalogoPrueba);
    const hombre = catalogo.consultar({ genero: 'Hombre' }).find((p) => p.identificador === 'af1')!;
    const mujer = catalogo.consultar({ genero: 'Mujer' }).find((p) => p.identificador === 'af1')!;
    const carrito = TestBed.inject(CarritoLocal);
    carrito.agregar(hombre.variantes.find((v) => v.talla === '40')!.sku, 2);
    carrito.agregar(mujer.variantes.find((v) => v.talla === '40')!.sku, 2);
    expect(carrito.lineas()).toHaveLength(1);
    expect(carrito.unidades()).toBe(4);
    expect(carrito.agregar('NK-AF107-BL-40', 2).correcto).toBe(false);
    expect(carrito.unidades()).toBe(4);
  });

  it('debe rechazar SKU inexistentes, variantes agotadas y cantidades inválidas', () => {
    const carrito = TestBed.inject(CarritoLocal);
    expect(carrito.agregar('NO-EXISTE-40', 1).correcto).toBe(false);
    expect(carrito.agregar('AD-SAMBAOG-BL-38', 1).correcto).toBe(false);
    for (const cantidad of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(carrito.agregar('AD-SAMBAOG-BL-40', cantidad).correcto).toBe(false);
    }
    expect(carrito.lineas()).toEqual([]);
    expect(carrito.puedeContinuar()).toBe(false);
  });

  it('debe validar el límite acumulado y actualizar, eliminar y vaciar las líneas', () => {
    const carrito = TestBed.inject(CarritoLocal);
    carrito.agregar('AD-SAMBAOG-BL-40', 4);
    expect(carrito.agregar('AD-SAMBAOG-BL-40', 2).correcto).toBe(false);
    expect(carrito.cambiarCantidad('AD-SAMBAOG-BL-40', 6).correcto).toBe(false);
    expect(carrito.cambiarCantidad('NO-EXISTE', 1).correcto).toBe(false);
    expect(carrito.unidades()).toBe(4);
    carrito.cambiarCantidad('AD-SAMBAOG-BL-40', 1);
    expect(carrito.subtotal()).toBe(499.9);
    carrito.agregar('NK-AF107-BL-40', 1);
    carrito.eliminar('AD-SAMBAOG-BL-40');
    expect(carrito.unidades()).toBe(1);
    carrito.vaciar();
    expect(carrito.subtotal()).toBe(0);
    expect(carrito.puedeContinuar()).toBe(false);
    expect(JSON.parse(guardado!).articulos).toEqual([]);
  });

  it('debe recuperar la selección al recargar sin aceptar precios guardados', () => {
    guardado = JSON.stringify({
      version: 1,
      articulos: [{ sku: 'NK-AF107-BL-40', cantidad: 2, precio: 0 }],
    });
    const carrito = TestBed.inject(CarritoLocal);
    expect(carrito.subtotal()).toBe(1059.8);
    carrito.cambiarCantidad('NK-AF107-BL-40', 3);
    const recargado = TestBed.runInInjectionContext(() => new CarritoLocal());
    expect(recargado.unidades()).toBe(3);
    expect(recargado.subtotal()).toBe(1589.7);
  });

  it('debe conservar las líneas con incidencias para revisarlas y bloquear la continuación', () => {
    guardado = JSON.stringify({
      version: 1,
      articulos: [
        { sku: 'AD-SAMBAOG-BL-40', cantidad: 7 },
        { sku: 'AD-SAMBAOG-BL-38', cantidad: 1 },
        { sku: 'ANTIGUO-US-8', cantidad: 1 },
      ],
    });
    const carrito = TestBed.inject(CarritoLocal);
    expect(carrito.lineas()).toHaveLength(3);
    expect(carrito.lineas().every((linea) => !!linea.incidencia)).toBe(true);
    expect(carrito.puedeContinuar()).toBe(false);
    carrito.cambiarCantidad('AD-SAMBAOG-BL-40', 5);
    carrito.eliminar('AD-SAMBAOG-BL-38');
    carrito.eliminar('ANTIGUO-US-8');
    expect(carrito.puedeContinuar()).toBe(true);
    expect(carrito.unidades()).toBe(5);
  });

  it('debe descontar las reservas al validar la cantidad disponible', () => {
    const base = PRODUCTOS_CATALOGO_PRUEBA.find((p) => p.identificador === 'af1')!;
    const producto = {
      ...base,
      variantes: base.variantes.map((v) => ({ ...v, cantidadReservada: 4 })),
    };
    TestBed.overrideProvider(CatalogoPrueba, { useValue: { productos: [producto] } });
    const carrito = TestBed.inject(CarritoLocal);
    expect(carrito.agregar('NK-AF107-BL-40', 2).correcto).toBe(false);
    expect(carrito.agregar('NK-AF107-BL-40', 1).correcto).toBe(true);
    expect(carrito.lineas()[0].stockDisponible).toBe(1);
    expect(producto.variantes.find((v) => v.sku === 'NK-AF107-BL-40')!.existencias).toBe(5);
  });

  it('debe depurar entradas inválidas y agrupar duplicados al recuperar el carrito', () => {
    guardado = JSON.stringify({
      version: 1,
      articulos: [
        null,
        9,
        {},
        { sku: '', cantidad: 1 },
        { sku: 'NK-AF107-BL-40', cantidad: -1 },
        { sku: 'NK-AF107-BL-40', cantidad: '2' },
        { sku: 'NK-AF107-BL-40', cantidad: 1 },
        { sku: 'NK-AF107-BL-40', cantidad: 2 },
      ],
    });
    const carrito = TestBed.inject(CarritoLocal);
    expect(carrito.lineas()).toHaveLength(1);
    expect(carrito.unidades()).toBe(3);
  });

  for (const contenido of [
    'JSON dañado',
    '[]',
    '{"version":2,"articulos":[]}',
    '{"version":1,"articulos":{}}',
  ]) {
    it('debe iniciar vacío ante un formato guardado inválido: ' + contenido, () => {
      guardado = contenido;
      expect(TestBed.inject(CarritoLocal).lineas()).toEqual([]);
    });
  }

  it('debe permitir usar el carrito durante la visita cuando el guardado está bloqueado', () => {
    TestBed.overrideProvider(ALMACENAMIENTO_CARRITO, {
      useValue: {
        getItem: () => {
          throw new Error('Lectura bloqueada');
        },
        setItem: () => {
          throw new Error('Guardado bloqueado');
        },
      },
    });
    const carrito = TestBed.inject(CarritoLocal);
    expect(carrito.agregar('NK-AF107-BL-40', 1).correcto).toBe(true);
    expect(carrito.unidades()).toBe(1);
    expect(carrito.guardadoLocal()).toBe(false);
  });
});
