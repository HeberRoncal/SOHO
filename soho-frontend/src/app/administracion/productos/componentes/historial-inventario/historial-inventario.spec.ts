import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistorialInventario } from './historial-inventario';
import { signal } from '@angular/core';
import { ProductosAdministracion } from '../../servicios/productos-administracion';

describe('HistorialInventario', () => {
  let component: HistorialInventario;
  let fixture: ComponentFixture<HistorialInventario>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistorialInventario],
      providers: [
        {
          provide: ProductosAdministracion,
          useValue: {
            movimientos: signal([]),
            paginaMovimientos: signal({ pagina: 1, limite: 20, total: 0, paginas: 0 }),
            estadoMovimientos: signal('lista'),
            mensajeMovimientos: signal(''),
            cargarMovimientos: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistorialInventario);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('Paginación remota del historial', () => {
  it('permite regresar si el total baja a una página estando en la segunda', async () => {
    const paginacion = signal({ pagina: 1, limite: 20, total: 21, paginas: 2 });
    const fuente = {
      remoto: true,
      soloLectura: true,
      movimientos: signal([]),
      paginaMovimientos: paginacion,
      estadoMovimientos: signal('lista'),
      mensajeMovimientos: signal(''),
      cargarMovimientos: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [HistorialInventario],
      providers: [{ provide: ProductosAdministracion, useValue: fuente }],
    }).compileComponents();
    const fixture = TestBed.createComponent(HistorialInventario);
    await fixture.whenStable();
    const siguiente = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: unknown) => (b as HTMLButtonElement).textContent?.trim() === 'Siguiente',
    ) as HTMLButtonElement;
    siguiente.click();
    await fixture.whenStable();
    paginacion.set({ pagina: 2, limite: 20, total: 1, paginas: 1 });
    await fixture.whenStable();
    const primero = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: unknown) => (b as HTMLButtonElement).textContent?.trim() === 'Primera página',
    ) as HTMLButtonElement;
    expect(primero).toBeTruthy();
    primero.click();
    await fixture.whenStable();
    expect(fuente.cargarMovimientos).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagina: '1' }),
    );
  });
});
