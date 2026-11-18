import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FiltroPrecio } from './filtro-precio';

describe('FiltroPrecio', () => {
  let componente: FiltroPrecio;
  let vista: ComponentFixture<FiltroPrecio>;
  const entrada = (selector: string): HTMLInputElement =>
    vista.nativeElement.querySelector(selector);
  const cambiar = async (selector: string, valor: string, evento = 'change') => {
    const elemento = entrada(selector);
    elemento.value = valor;
    elemento.dispatchEvent(new Event(evento));
    await vista.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltroPrecio],
    }).compileComponents();

    vista = TestBed.createComponent(FiltroPrecio);
    componente = vista.componentInstance;
    vista.componentRef.setInput('limiteInferior', 279);
    vista.componentRef.setInput('limiteSuperior', 1050);
    await vista.whenStable();
  });

  it('debe sincronizar los campos durante el arrastre y emitir solo al confirmar', async () => {
    const cambios: (number | undefined)[] = [];
    componente.minimoCambiado.subscribe((valor) => cambios.push(valor));
    await cambiar('.minimo', '350.25', 'input');
    expect(entrada('#precio-desde').value).toBe('350.25');
    expect(entrada('.minimo').getAttribute('aria-valuetext')).toContain('350.25');
    expect(cambios).toEqual([]);
    entrada('.minimo').dispatchEvent(new Event('change'));
    expect(cambios).toEqual([350.25]);
  });

  it('debe sincronizar importes escritos y restablecer el rango cuando cambian sus entradas', async () => {
    const cambios: (number | undefined)[] = [];
    componente.maximoCambiado.subscribe((valor) => cambios.push(valor));
    await cambiar('#precio-hasta', '799.9');
    expect(entrada('.maximo').value).toBe('799.9');
    expect(cambios).toEqual([799.9]);
    vista.componentRef.setInput('maximo', 799.9);
    await vista.whenStable();
    vista.componentRef.setInput('maximo', undefined);
    await vista.whenStable();
    expect(entrada('.maximo').value).toBe('1050');
    expect(entrada('#precio-hasta').value).toBe('1050');
  });

  it('debe impedir que los controles arrastrados se crucen', async () => {
    vista.componentRef.setInput('minimo', 400);
    vista.componentRef.setInput('maximo', 600);
    await vista.whenStable();
    await cambiar('.minimo', '800', 'input');
    expect(entrada('.minimo').value).toBe('600');
    await cambiar('.maximo', '300', 'input');
    expect(entrada('.maximo').value).toBe('600');
  });

  it('debe conservar los límites explícitos de URL fuera del catálogo', async () => {
    vista.componentRef.setInput('minimo', 0);
    vista.componentRef.setInput('maximo', 2000);
    await vista.whenStable();
    expect(entrada('.minimo').min).toBe('0');
    expect(entrada('.maximo').max).toBe('2000');
    expect(entrada('#precio-desde').value).toBe('0');
    expect(entrada('#precio-hasta').value).toBe('2000');
  });

  it('debe quitar el límite al vaciar un campo', async () => {
    const cambios: (number | undefined)[] = [];
    componente.minimoCambiado.subscribe((valor) => cambios.push(valor));
    await cambiar('#precio-desde', '');
    expect(cambios).toEqual([undefined]);
    expect(entrada('#precio-desde').value).toBe('279');
  });

  it('debe deshabilitar el arrastre cuando todos los precios son iguales', async () => {
    vista.componentRef.setInput('limiteInferior', 500);
    vista.componentRef.setInput('limiteSuperior', 500);
    await vista.whenStable();
    expect(entrada('.minimo').disabled).toBe(true);
    expect(entrada('.maximo').disabled).toBe(true);
    expect(vista.nativeElement.querySelector('.tramo').style.left).toBe('0%');
  });
});
