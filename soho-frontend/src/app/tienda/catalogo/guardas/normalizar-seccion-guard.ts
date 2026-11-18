import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NavegacionCatalogo } from '../servicios/navegacion-catalogo';

export const normalizarSeccionGuard: CanActivateFn = (ruta, estado) => {
  const navegacion = inject(NavegacionCatalogo);
  const seccion = navegacion.obtenerSeccion(ruta.routeConfig?.path);
  const actual = navegacion.leerConSeccion(ruta.queryParamMap, seccion.ruta);
  const destino = navegacion.crearDestino(actual.filtros, actual.orden, seccion.ruta);
  const router = inject(Router);
  const direccion = router.createUrlTree([destino.ruta], {
    queryParams: { ...ruta.queryParams, ...destino.parametros },
    fragment: ruta.fragment ?? undefined,
  });
  return router.serializeUrl(direccion) === estado.url ? true : direccion;
};
