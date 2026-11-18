import { TestBed } from '@angular/core/testing';
import { ControlCantidad } from './control-cantidad';
describe('Control de cantidad', () => {
  it('debe impedir cantidades menores a uno o mayores al inventario disponible', async () => {
    await TestBed.configureTestingModule({ imports: [ControlCantidad] }).compileComponents();
    const escenario = TestBed.createComponent(ControlCantidad);
    escenario.componentRef.setInput('maximo', 2);
    await escenario.whenStable();
    const cambios: number[] = [];
    escenario.componentInstance.valorCambiado.subscribe((valor) => cambios.push(valor));
    const botones = escenario.nativeElement.querySelectorAll('button');
    expect(botones[0].disabled).toBe(true);
    botones[0].click();
    expect(cambios).toEqual([]);
    botones[1].click();
    expect(cambios).toEqual([2]);
    escenario.componentRef.setInput('valor', 2);
    await escenario.whenStable();
    expect(botones[1].disabled).toBe(true);
    botones[1].click();
    expect(cambios).toEqual([2]);
  });
});
