import { Injectable, Injector, computed, inject } from '@angular/core';
import { PagosAdministracionPrueba as PagosAdministracion } from '../../pagos/pruebas/pagos-administracion.fixture';
import { EnviosAdministracionPrueba as EnviosAdministracion } from './envios-administracion.fixture';
import { CambioEntregaAdmin } from '../modelos/entrega-admin';
import { CancelacionesAdministracionPrueba as CancelacionesAdministracion } from './cancelaciones-administracion.fixture';
import { SolicitudCancelacionAdmin } from '../modelos/cancelacion-admin';
import {
  EnviosAdministracionApi,
  ResultadoEntregaAdmin,
} from '../servicios/envios-administracion-api';
import {
  CancelacionesAdministracionApi,
  SolicitudLiberacionAdmin,
  ResultadoCancelacionAdmin,
} from '../servicios/cancelaciones-administracion-api';

@Injectable({ providedIn: 'root' })
export class PedidosAdministracionPrueba {
  private readonly injector = inject(Injector);
  private readonly pagos = inject(PagosAdministracion);
  private readonly envios = inject(EnviosAdministracion);
  private readonly cancelaciones = inject(CancelacionesAdministracion);
  readonly hayCambiosEnvio = this.envios.hayCambios;
  readonly hayCambiosCancelacion = this.cancelaciones.hayCambios;
  get remoto() {
    return this.pagos.remoto;
  }
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
    return this.remoto
      ? this.injector.get(EnviosAdministracionApi).actualizar(codigo)
      : this.pagos.cargarDetalle(codigo);
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
  registrarEntrega(codigo: string, cambio: CambioEntregaAdmin) {
    if (this.remoto)
      return { ok: false, errores: { estado: 'La gestión de envíos aún no está habilitada.' } };
    return this.envios.registrar(this.obtener(codigo), cambio);
  }
  async guardarEntrega(codigo: string, cambio: CambioEntregaAdmin): Promise<ResultadoEntregaAdmin> {
    return this.remoto
      ? this.injector.get(EnviosAdministracionApi).guardar(codigo, cambio)
      : this.registrarEntrega(codigo, cambio);
  }
  restablecerEnvios() {
    this.envios.restablecer();
  }
  cancelar(codigo: string, solicitud: SolicitudCancelacionAdmin) {
    if (this.remoto)
      return { ok: false, errores: { estado: 'La cancelación aún no está habilitada.' } };
    return this.cancelaciones.registrar(this.obtener(codigo), solicitud);
  }
  restablecerCancelaciones() {
    this.cancelaciones.restablecer();
  }
  async guardarCancelacion(
    codigo: string,
    solicitud: SolicitudCancelacionAdmin,
  ): Promise<ResultadoCancelacionAdmin> {
    return this.remoto
      ? this.injector.get(CancelacionesAdministracionApi).cancelar(codigo, solicitud)
      : this.cancelar(codigo, solicitud);
  }
  liberarReservas(
    codigo: string,
    solicitud: SolicitudLiberacionAdmin,
  ): Promise<ResultadoCancelacionAdmin> {
    return this.injector.get(CancelacionesAdministracionApi).liberar(codigo, solicitud);
  }
  actualizarCancelacion(codigo: string) {
    return this.remoto
      ? this.injector.get(CancelacionesAdministracionApi).actualizar(codigo)
      : this.cargarDetalle(codigo);
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
