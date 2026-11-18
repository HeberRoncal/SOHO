import { Injectable, InjectionToken, inject } from '@angular/core';
import { DatosEntrega } from '../../finalizar-compra/modelos/datos-entrega';
import { ComprobantePago, MetodoPago } from '../modelos/comprobante-pago';
import { GestorPedidos } from '../modelos/gestor-pedidos';
import { PedidosApi } from './pedidos-api';

export const GESTOR_PEDIDOS = new InjectionToken<GestorPedidos>('GESTOR_PEDIDOS', {
  providedIn: 'root',
  factory: () => inject(PedidosApi),
});

@Injectable({ providedIn: 'root' })
export class Pedidos implements GestorPedidos {
  private readonly gestor = inject(GESTOR_PEDIDOS);
  readonly remoto = this.gestor.remoto;
  readonly envioPendiente = this.gestor.envioPendiente;
  readonly requiereSesion = this.gestor.requiereSesion;
  readonly accesoPersistente = this.gestor.accesoPersistente;
  readonly estadoListado = this.gestor.estadoListado;
  readonly mensajeListado = this.gestor.mensajeListado;
  readonly paginacion = this.gestor.paginacion;
  readonly articulos = this.gestor.articulos;
  registrar(datos: DatosEntrega, metodo: MetodoPago, comprobante: ComprobantePago, cupon?: string) {
    return this.gestor.registrar(datos, metodo, comprobante, cupon);
  }
  obtener(codigo: string) {
    return this.gestor.obtener(codigo);
  }
  obtenerVistaPrevia(codigo: string) {
    return this.gestor.obtenerVistaPrevia(codigo);
  }
  listarMios() {
    return this.gestor.listarMios();
  }
  cargar(codigo: string) {
    return this.gestor.cargar(codigo);
  }
  cargarMios(pagina = 1) {
    return this.gestor.cargarMios(pagina);
  }
  cargarComprobante(codigo: string) {
    return this.gestor.cargarComprobante(codigo);
  }
  liberarComprobante(codigo: string) {
    this.gestor.liberarComprobante(codigo);
  }
  corregir(
    codigo: string,
    comprobante: ComprobantePago,
    esperado: { versionPedido: number; versionPago: number; comprobanteId: string },
  ) {
    return this.gestor.corregir(codigo, comprobante, esperado);
  }
  recuperarPendiente() {
    return this.gestor.recuperarPendiente();
  }
  reintentarPendiente() {
    return this.gestor.reintentarPendiente();
  }
  continuarConDatos() {
    this.gestor.continuarConDatos();
  }
}
