import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanDeactivateFn, RouterStateSnapshot } from '@angular/router';
import { cambiosProductoGuard, FormularioConCambios } from './cambios-producto-guard';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';

describe('cambiosProductoGuard', () => {
  const executeGuard: CanDeactivateFn<FormularioConCambios> = (...guardParameters) =>
    TestBed.runInInjectionContext(() => cambiosProductoGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
  it('la sesión vencida no puede quedar retenida por la confirmación de cambios', () => {
    const puedeSalir = vi.fn(() => false);
    expect(
      executeGuard(
        { puedeSalir },
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    ).toBe(true);
    expect(puedeSalir).not.toHaveBeenCalled();
  });
  it('conserva la confirmación de cambios mientras el administrador tiene acceso', () => {
    TestBed.inject(EstadoAutenticacion).aceptar({
      id: 'prueba',
      nombres: 'Ana',
      apellidos: 'Pérez',
      correo: 'ana@prueba.test',
      rol: 'ADMIN',
      correoVerificado: false,
    });
    const puedeSalir = vi.fn(() => false);
    expect(
      executeGuard(
        { puedeSalir },
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    ).toBe(false);
    expect(puedeSalir).toHaveBeenCalledOnce();
  });
});
