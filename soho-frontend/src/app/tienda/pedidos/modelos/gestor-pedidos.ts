import { Signal } from '@angular/core';
import { DatosEntrega } from '../../finalizar-compra/modelos/datos-entrega';
import { ArticuloPedido } from './articulo-pedido';
import { ComprobantePago, MetodoPago } from './comprobante-pago';
import { Pedido } from './pedido';
import { ResultadoPedido } from './resultado-pedido';
import { PaginacionPedidos, ResultadoConsulta } from './contrato-pedidos';

export interface GestorPedidos {
  readonly remoto: boolean;
  readonly envioPendiente: Signal<boolean>;
  readonly requiereSesion: Signal<boolean>;
  readonly accesoPersistente: Signal<boolean>;
  readonly estadoListado: Signal<'inicial' | 'cargando' | 'lista' | 'error'>;
  readonly mensajeListado: Signal<string>;
  readonly paginacion: Signal<PaginacionPedidos>;
  readonly articulos: Signal<readonly ArticuloPedido[]>;
  registrar(
    datos: DatosEntrega,
    metodo: MetodoPago,
    comprobante: ComprobantePago,
    cupon?: string,
  ): ResultadoPedido | Promise<ResultadoPedido>;
  obtener(codigo: string): Pedido | undefined;
  obtenerVistaPrevia(codigo: string): string | undefined;
  listarMios(): readonly Pedido[];
  cargar(codigo: string): Promise<ResultadoConsulta>;
  cargarMios(pagina?: number): Promise<ResultadoConsulta>;
  cargarComprobante(codigo: string): Promise<ResultadoConsulta>;
  liberarComprobante(codigo: string): void;
  corregir(
    codigo: string,
    comprobante: ComprobantePago,
    esperado: { versionPedido: number; versionPago: number; comprobanteId: string },
  ): Promise<ResultadoConsulta>;
  recuperarPendiente(): Promise<ResultadoPedido | undefined>;
  reintentarPendiente(): Promise<ResultadoPedido>;
  continuarConDatos(): void;
}
