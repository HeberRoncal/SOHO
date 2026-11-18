import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Icono } from './icono';

describe('Icono', () => {
  let componente: Icono;
  let escenario: ComponentFixture<Icono>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Icono],
    }).compileComponents();

    escenario = TestBed.createComponent(Icono);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });

  it('debe cambiar el icono de Lucide cuando cambia su nombre en español', async () => {
    escenario.componentRef.setInput('nombre', 'buscar');
    escenario.componentRef.setInput('tamano', 24);
    await escenario.whenStable();

    const svg = escenario.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.classList.contains('lucide-search')).toBe(true);
    expect(svg.querySelector('circle')).not.toBeNull();
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');

    escenario.componentRef.setInput('nombre', 'bolsa');
    await escenario.whenStable();
    expect(svg.classList.contains('lucide-shopping-bag')).toBe(true);
    expect(svg.classList.contains('lucide-search')).toBe(false);
  });

  it('debe alternar el relleno del corazón conservando el color heredado', async () => {
    escenario.componentRef.setInput('nombre', 'corazon');
    await escenario.whenStable();
    const svg = escenario.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.classList.contains('lucide-heart')).toBe(true);
    expect(svg.getAttribute('fill')).toBe('none');

    escenario.componentRef.setInput('relleno', true);
    await escenario.whenStable();
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('stroke')).toBe('currentColor');

    escenario.componentRef.setInput('relleno', false);
    await escenario.whenStable();
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it('debe mostrar la flecha de respaldo ante un nombre desconocido', async () => {
    escenario.componentRef.setInput('nombre', 'no-existe');
    await escenario.whenStable();
    expect(escenario.nativeElement.querySelector('svg.lucide-arrow-right')).not.toBeNull();
  });
});
