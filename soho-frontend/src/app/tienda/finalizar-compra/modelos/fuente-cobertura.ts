import { ZonaEntrega } from './zona-entrega';
import { CotizacionEntrega } from './cotizacion-entrega';
import { Signal } from '@angular/core';

export type EstadoCobertura = 'inicial' | 'cargando' | 'lista' | 'error';

export interface FuenteCobertura {
  readonly remoto: boolean;
  readonly estado: Signal<EstadoCobertura>;
  readonly mensaje: Signal<string>;
  readonly cotizando: Signal<boolean>;
  readonly mensajeCotizacion: Signal<string>;
  readonly zonas: readonly ZonaEntrega[];
  cotizar(distrito: string): CotizacionEntrega | null;
  cargar(): Promise<void>;
  confirmar(distrito: string): Promise<CotizacionEntrega | null>;
  invalidar(): void;
}
