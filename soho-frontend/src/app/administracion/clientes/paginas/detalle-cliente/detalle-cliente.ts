import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClientesAdministracionApi } from '../../servicios/clientes-administracion-api';
import { fechaClienteAdmin, inicialesClienteAdmin } from '../../modelos/cliente-admin';
import { importeCliente } from '../../modelos/consulta-clientes-api';
import { EstadoPedidoAdmin } from '../../../pedidos/componentes/estado-pedido-admin/estado-pedido-admin';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PaginacionClientes } from '../../componentes/paginacion-clientes/paginacion-clientes';

@Component({
  selector: 'app-detalle-cliente',
  imports: [RouterLink, EstadoPedidoAdmin, Icono, PaginacionClientes],
  templateUrl: './detalle-cliente.html',
  styleUrls: ['../../clientes-admin.css', './detalle-cliente.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetalleCliente {
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  private readonly consulta = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly fuente = inject(ClientesAdministracionApi);
  private readonly id = computed(() =>
    (this.parametros().get('identificador') ?? '').toLowerCase(),
  );
  protected readonly cliente = computed(() =>
    this.fuente.cliente()?.identificador === this.id() ? this.fuente.cliente() : null,
  );
  private pagina(campo: string) {
    const p = this.consulta().get(campo);
    return p && /^[1-9]\d{0,5}$/.test(p) && Number(p) <= 100000 ? Number(p) : 1;
  }
  protected readonly paginaPedidos = computed(() => this.pagina('paginaPedidos'));
  protected readonly paginaDirecciones = computed(() => this.pagina('paginaDirecciones'));
  protected readonly fecha = fechaClienteAdmin;
  protected readonly iniciales = inicialesClienteAdmin;
  protected readonly importe = importeCliente;
  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.fuente.cargarDetalle(id));
    });
    effect(() => {
      const c = this.cliente(),
        pagina = this.paginaPedidos();
      if (c) untracked(() => void this.fuente.cargarPedidos(c.identificador, pagina));
    });
    effect(() => {
      const c = this.cliente(),
        pagina = this.paginaDirecciones();
      if (c) untracked(() => void this.fuente.cargarDirecciones(c.identificador, pagina));
    });
    inject(DestroyRef).onDestroy(() => this.fuente.salirDetalle());
  }
  protected reintentar(canal: 'detalle' | 'pedidos' | 'direcciones') {
    if (canal === 'detalle') void this.fuente.cargarDetalle(this.id());
    if (canal === 'pedidos') void this.fuente.cargarPedidos(this.id(), this.paginaPedidos());
    if (canal === 'direcciones')
      void this.fuente.cargarDirecciones(this.id(), this.paginaDirecciones());
  }
  protected cambiarPagina(canal: 'pedidos' | 'direcciones', pagina: number) {
    const campo = canal === 'pedidos' ? 'paginaPedidos' : 'paginaDirecciones';
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { [campo]: pagina === 1 ? null : pagina },
      queryParamsHandling: 'merge',
    });
  }
}
