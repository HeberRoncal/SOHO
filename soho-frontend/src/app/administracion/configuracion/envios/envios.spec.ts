import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Envios } from './envios';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';

describe('Formulario persistido de Envíos', () => {
  it('muestra los campos inválidos y mueve el foco después de renderizar el error', async () => {
    TestBed.configureTestingModule({
      imports: [Envios],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const sesion = TestBed.inject(EstadoAutenticacion);
    sesion.aceptar({
      id: 'admin',
      nombres: 'Ana',
      apellidos: 'Prueba',
      correo: 'ana@soho.test',
      rol: 'ADMIN',
      correoVerificado: true,
    });
    const f = TestBed.createComponent(Envios),
      http = TestBed.inject(HttpTestingController);
    f.detectChanges();
    const codigos = [
      'la-esperanza',
      'trujillo',
      'el-porvenir',
      'florencia-de-mora',
      'victor-larco',
      'huanchaco',
      'moche',
    ];
    http.expectOne('/api/admin/cobertura').flush({
      version: 'a'.repeat(64),
      zonas: codigos.map((codigo, orden) => ({
        codigo,
        nombre: codigo,
        tarifa: orden === 0 ? '0.00' : null,
        plazo: null,
        habilitada: orden !== 6,
        orden,
        cotizable: orden === 0,
      })),
    });
    await f.whenStable();
    f.detectChanges();
    const host = f.nativeElement as HTMLElement,
      tarifa = host.querySelector<HTMLInputElement>('#tarifa-trujillo')!;
    expect(f.componentInstance.estado.editable('trujillo')).toBe(false);
    await f.whenStable();
    f.detectChanges();
    expect(tarifa.disabled).toBe(true);
    expect(host.textContent).not.toContain('Actualizar');
    host
      .querySelector<HTMLButtonElement>('[aria-label="Deshabilitar entrega a trujillo"]')!
      .click();
    const req = http.expectOne('/api/admin/cobertura');
    req.flush({
      version: 'b'.repeat(64),
      zonas: codigos.map((codigo, orden) => ({
        codigo,
        nombre: codigo,
        tarifa: orden === 0 ? '0.00' : null,
        plazo: null,
        habilitada: orden !== 6 && orden !== 1,
        orden,
        cotizable: orden === 0,
      })),
    });
    await f.whenStable();
    f.detectChanges();
    expect(tarifa.disabled).toBe(false);
    tarifa.value = '-1';
    tarifa.dispatchEvent(new Event('input', { bubbles: true }));
    await f.whenStable();
    f.detectChanges();
    host.querySelector<HTMLButtonElement>('.config-savebar button.rojo')!.click();
    await f.whenStable();
    f.detectChanges();
    expect(tarifa.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(tarifa);
    http.expectNone('/api/admin/cobertura');
    http.verify();
  });
});
