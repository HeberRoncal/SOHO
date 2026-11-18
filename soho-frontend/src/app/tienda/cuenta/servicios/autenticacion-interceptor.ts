import { inject } from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { ProteccionCsrf } from './proteccion-csrf';
import { EstadoAutenticacion } from './estado-autenticacion';
import { destinoCuenta, esRutaPrivada } from '../modelos/validacion-cuenta';

export const GESTIONAR_401_LOCALMENTE = new HttpContextToken(() => false);

export const autenticacionInterceptor: HttpInterceptorFn = (req, next) => {
  // Nunca se envían cookies o firmas a URLs externas, aunque incluyan /api/.
  if (!req.url.startsWith('/api/')) return next(req);
  const csrf = inject(ProteccionCsrf);
  const estado = inject(EstadoAutenticacion);
  const router = inject(Router, { optional: true });
  const revision = estado.revision;
  const solicitud = req.clone({ withCredentials: true });
  const respuesta = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    ? next(solicitud)
    : csrf
        .obtener()
        .pipe(
          switchMap((token) => next(solicitud.clone({ setHeaders: { 'X-CSRF-Token': token } }))),
        );
  return respuesta.pipe(
    tap((evento) => {
      if (
        evento instanceof HttpResponse &&
        [
          '/api/auth/login',
          '/api/auth/registro',
          '/api/auth/google',
          '/api/auth/google/vinculacion',
        ].includes(req.url)
      ) {
        const token = (evento.body as { csrfToken?: unknown } | null)?.csrfToken;
        if (typeof token === 'string') csrf.actualizar(token);
      }
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) csrf.limpiar();
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.context.get(GESTIONAR_401_LOCALMENTE) &&
        revision === estado.revision
      ) {
        estado.invalidar('Tu sesión ha vencido. Inicia sesión nuevamente.');
        if (router && esRutaPrivada(router.url))
          void router.navigate(['/iniciar-sesion'], {
            queryParams: { volver: destinoCuenta(router.url), aviso: 'sesion-vencida' },
          });
      }
      // No se repiten automáticamente escrituras: el servidor pudo procesarlas.
      return throwError(() => error);
    }),
  );
};
