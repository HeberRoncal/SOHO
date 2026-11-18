import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Icono } from '../../compartido/componentes/icono/icono';
import { EstadoPedidoAdmin } from '../pedidos/componentes/estado-pedido-admin/estado-pedido-admin';
import { diaPedidoAdmin } from '../pedidos/modelos/pedido-admin';
import { DashboardDatos } from './dashboard-datos';
import { desplazarDia, errorPeriodo, ventasDiarias } from './resumen-dashboard';
import { GraficoVentas } from './grafico-ventas/grafico-ventas';
import { NuevoProductoModal } from '../productos/componentes/nuevo-producto-modal/nuevo-producto-modal';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    Icono,
    CurrencyPipe,
    EstadoPedidoAdmin,
    GraficoVentas,
    DatePipe,
    NuevoProductoModal,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard-estados.css', './dashboard.css', './dashboard-contenido.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly nuevoProductoAbierto = signal(false);
  private readonly nuevoProducto = viewChild<NuevoProductoModal>('nuevoProducto');
  puedeSalir(): boolean | Promise<boolean> {
    return this.nuevoProducto()?.puedeSalir() ?? true;
  }
  readonly datos = inject(DashboardDatos);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  readonly hoy = diaPedidoAdmin(new Date().toISOString());
  readonly periodos = [
    { id: 'hoy', texto: 'Hoy' },
    { id: '7', texto: '7 días' },
    { id: '30', texto: '30 días' },
    { id: 'personalizado', texto: 'Personalizado' },
  ];
  readonly periodo = computed(() =>
    this.periodos.some((p) => p.id === this.parametros().get('periodo'))
      ? this.parametros().get('periodo')!
      : '30',
  );
  readonly desde = computed(() =>
    this.periodo() === 'personalizado'
      ? (this.parametros().get('desde') ?? desplazarDia(this.hoy, -29))
      : desplazarDia(this.hoy, this.periodo() === 'hoy' ? 0 : this.periodo() === '7' ? -6 : -29),
  );
  readonly hasta = computed(() =>
    this.periodo() === 'personalizado' ? (this.parametros().get('hasta') ?? this.hoy) : this.hoy,
  );
  readonly error = computed(() => errorPeriodo(this.desde(), this.hasta(), this.hoy));
  readonly vista = computed(() => {
    if (this.error()) return 'normal';
    if (this.datos.remoto)
      return this.datos.estado() === 'lista'
        ? 'normal'
        : this.datos.estado() === 'error'
          ? 'error'
          : 'cargando';
    const v = this.parametros().get('vista');
    return ['vacio', 'cargando', 'error'].includes(v ?? '') ? v! : 'normal';
  });
  readonly serie = computed(() =>
    this.error()
      ? []
      : this.datos.remoto
        ? ventasDiarias([], this.desde(), this.hasta()).map(
            (d) => this.datos.resumen()?.ventas.find((v) => v.dia === d.dia) ?? d,
          )
        : ventasDiarias(
            this.vista() === 'vacio' ? [] : this.datos.pagos(),
            this.desde(),
            this.hasta(),
          ),
  );
  readonly ventas = computed(
    () => this.serie().reduce((n, p) => n + Math.round(p.importe * 100), 0) / 100,
  );
  readonly vendidos = computed(() => this.serie().reduce((n, p) => n + p.pedidos, 0));
  readonly pendientes = computed(() => (this.vista() === 'vacio' ? [] : this.datos.pendientes()));
  readonly observados = computed(() => (this.vista() === 'vacio' ? [] : this.datos.observados()));
  readonly preparar = computed(() => (this.vista() === 'vacio' ? [] : this.datos.porPreparar()));
  readonly incidencias = computed(() => (this.vista() === 'vacio' ? [] : this.datos.incidencias()));
  readonly alertas = computed(() => (this.vista() === 'vacio' ? [] : this.datos.alertas()));
  readonly recientes = computed(() => (this.vista() === 'vacio' ? [] : this.datos.recientes()));
  readonly agotadas = computed(() =>
    this.datos.inventarioRemoto
      ? this.datos.totalAgotadas()
      : this.alertas().filter((a) => a.disponible === 0).length,
  );
  cambiarPeriodo(periodo: string) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { periodo: periodo === '30' ? null : periodo },
      queryParamsHandling: 'merge',
    });
  }
  cambiarFecha(campo: 'desde' | 'hasta', evento: Event) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { [campo]: (evento.target as HTMLInputElement).value },
      queryParamsHandling: 'merge',
    });
  }
  reintentar() {
    if (this.datos.remoto) {
      void this.datos.cargar(this.desde(), this.hasta());
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { vista: null },
      queryParamsHandling: 'merge',
    });
  }
  constructor() {
    if (this.datos.inventarioRemoto) void this.datos.cargarInventario();
    effect(() => {
      const desde = this.desde(),
        hasta = this.hasta();
      if (this.datos.remoto && !this.error()) untracked(() => void this.datos.cargar(desde, hasta));
    });
  }
  readonly cantidadPendientes = computed(() =>
    this.datos.remoto
      ? (this.datos.resumen()?.conteos['PENDIENTE'] ?? 0)
      : this.pendientes().length,
  );
  readonly cantidadObservados = computed(() =>
    this.datos.remoto
      ? (this.datos.resumen()?.conteos['OBSERVADO'] ?? 0)
      : this.observados().length,
  );
  readonly cantidadPreparar = computed(() =>
    this.datos.remoto ? (this.datos.resumen()?.porPrepararTotal ?? 0) : this.preparar().length,
  );
  readonly cantidadIncidencias = computed(() =>
    this.datos.remoto ? (this.datos.resumen()?.incidenciasTotal ?? 0) : this.incidencias().length,
  );
}
