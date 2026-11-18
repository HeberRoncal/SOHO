import { proveerCatalogoPrueba } from '../../../tienda/catalogo/pruebas/catalogo.fixture';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CabeceraTienda } from './cabecera-tienda';
import { PresentacionTienda } from '../../servicios/presentacion-tienda';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('CabeceraTienda', () => {
  let componente: CabeceraTienda;
  let escenario: ComponentFixture<CabeceraTienda>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CabeceraTienda],
      providers: [provideRouter([])],
    }).compileComponents();

    escenario = TestBed.createComponent(CabeceraTienda);
    componente = escenario.componentInstance;
    document.body.appendChild(escenario.nativeElement);
    await escenario.whenStable();
  });

  afterEach(() => escenario.nativeElement.remove());

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });

  it.each(['', '   ', ' \t '])(
    'debe conservar la página y enfocar el buscador al enviar %j',
    async (valor) => {
      const navegar = vi.spyOn(TestBed.inject(PresentacionTienda), 'irAlCatalogo');
      const campo = escenario.nativeElement.querySelector(
        'input[type="search"]',
      ) as HTMLInputElement;
      campo.value = valor;
      escenario.nativeElement
        .querySelector('form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await escenario.whenStable();
      expect(navegar).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(campo);
    },
  );

  it('debe buscar un término válido quitando los espacios de los extremos', async () => {
    const navegar = vi
      .spyOn(TestBed.inject(PresentacionTienda), 'irAlCatalogo')
      .mockImplementation(() => {});
    const campo = escenario.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    campo.value = '  Air Force  ';
    escenario.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await escenario.whenStable();
    expect(navegar).toHaveBeenCalledExactlyOnceWith({ busqueda: 'Air Force' });
  });
});
