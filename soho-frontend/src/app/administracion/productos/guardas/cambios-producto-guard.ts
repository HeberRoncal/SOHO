import { CanDeactivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
export interface FormularioConCambios {
  puedeSalir(): boolean | Promise<boolean>;
}
export const cambiosProductoGuard: CanDeactivateFn<FormularioConCambios> = (componente) => {
  const cuenta = inject(Cuenta);
  // La pérdida de acceso no puede quedar bloqueada por un formulario privado.
  return cuenta.remoto && cuenta.perfil()?.rol !== 'ADMIN' ? true : componente.puedeSalir();
};
