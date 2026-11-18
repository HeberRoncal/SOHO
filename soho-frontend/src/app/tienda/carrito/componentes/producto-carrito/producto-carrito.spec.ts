import { proveerCatalogoPrueba } from '../../../catalogo/pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductoCarrito } from './producto-carrito';
import { ALMACENAMIENTO_CARRITO, CarritoLocal } from '../../servicios/carrito-local';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Producto del carrito', () => {
  let vista: ComponentFixture<ProductoCarrito>;
  let carrito: CarritoLocal;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductoCarrito],
      providers: [provideRouter([]), { provide: ALMACENAMIENTO_CARRITO, useValue: null }],
    }).compileComponents();
    carrito = TestBed.inject(CarritoLocal);
    carrito.agregar('AD-SAMBAOG-NG-40', 1);
    vista = TestBed.createComponent(ProductoCarrito);
    vista.componentRef.setInput('linea', carrito.lineas()[0]);
    await vista.whenStable();
  });
  it('debe enlazar al color y talla exactos y emitir la eliminación', () => {
    expect(vista.nativeElement.querySelector('.variante').textContent).toContain('Talla EU 40');
    expect(vista.nativeElement.querySelector('.imagen').getAttribute('href')).toContain(
      'color=NG&talla=40',
    );
    expect(vista.nativeElement.querySelector('img').getAttribute('src')).toContain('samba_b.png');
    let eliminados = 0;
    vista.componentInstance.eliminado.subscribe(() => eliminados++);
    vista.nativeElement.querySelector('.eliminar').click();
    expect(eliminados).toBe(1);
    expect(carrito.unidades()).toBe(1);
  });
  it('debe permitir ajustar una cantidad guardada que supera el stock actual', async () => {
    vista.componentRef.setInput('linea', {
      ...carrito.lineas()[0],
      cantidad: 8,
      incidencia: 'Solo hay 5 unidades disponibles.',
    });
    await vista.whenStable();
    let cantidad = 0;
    vista.componentInstance.cantidadCambiada.subscribe((valor) => (cantidad = valor));
    expect(vista.nativeElement.querySelector('app-control-cantidad')).toBeNull();
    vista.nativeElement.querySelector('.ajustar').click();
    expect(cantidad).toBe(5);
  });

  it('debe solicitar favoritos sin eliminar ni alterar la cantidad del producto', async () => {
    let identificador = '';
    let eliminados = 0;
    vista.componentInstance.favoritoSolicitado.subscribe((valor) => (identificador = valor));
    vista.componentInstance.eliminado.subscribe(() => eliminados++);
    vista.nativeElement.querySelector('.favorito').click();
    expect(identificador).toBe('samba');
    expect(eliminados).toBe(0);
    expect(carrito.unidades()).toBe(1);
    vista.componentRef.setInput('favorito', true);
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.favorito').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(vista.nativeElement.querySelector('.favorito').getAttribute('aria-label')).toContain(
      'Quitar de favoritos',
    );
  });

  it('debe mostrar el precio anterior y el subtotal de oferta para toda la cantidad', async () => {
    carrito.agregar('PM-SUEDE-NG-40', 2);
    vista.componentRef.setInput(
      'linea',
      carrito.lineas().find((linea) => linea.sku === 'PM-SUEDE-NG-40'),
    );
    await vista.whenStable();
    expect(vista.nativeElement.querySelector('.precio-total s').textContent).toContain('699.80');
    expect(vista.nativeElement.querySelector('.precio-total .precio > span').textContent).toContain(
      '559.80',
    );
    expect(vista.nativeElement.querySelector('.importe .precio-unitario').textContent).toContain(
      '279.90',
    );
    expect(vista.nativeElement.querySelector('select')).toBeNull();
  });
});
