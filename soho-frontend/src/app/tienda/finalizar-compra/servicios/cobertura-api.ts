import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EstadoCobertura, FuenteCobertura } from '../modelos/fuente-cobertura';
import { ZonaEntrega } from '../modelos/zona-entrega';
import { CotizacionEntrega } from '../modelos/cotizacion-entrega';

const decimal = (valor: unknown): number => {
  if (
    typeof valor !== 'string' ||
    !/^(?:0|[1-9][0-9]{0,5})\.[0-9]{2}$/.test(valor) ||
    /[^0-9.]/.test(valor)
  )
    throw new Error('Importe de entrega no válido.');
  const [soles, centimos] = valor.split('.');
  return (Number(soles) * 100 + Number(centimos)) / 100;
};
const codigoValido = (valor: unknown): valor is string =>
  typeof valor === 'string' &&
  valor.length <= 80 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(valor) &&
  !/[^a-z0-9-]/.test(valor);

@Injectable({ providedIn: 'root' })
export class CoberturaApi implements FuenteCobertura {
  private readonly http = inject(HttpClient);
  readonly remoto = true;
  readonly estado = signal<EstadoCobertura>('inicial');
  readonly mensaje = signal('');
  readonly cotizando = signal(false);
  readonly mensajeCotizacion = signal('');
  private readonly listado = signal<readonly ZonaEntrega[]>([]);
  private readonly ultima = signal<CotizacionEntrega | null>(null);
  private secuencia = 0;
  private carga?: Promise<void>;
  get zonas() {
    return this.listado();
  }

  cargar(): Promise<void> {
    if (this.carga) return this.carga;
    this.estado.set('cargando');
    this.mensaje.set('');
    this.invalidar();
    const carga = firstValueFrom(
      this.http.get<{ zonas: Array<Record<string, unknown>> }>('/api/cobertura', {
        timeout: 15000,
      }),
    )
      .then((r) => {
        if (!Array.isArray(r.zonas) || !r.zonas.length) throw new Error();
        const codigos = new Set<string>();
        const zonas = r.zonas.map((z): ZonaEntrega => {
          if (
            !z ||
            !codigoValido(z['codigo']) ||
            codigos.has(z['codigo']) ||
            typeof z['nombre'] !== 'string' ||
            !z['nombre'].trim() ||
            typeof z['habilitada'] !== 'boolean' ||
            (z['plazo'] !== null && typeof z['plazo'] !== 'string')
          )
            throw new Error();
          codigos.add(z['codigo']);
          return Object.freeze({
            codigo: z['codigo'],
            nombre: z['nombre'],
            tarifa: z['tarifa'] === null ? null : decimal(z['tarifa']),
            plazo: z['plazo'],
            habilitada: z['habilitada'],
          });
        });
        this.listado.set(Object.freeze(zonas));
        this.estado.set('lista');
      })
      .catch(() => {
        this.estado.set('error');
        this.mensaje.set('No pudimos cargar los distritos. Reintenta sin borrar tus datos.');
      })
      .finally(() => {
        if (this.carga === carga) this.carga = undefined;
      });
    this.carga = carga;
    return carga;
  }
  cotizar(distrito: string): CotizacionEntrega | null {
    const actual = this.ultima();
    return this.estado() === 'lista' && !this.cotizando() && actual?.distrito === distrito
      ? actual
      : null;
  }
  invalidar() {
    this.secuencia++;
    this.ultima.set(null);
    this.cotizando.set(false);
    this.mensajeCotizacion.set('');
  }
  async confirmar(distrito: string): Promise<CotizacionEntrega | null> {
    this.invalidar();
    const secuencia = this.secuencia;
    if (!distrito) return null;
    if (!codigoValido(distrito) || this.estado() !== 'lista') {
      this.mensajeCotizacion.set('Actualiza los distritos antes de confirmar el envío.');
      return null;
    }
    this.cotizando.set(true);
    try {
      const r = await firstValueFrom(
        this.http.get<{ cotizacion: Record<string, unknown> }>(
          `/api/cobertura/${encodeURIComponent(distrito)}/cotizacion`,
          { timeout: 15000 },
        ),
      );
      if (secuencia !== this.secuencia) return null;
      const c = r.cotizacion;
      if (
        !c ||
        c['distrito'] !== distrito ||
        typeof c['nombreDistrito'] !== 'string' ||
        c['moneda'] !== 'PEN' ||
        (c['plazo'] !== null && typeof c['plazo'] !== 'string')
      )
        throw new Error();
      const cotizacion = Object.freeze({
        tarifaReal: true,
        distrito,
        nombreDistrito: c['nombreDistrito'],
        costo: decimal(c['costo']),
        plazo: c['plazo'],
      });
      this.ultima.set(cotizacion);
      return cotizacion;
    } catch (error) {
      if (secuencia !== this.secuencia) return null;
      let mensaje = 'No pudimos confirmar el costo de envío. Reintenta; tus datos se conservan.';
      if (error instanceof HttpErrorResponse) {
        if (error.status === 404)
          mensaje = 'Este distrito no está disponible para entrega. Selecciona otro.';
        if (error.status === 422 && error.error?.codigo === 'COBERTURA_DESHABILITADA')
          mensaje = 'La entrega a este distrito está deshabilitada. Selecciona otro.';
        if (error.status === 422 && error.error?.codigo === 'COBERTURA_TARIFA_PENDIENTE')
          mensaje = 'La tarifa de este distrito está pendiente de definir. Selecciona otro.';
      }
      this.mensajeCotizacion.set(mensaje);
      return null;
    } finally {
      if (secuencia === this.secuencia) this.cotizando.set(false);
    }
  }
}
