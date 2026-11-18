import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from '../../../app';
import { EstadoAutenticacion } from '../servicios/estado-autenticacion';

@Component({ template: 'Área privada' })
class PrivadaPrueba {}

describe('Comprobación lenta de sesión', () => {
  it('mantiene el estado de carga durante los eventos intermedios del router', async () => {
    let terminar!: (valor: boolean) => void;
    const pendiente = new Promise<boolean>((resolve) => {
      terminar = resolve;
    });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'admin/cargando', component: PrivadaPrueba, canActivate: [() => pendiente] },
        ]),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    TestBed.inject(EstadoAutenticacion).estado.set('cargando');
    const navegacion = TestBed.inject(Router).navigateByUrl('/admin/cargando');
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Comprobando tu sesión');
    expect(fixture.nativeElement.textContent).not.toContain('Área privada');
    terminar(true);
    await navegacion;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Comprobando tu sesión');
    expect(fixture.nativeElement.textContent).toContain('Área privada');
  });
});
