import { Injectable, computed, inject } from '@angular/core';
import { PagosAdministracion } from '../../pagos/servicios/pagos-administracion';
import type { CambioEntregaAdmin } from '../modelos/entrega-admin';
import type { SolicitudCancelacionAdmin } from '../modelos/cancelacion-admin';
import { EnviosAdministracionApi } from './envios-administracion-api';
import {
  CancelacionesAdministracionApi,
  SolicitudLiberacionAdmin,
} from './cancelaciones-administracion-api';

@Injectable({ providedIn: 'root' })
export class PedidosAdministracion {
  private readonly pagos = inject(PagosAdministracion);
  private readonly envios = inject(EnviosAdministracionApi);
  private readonly cancelaciones = inject(CancelacionesAdministracionApi);
  readonly remoto = true;
  get estadoListado() {
    return this.pagos.estadoListado;
  }
  get mensajeListado() {
    return this.pagos.mensajeListado;
  }
  get paginacion() {
    return this.pagos.paginacion;
  }
  cargarListado(filtros: Record<string, string>) {
    return this.pagos.cargarListado(filtros, 'pedidos');
  }
  cargarDetalle(codigo: string) {
    return this.envios.actualizar(codigo);
  }
  get resultados() {
    return this.pagos.resultados().map((p) => p.pedido);
  }
  get pedidos() {
    return this.pagos.pedidos();
  }
  obtener(codigo: string) {
    return this.pedidos.find((p) => p.codigo === codigo);
  }
  guardarEntrega(codigo: string, cambio: CambioEntregaAdmin) {
    return this.envios.guardar(codigo, cambio);
  }
  guardarCancelacion(codigo: string, solicitud: SolicitudCancelacionAdmin) {
    return this.cancelaciones.cancelar(codigo, solicitud);
  }
  liberarReservas(codigo: string, solicitud: SolicitudLiberacionAdmin) {
    return this.cancelaciones.liberar(codigo, solicitud);
  }
  actualizarCancelacion(codigo: string) {
    return this.cancelaciones.actualizar(codigo);
  }
  private readonly resumenActual = computed(() => ({
    total: this.pedidos.length,
    pendientesPago: this.pedidos.filter((p) => p.estadoPago === 'pendiente').length,
    porPreparar: this.pedidos.filter(
      (p) =>
        p.estadoPago === 'aprobado' && ['confirmado', 'en-preparacion'].includes(p.estadoEntrega),
    ).length,
  }));
  get resumen() {
    return this.resumenActual();
  }
}
