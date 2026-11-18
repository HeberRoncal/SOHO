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
import { PagosAdministracion } from '../../servicios/pagos-administracion';
import { ESTADOS_LISTADO_PAGOS, EstadoListadoPagos } from '../../modelos/pago-admin';
import { EstadoPedidoAdmin } from '../../../pedidos/componentes/estado-pedido-admin/estado-pedido-admin';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';
@Component({
  selector: 'app-listado-pagos',
  imports: [RouterLink, EstadoPedidoAdmin, PrecioProducto, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './listado-pagos.html',
  styleUrls: [
    '../../../pedidos/paginas/listado-pedidos/listado-pedidos.css',
    '../../../pedidos/paginas/listado-pedidos/tabla-pedidos.css',
    './listado-pagos.css',
  ],
})
export class ListadoPagos {
  protected readonly fuente = inject(PagosAdministracion);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly estados = ESTADOS_LISTADO_PAGOS;
  protected readonly estado = computed<EstadoListadoPagos>(() => {
    const valor = this.parametros().get('estado');
    return this.estados.some((e) => e[0] === valor) ? (valor as EstadoListadoPagos) : 'pendiente';
  });
  protected readonly busqueda = computed(() =>
    (this.parametros().get('busqueda') ?? '').slice(0, 120),
  );
  protected readonly metodo = computed(() => {
    const valor = this.parametros().get('metodo');
    return valor === 'Yape' || valor === 'Plin' ? valor : '';
  });
  protected readonly vista = computed(() => {
    return this.fuente.estadoListado() === 'error'
      ? 'error'
      : this.fuente.estadoListado() === 'lista'
        ? 'normal'
        : 'cargando';
  });
  protected readonly resultados = computed(() => this.fuente.resultados());
  protected cantidad(estado: string) {
    return this.fuente.conteos()[estado.toUpperCase()] ?? 0;
  }
  private readonly formato = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  });
  protected fecha(fecha: string) {
    return this.formato.format(new Date(fecha));
  }
  protected actualizar(campo: string, evento: Event) {
    this.cambiar(campo, (evento.target as HTMLInputElement).value);
  }
  protected cambiar(campo: string, valor: string) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        ...(campo === 'pagina' ? {} : { pagina: null }),
        [campo]: valor === 'normal' || valor === 'pendiente' ? null : valor || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: campo === 'busqueda',
    });
  }
  protected limpiar() {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { busqueda: null, metodo: null },
      queryParamsHandling: 'merge',
    });
  }
  constructor() {
    effect(() => {
      const filtros = this.filtrosRemotos();
      untracked(() => void this.fuente.cargarListado(filtros));
    });
  }
  private filtrosRemotos() {
    return {
      estado: this.estado().toUpperCase(),
      metodo: this.metodo().toUpperCase(),
      busqueda: this.busqueda(),
      pagina: this.parametros().get('pagina') ?? '1',
    };
  }
  protected reintentar() {
    void this.fuente.cargarListado(this.filtrosRemotos());
  }
  protected pagina(delta: number) {
    this.cambiar('pagina', String(this.fuente.paginacion().pagina + delta));
  }
}
