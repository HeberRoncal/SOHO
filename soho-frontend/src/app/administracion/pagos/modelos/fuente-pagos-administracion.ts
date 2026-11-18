import type { Signal } from '@angular/core';
import type { PedidoAdmin } from '../../pedidos/modelos/pedido-admin';
import type { DecisionPagoAdmin, PagoAdmin, ResumenAdmin } from './pago-admin';

export interface FuentePagosAdministracion {
  readonly remoto: boolean;
  readonly estadoListado: Signal<'inicial' | 'cargando' | 'lista' | 'error'>;
  readonly mensajeListado: Signal<string>;
  readonly paginacion: Signal<{ pagina: number; limite: number; total: number; paginas: number }>;
  readonly conteos: Signal<Record<string, number>>;
  readonly resultados: Signal<readonly PagoAdmin[]>;
  readonly pagos: Signal<readonly PagoAdmin[]>;
  readonly pedidos: Signal<readonly PedidoAdmin[]>;
  readonly resumenRemoto: Signal<ResumenAdmin | null>;
  readonly estadoResumen: Signal<'inicial' | 'cargando' | 'lista' | 'error'>;
  readonly mensajeResumen: Signal<string>;
  cargarResumen(desde: string, hasta: string): Promise<void>;
  cargarListado(filtros?: Record<string, string>, tipo?: string): Promise<void>;
  cargarDetalle(codigo: string): Promise<{ ok: boolean; error?: string }>;
  obtener(codigo: string): PagoAdmin | undefined;
  comprobante(codigo: string, id: string): Promise<Blob>;
  revisar(codigo: string, decision: DecisionPagoAdmin): Promise<{ ok: boolean; error?: string }>;
}
