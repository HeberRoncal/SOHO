import type { Signal } from '@angular/core';
import type { ProductoAdministracion } from './producto-administracion';
import type { MovimientoInventario } from './movimiento-inventario';
import type {
  ConteosProductos,
  EstadoConsultaProductos,
  OpcionesProductos,
  ResumenInventario,
} from './consulta-productos-api';

export interface FuenteProductosAdministracion {
  readonly remoto: boolean;
  readonly productos: Signal<readonly ProductoAdministracion[]>;
  readonly movimientos: Signal<readonly MovimientoInventario[]>;
  readonly resumen: Signal<ConteosProductos>;
  readonly estadoListado: Signal<EstadoConsultaProductos>;
  readonly mensajeListado: Signal<string>;
  readonly paginacion: Signal<{ pagina: number; limite: number; total: number; paginas: number }>;
  readonly opciones: Signal<OpcionesProductos>;
  readonly estadoOpciones: Signal<EstadoConsultaProductos>;
  readonly detalleActual: Signal<ProductoAdministracion | null>;
  readonly estadoDetalle: Signal<EstadoConsultaProductos>;
  readonly mensajeDetalle: Signal<string>;
  readonly estadoMovimientos: Signal<EstadoConsultaProductos>;
  readonly mensajeMovimientos: Signal<string>;
  readonly paginaMovimientos: Signal<{
    pagina: number;
    limite: number;
    total: number;
    paginas: number;
  }>;
  readonly resumenRemoto: Signal<ResumenInventario | null>;
  readonly estadoResumen: Signal<EstadoConsultaProductos>;
  readonly mensajeResumen: Signal<string>;
  cargarListado(filtros?: Record<string, string>): Promise<void>;
  cargarOpciones(): Promise<void>;
  cargarDetalle(id: string): Promise<void>;
  cargarMovimientos(filtros?: Record<string, string>): Promise<void>;
  cargarResumen(): Promise<void>;
  actualizarInventario(productoId: string): Promise<boolean>;
}
