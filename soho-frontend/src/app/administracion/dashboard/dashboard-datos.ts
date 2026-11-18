import { Injectable, computed, inject } from '@angular/core';
import { PagosAdministracion } from '../pagos/servicios/pagos-administracion';
import { ProductosAdministracion } from '../productos/servicios/productos-administracion';
import { alertasInventario } from './resumen-dashboard';

@Injectable({ providedIn: 'root' })
export class DashboardDatos {
  private readonly fuentePagos = inject(PagosAdministracion);
  private readonly fuenteProductos = inject(ProductosAdministracion);
  readonly remoto = this.fuentePagos.remoto;
  readonly resumen = this.fuentePagos.resumenRemoto;
  readonly estado = this.fuentePagos.estadoResumen;
  readonly mensaje = this.fuentePagos.mensajeResumen;
  readonly inventarioRemoto = this.fuenteProductos.remoto;
  readonly estadoInventario = this.fuenteProductos.estadoResumen;
  readonly mensajeInventario = this.fuenteProductos.mensajeResumen;
  readonly resumenInventario = this.fuenteProductos.resumenRemoto;
  cargarInventario() {
    return this.fuenteProductos.cargarResumen();
  }
  cargar(desde: string, hasta: string) {
    return this.fuentePagos.cargarResumen(desde, hasta);
  }
  readonly pagos = this.fuentePagos.pagos;
  readonly pedidos = this.fuentePagos.pedidos;
  readonly pendientes = computed(() =>
    this.remoto
      ? (this.resumen()?.pendientes ?? [])
      : this.pagos()
          .filter((p) => p.pedido.estadoPago === 'pendiente')
          .sort((a, b) =>
            (a.comprobantes[0]?.fecha ?? a.pedido.fecha).localeCompare(
              b.comprobantes[0]?.fecha ?? b.pedido.fecha,
            ),
          ),
  );
  readonly observados = computed(() =>
    this.remoto
      ? (this.resumen()?.observados ?? [])
      : this.pagos().filter((p) => p.pedido.estadoPago === 'observado'),
  );
  readonly porPreparar = computed(() =>
    this.remoto
      ? (this.resumen()?.porPreparar ?? [])
      : this.pedidos().filter(
          (p) =>
            p.estadoPago === 'aprobado' &&
            ['confirmado', 'en-preparacion'].includes(p.estadoEntrega),
        ),
  );
  readonly incidencias = computed(() =>
    this.remoto
      ? (this.resumen()?.incidencias ?? [])
      : this.pedidos().filter((p) => p.estadoEntrega === 'incidencia'),
  );
  readonly recientes = computed(() =>
    this.remoto
      ? (this.resumen()?.recientes ?? [])
      : [...this.pedidos()].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 7),
  );
  readonly alertas = computed(() =>
    this.inventarioRemoto
      ? (this.resumenInventario()?.alertas ?? [])
      : alertasInventario(this.fuenteProductos.productos()),
  );
  readonly totalAlertas = computed(() =>
    this.inventarioRemoto ? (this.resumenInventario()?.alertasTotal ?? 0) : this.alertas().length,
  );
  readonly totalAgotadas = computed(() =>
    this.inventarioRemoto
      ? (this.resumenInventario()?.agotadasTotal ?? 0)
      : this.alertas().filter((a) => a.disponible === 0).length,
  );
  readonly importePendiente = computed(() =>
    this.remoto
      ? (this.resumen()?.importePendiente ?? 0)
      : [...this.pendientes(), ...this.observados()].reduce(
          (n, p) => n + Math.round(p.pedido.total * 100),
          0,
        ) / 100,
  );
}
