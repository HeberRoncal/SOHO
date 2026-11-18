import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Cuenta } from '../servicios/cuenta';
import { destinoCuenta } from '../modelos/validacion-cuenta';

export const adminGuard: CanActivateFn = async (_ruta, estado) => {
  const cuenta = inject(Cuenta);
  const router = inject(Router);
  await cuenta.comprobarSesion(true);
  if (cuenta.estadoSesion() === 'error')
    return router.createUrlTree(['/sesion-no-disponible'], {
      queryParams: { volver: destinoCuenta(estado.url) },
    });
  if (!cuenta.perfil())
    return router.createUrlTree(['/iniciar-sesion'], {
      queryParams: { volver: destinoCuenta(estado.url) },
    });
  return cuenta.perfil()?.rol === 'ADMIN' ? true : router.createUrlTree(['/sin-permiso']);
};
