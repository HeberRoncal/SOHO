import { proveerCatalogoPrueba } from '../catalogo/pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Favoritos } from './favoritos';
import {
  ALMACENAMIENTO_FAVORITOS,
  PresentacionTienda,
} from '../../estructuras/servicios/presentacion-tienda';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Favoritos', () => {
  let escenario: ComponentFixture<Favoritos>;
  let presentacion: PresentacionTienda;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Favoritos],
      providers: [provideRouter([]), { provide: ALMACENAMIENTO_FAVORITOS, useValue: null }],
    }).compileComponents();

    presentacion = TestBed.inject(PresentacionTienda);
    escenario = TestBed.createComponent(Favoritos);
    await escenario.whenStable();
  });

  it('debe mostrar el estado vacío cuando no hay productos guardados', () => {
    expect(escenario.nativeElement.querySelector('.mensaje-vacio')?.textContent).toContain(
      'Encuentra tu próximo par',
    );
    expect(escenario.nativeElement.querySelectorAll('app-tarjeta-producto')).toHaveLength(0);
  });

  it('debe mostrar únicamente los productos guardados en favoritos', async () => {
    presentacion.alternarFavorito('samba');
    await escenario.whenStable();
    const tarjetas = escenario.nativeElement.querySelectorAll('app-tarjeta-producto');
    expect(tarjetas).toHaveLength(1);
    expect(tarjetas[0].textContent).toContain('Samba OG');
    expect(escenario.nativeElement.querySelector('.mensaje-vacio')).toBeNull();
  });

  it('debe volver al estado vacío al quitar el último favorito desde su tarjeta', async () => {
    presentacion.alternarFavorito('samba');
    await escenario.whenStable();
    escenario.nativeElement.querySelector('.favorito').click();
    await escenario.whenStable();
    expect(presentacion.favoritos()).toEqual([]);
    expect(escenario.nativeElement.querySelector('.mensaje-vacio')).toBeTruthy();
  });

  it('debe enlazar al catálogo desde el estado vacío', () => {
    expect(escenario.nativeElement.querySelector('.mensaje-vacio a').getAttribute('href')).toBe(
      '/zapatillas',
    );
  });
});
