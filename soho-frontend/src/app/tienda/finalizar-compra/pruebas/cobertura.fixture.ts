import { Injectable, signal, type Provider } from '@angular/core';
import { FUENTE_COBERTURA } from '../servicios/cobertura-entrega';
import type { EstadoCobertura, FuenteCobertura } from '../modelos/fuente-cobertura';
import { ZONAS_COBERTURA_PRUEBA } from './zonas.fixtures';

// Fuente controlada solo para pruebas de vistas; nunca se registra en la aplicación.
@Injectable({ providedIn: 'root' })
export class CoberturaPrueba implements FuenteCobertura {
  readonly remoto = false;
  readonly estado = signal<EstadoCobertura>('lista');
  readonly mensaje = signal('');
  readonly cotizando = signal(false);
  readonly mensajeCotizacion = signal('');
  readonly zonas = ZONAS_COBERTURA_PRUEBA;
  cargar() {
    return Promise.resolve();
  }
  confirmar(distrito: string) {
    return Promise.resolve(this.cotizar(distrito));
  }
  invalidar() {}
  cotizar(distrito: string) {
    const zona = this.zonas.find((z) => z.codigo === distrito && z.habilitada);
    if (!zona || !Number.isFinite(zona.tarifa) || zona.tarifa < 0) return null;
    return {
      distrito: zona.codigo,
      nombreDistrito: zona.nombre,
      costo: Math.round(zona.tarifa * 100) / 100,
    };
  }
}

export const proveerCoberturaPrueba = (): Provider => ({
  provide: FUENTE_COBERTURA,
  useExisting: CoberturaPrueba,
});
