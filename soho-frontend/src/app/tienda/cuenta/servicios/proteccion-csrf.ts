import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProteccionCsrf {
  // Bypassa los interceptores para no iniciar otro bootstrap CSRF desde sí mismo.
  private readonly http = new HttpClient(inject(HttpBackend));
  private token?: string;
  private solicitud?: Observable<string>;
  private revision = 0;

  actualizar(token: string): void {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Respuesta CSRF no válida.');
    this.revision++;
    this.token = token;
  }
  limpiar(): void {
    this.revision++;
    this.token = undefined;
    this.solicitud = undefined;
  }
  obtener(): Observable<string> {
    if (this.token) return of(this.token);
    if (this.solicitud) return this.solicitud;
    const revision = this.revision;
    const solicitud = this.http
      .get<{ csrfToken: string }>('/api/auth/csrf', {
        withCredentials: true,
        timeout: 15000,
      })
      .pipe(
        map((r) => {
          if (!/^[0-9a-f]{64}$/.test(r.csrfToken)) throw new Error('Respuesta CSRF no válida.');
          return r.csrfToken;
        }),
        tap((token) => {
          if (revision === this.revision) this.token = token;
        }),
        finalize(() => {
          if (this.solicitud === solicitud) this.solicitud = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.solicitud = solicitud;
    return solicitud;
  }
}
