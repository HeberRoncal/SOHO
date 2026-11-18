import { Injectable, InjectionToken, inject } from '@angular/core';
import type { FuenteCobertura } from '../modelos/fuente-cobertura';
import { CoberturaApi } from './cobertura-api';

export const FUENTE_COBERTURA = new InjectionToken<FuenteCobertura>('FUENTE_COBERTURA', {
  providedIn: 'root',
  factory: () => inject(CoberturaApi),
});

@Injectable({ providedIn: 'root' })
export class CoberturaEntrega implements FuenteCobertura {
  private readonly fuente = inject(FUENTE_COBERTURA);
  readonly remoto = this.fuente.remoto;
  readonly estado = this.fuente.estado;
  readonly mensaje = this.fuente.mensaje;
  readonly cotizando = this.fuente.cotizando;
  readonly mensajeCotizacion = this.fuente.mensajeCotizacion;
  get zonas() {
    return this.fuente.zonas;
  }
  cargar() {
    return this.fuente.cargar();
  }
  confirmar(distrito: string) {
    return this.fuente.confirmar(distrito);
  }
  invalidar() {
    this.fuente.invalidar();
  }
  cotizar(distrito: string) {
    return this.fuente.cotizar(distrito);
  }
}
