import { proveerCatalogoPrueba } from '../../pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelFiltros } from './panel-filtros';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('PanelFiltros', () => {
  let componente: PanelFiltros;
  let vista: ComponentFixture<PanelFiltros>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelFiltros],
    }).compileComponents();

    vista = TestBed.createComponent(PanelFiltros);
    componente = vista.componentInstance;
    await vista.whenStable();
  });

  it('debe separar las acciones fijas del contenido desplazable', () => {
    const elemento: HTMLElement = vista.nativeElement;
    expect(elemento.querySelector('dialog > header .borrar-todo')).toBeTruthy();
    expect(elemento.querySelector('dialog > footer .mostrar-productos')).toBeTruthy();
    expect(elemento.querySelector('.contenido .borrar-todo')).toBeNull();
    expect(elemento.querySelector('.contenido .mostrar-productos')).toBeNull();
    expect(elemento.querySelector('details.ordenamiento')!.hasAttribute('open')).toBe(true);
    expect(elemento.querySelectorAll('app-filtros-catalogo details[open]')).toHaveLength(0);
  });

  it('debe emitir el orden, limpiar y cerrar sin perder el control desde el catálogo', async () => {
    const ordenes: string[] = [];
    let borrados = 0;
    let cierres = 0;
    componente.ordenCambiado.subscribe((orden) => ordenes.push(orden));
    componente.borrarSolicitado.subscribe(() => borrados++);
    componente.cerrado.subscribe(() => cierres++);
    const elemento: HTMLElement = vista.nativeElement;
    const borrar = elemento.querySelector<HTMLButtonElement>('.borrar-todo')!;
    expect(borrar.disabled).toBe(true);
    elemento.querySelector<HTMLInputElement>('input[value="precio-descendente"]')!.click();
    expect(ordenes).toEqual(['precio-descendente']);
    vista.componentRef.setInput('orden', 'precio-descendente');
    await vista.whenStable();
    expect(borrar.disabled).toBe(false);
    borrar.click();
    vista.componentRef.setInput('orden', 'relevancia');
    await vista.whenStable();
    expect(borrar.disabled).toBe(true);
    const relevancia = elemento.querySelector<HTMLInputElement>('input[value="relevancia"]')!;
    expect(relevancia.disabled).toBe(false);
    expect(relevancia.checked).toBe(true);
    expect(elemento.querySelector('.opciones-orden .seleccionada')!.textContent).toContain(
      'Relevancia',
    );
    elemento.querySelector<HTMLButtonElement>('.mostrar-productos')!.click();
    expect(borrados).toBe(1);
    expect(cierres).toBe(1);
  });

  it('debe mostrar el total y permitir quitar cada filtro aplicado', async () => {
    let quitados = 0;
    vista.componentRef.setInput('cantidad', 2);
    vista.componentRef.setInput('etiquetas', [{ texto: 'Nike', quitar: () => quitados++ }]);
    await vista.whenStable();
    const elemento: HTMLElement = vista.nativeElement;
    expect(elemento.querySelector('[role="status"]')!.textContent).toContain(
      '2 productos encontrados',
    );
    elemento.querySelector<HTMLButtonElement>('.etiquetas button')!.click();
    expect(quitados).toBe(1);
  });
});
