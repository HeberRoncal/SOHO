import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Cuenta } from '../servicios/cuenta';
import { destinoCuenta } from '../modelos/validacion-cuenta';

export const cuentaGuard: CanActivateFn = async (_route, state) => {
  const cuenta = inject(Cuenta);
  const router = inject(Router);
  await cuenta.comprobarSesion(true);
  if (cuenta.estadoSesion() === 'error')
    return router.createUrlTree(['/sesion-no-disponible'], {
      queryParams: { volver: destinoCuenta(state.url) },
    });
  return cuenta.perfil()
    ? true
    : router.createUrlTree(['/iniciar-sesion'], {
        queryParams: { volver: destinoCuenta(state.url) },
      });
};
