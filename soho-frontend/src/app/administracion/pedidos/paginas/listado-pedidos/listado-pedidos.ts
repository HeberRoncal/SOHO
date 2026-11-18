import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PedidosAdministracion } from '../../servicios/pedidos-administracion';
import {
  ESTADOS_ENTREGA_ADMIN,
  ESTADOS_PAGO_ADMIN,
  FiltrosPedidosAdmin,
  FILTROS_PEDIDOS_VACIOS,
  OrdenPedidosAdmin,
  fechaFiltroPedido,
} from '../../modelos/pedido-admin';
import { EstadoPedidoAdmin } from '../../componentes/estado-pedido-admin/estado-pedido-admin';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';
@Component({
  imports: [RouterLink, EstadoPedidoAdmin, PrecioProducto, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-listado-pedidos',
  styleUrls: ['./listado-pedidos.css', './tabla-pedidos.css'],
  templateUrl: './listado-pedidos.html',
})
export class ListadoPedidos {
  protected readonly fuente = inject(PedidosAdministracion);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly pagos = Object.entries(ESTADOS_PAGO_ADMIN);
  protected readonly entregas = Object.entries(ESTADOS_ENTREGA_ADMIN);
  protected readonly filtros = computed<FiltrosPedidosAdmin>(() => {
    const p = this.parametros(),
      pago = p.get('pago') ?? '',
      entrega = p.get('entrega') ?? '',
      cliente = p.get('cliente') ?? '';
    return {
      busqueda: (p.get('busqueda') ?? '').slice(0, 120),
      pago: Object.hasOwn(ESTADOS_PAGO_ADMIN, pago) ? (pago as FiltrosPedidosAdmin['pago']) : '',
      entrega:
        entrega === 'por-preparar' || Object.hasOwn(ESTADOS_ENTREGA_ADMIN, entrega)
          ? (entrega as FiltrosPedidosAdmin['entrega'])
          : '',
      cliente: cliente === 'invitado' || cliente === 'registrado' ? cliente : '',
      reserva: p.get('reserva') === 'vencida' ? 'vencida' : '',
      desde: fechaFiltroPedido(p.get('desde')),
      hasta: fechaFiltroPedido(p.get('hasta')),
    };
  });
  protected readonly orden = computed<OrdenPedidosAdmin>(() => {
    const orden = this.parametros().get('orden');
    return ['antiguos', 'total-mayor', 'total-menor'].includes(orden ?? '')
      ? (orden as OrdenPedidosAdmin)
      : 'recientes';
  });
  protected readonly vista = computed(() => {
    if (this.errorFechas()) return 'normal';
    return this.fuente.estadoListado() === 'lista'
      ? 'normal'
      : this.fuente.estadoListado() === 'error'
        ? 'error'
        : 'cargando';
  });
  protected readonly hayFiltros = computed(() => Object.values(this.filtros()).some(Boolean));
  protected readonly errorFechas = computed(
    () =>
      !!(
        this.filtros().desde &&
        this.filtros().hasta &&
        this.filtros().desde > this.filtros().hasta
      ),
  );
  protected readonly resultados = computed(() =>
    this.errorFechas() ? [] : this.fuente.resultados,
  );
  private readonly formato = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  });
  protected fecha(valor: string) {
    return this.formato.format(new Date(valor));
  }
  protected unidades(
    articulos: readonly {
      cantidad: number;
    }[],
  ) {
    return articulos.reduce((s, a) => s + a.cantidad, 0);
  }
  protected actualizar(campo: keyof FiltrosPedidosAdmin | 'orden', evento: Event) {
    const valor = (evento.target as HTMLInputElement).value;
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        pagina: null,
        [campo]: valor === 'normal' || valor === 'recientes' ? null : valor || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: campo === 'busqueda',
    });
  }
  protected limpiar() {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        ...Object.fromEntries(Object.keys(FILTROS_PEDIDOS_VACIOS).map((k) => [k, null])),
        orden: null,
      },
      queryParamsHandling: 'merge',
    });
  }
  protected reintentar() {
    void this.fuente.cargarListado(this.consultaRemota());
  }
  constructor() {
    effect(() => {
      const filtros = this.consultaRemota();
      if (!this.errorFechas()) untracked(() => void this.fuente.cargarListado(filtros));
    });
  }
  private consultaRemota() {
    const f = this.filtros();
    return {
      busqueda: f.busqueda,
      estado: f.pago.toUpperCase(),
      entrega: f.entrega.replaceAll('-', '_').toUpperCase(),
      cliente: f.cliente,
      reserva: f.reserva ?? '',
      desde: f.desde,
      hasta: f.hasta,
      orden: this.orden(),
      pagina: this.parametros().get('pagina') ?? '1',
    };
  }
  protected pagina(delta: number) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { pagina: this.fuente.paginacion().pagina + delta },
      queryParamsHandling: 'merge',
    });
  }
}
