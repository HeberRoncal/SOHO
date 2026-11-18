import { TestBed } from '@angular/core/testing';
import { PaginacionClientes } from './paginacion-clientes';
describe('Paginación accesible de Clientes', () => {
  it('permite volver a la primera página cuando el enlace ya quedó fuera de rango', async () => {
    const f = TestBed.createComponent(PaginacionClientes);
    f.componentRef.setInput('pagina', { pagina: 99, limite: 20, total: 1, paginas: 1 });
    f.componentRef.setInput('etiqueta', 'historial');
    await f.whenStable();
    const emitir = vi.fn();
    f.componentInstance.cambiar.subscribe(emitir);
    expect(f.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe(
      'Paginación de historial',
    );
    f.nativeElement.querySelector('button').click();
    expect(emitir).toHaveBeenCalledWith(1);
  });
  it('no permite avanzar más allá de la última página y conserva el contexto', async () => {
    const f = TestBed.createComponent(PaginacionClientes);
    f.componentRef.setInput('pagina', { pagina: 2, limite: 20, total: 21, paginas: 2 });
    await f.whenStable();
    const b = f.nativeElement.querySelectorAll('button');
    expect(b[0].disabled).toBe(false);
    expect(b[1].disabled).toBe(true);
    const emitir = vi.fn();
    f.componentInstance.cambiar.subscribe(emitir);
    b[0].click();
    expect(emitir).toHaveBeenCalledWith(1);
  });
  it('omite controles innecesarios para una única página o listado vacío', async () => {
    const f = TestBed.createComponent(PaginacionClientes);
    await f.whenStable();
    expect(f.nativeElement.querySelector('nav')).toBeNull();
  });
});
