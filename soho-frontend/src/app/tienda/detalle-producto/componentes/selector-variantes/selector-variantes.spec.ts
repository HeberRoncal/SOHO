import { proveerCatalogoPrueba } from '../../../catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { SelectorVariantes } from './selector-variantes';
import { PRODUCTOS_CATALOGO_PRUEBA } from '../../../catalogo/pruebas/productos.fixtures';
// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Selector de variantes', () => {
  it('debe deshabilitar tallas agotadas y emitir únicamente una talla disponible', async () => {
    await TestBed.configureTestingModule({ imports: [SelectorVariantes] }).compileComponents();
    const escenario = TestBed.createComponent(SelectorVariantes);
    escenario.componentRef.setInput(
      'producto',
      PRODUCTOS_CATALOGO_PRUEBA.find((producto) => producto.identificador === 'samba'),
    );
    escenario.componentRef.setInput('codigoColor', 'BL');
    await escenario.whenStable();
    const cambios: string[] = [];
    escenario.componentInstance.tallaCambiada.subscribe((talla) => cambios.push(talla));
    const agotada = escenario.nativeElement.querySelector('input[value="38"]');
    const disponible = escenario.nativeElement.querySelector('input[value="40"]');
    expect(agotada.disabled).toBe(true);
    agotada.click();
    expect(cambios).toEqual([]);
    disponible.click();
    expect(cambios).toEqual(['40']);
  });
});
