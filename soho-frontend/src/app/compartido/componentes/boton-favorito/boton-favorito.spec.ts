import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BotonFavorito } from './boton-favorito';

describe('BotonFavorito', () => {
  let escenario: ComponentFixture<BotonFavorito>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BotonFavorito],
    }).compileComponents();

    escenario = TestBed.createComponent(BotonFavorito);
    escenario.componentRef.setInput('descripcion', 'Nike Air Force 1');
    await escenario.whenStable();
  });

  it('debe mostrar el corazón sin relleno y una etiqueta accesible para agregar', () => {
    const boton = escenario.nativeElement.querySelector('button');
    expect(boton.type).toBe('button');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(boton.getAttribute('aria-label')).toBe('Agregar a favoritos: Nike Air Force 1');
    expect(boton.querySelector('svg').getAttribute('fill')).toBe('none');
  });

  it('debe solicitar el cambio y reflejar el estado compartido al guardar o quitar', async () => {
    const boton = escenario.nativeElement.querySelector('button');
    let solicitudes = 0;
    escenario.componentInstance.alternado.subscribe(() => solicitudes++);
    boton.click();
    expect(solicitudes).toBe(1);
    escenario.componentRef.setInput('seleccionado', true);
    await escenario.whenStable();
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(boton.getAttribute('aria-label')).toBe('Quitar de favoritos: Nike Air Force 1');
    expect(boton.querySelector('svg').getAttribute('fill')).toBe('currentColor');
    boton.click();
    expect(solicitudes).toBe(2);
    escenario.componentRef.setInput('seleccionado', false);
    await escenario.whenStable();
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(boton.querySelector('svg').getAttribute('fill')).toBe('none');
  });
});
