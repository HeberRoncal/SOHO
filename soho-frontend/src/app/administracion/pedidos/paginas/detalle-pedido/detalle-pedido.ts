import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  HostListener,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PedidosAdministracion } from '../../servicios/pedidos-administracion';
import { EstadoPedidoAdmin } from '../../componentes/estado-pedido-admin/estado-pedido-admin';
import { ArticulosPedido } from '../../../../compartido/componentes/articulos-pedido/articulos-pedido';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { GestionEntrega } from '../../componentes/gestion-entrega/gestion-entrega';
import { SolicitudesAdministracion } from '../../../cambios/servicios/solicitudes-administracion';
@Component({
  imports: [RouterLink, EstadoPedidoAdmin, ArticulosPedido, PrecioProducto, Icono, GestionEntrega],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-detalle-pedido',
  styleUrl: './detalle-pedido.css',
  templateUrl: './detalle-pedido.html',
})
export class DetallePedido {
  private readonly gestion = viewChild(GestionEntrega);
  puedeSalir() {
    return this.gestion()?.puedeSalir() ?? true;
  }
  @HostListener('window:beforeunload', ['$event'])
  protegerBorrador(evento: BeforeUnloadEvent) {
    if (this.gestion()?.tieneCambiosPendientes()) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  }
  private readonly ruta = inject(ActivatedRoute);
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  private readonly fuente = inject(PedidosAdministracion);
  private readonly solicitudes = inject(SolicitudesAdministracion);
  private readonly consulta = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly pedido = computed(() =>
    this.fuente.obtener(this.parametros().get('codigo') ?? ''),
  );
  protected readonly cargando = signal(false);
  protected readonly errorCarga = signal('');
  constructor() {
    effect(() => {
      this.parametros();
      untracked(() => void this.cargar());
    });
  }
  protected async cargar() {
    const codigo = this.parametros().get('codigo') ?? '';
    this.cargando.set(true);
    this.errorCarga.set('');
    const r = await this.fuente.cargarDetalle(codigo);
    if (codigo !== this.parametros().get('codigo')) return;
    this.cargando.set(false);
    if (!r.ok) this.errorCarga.set(r.error ?? 'No pudimos consultar el pedido.');
  }
  protected readonly unidades = computed(
    () => this.pedido()?.articulos.reduce((n, a) => n + a.cantidad, 0) ?? 0,
  );
  protected readonly clienteOrigen = computed(() => {
    const origen = this.consulta().get('clienteOrigen');
    return origen && origen === this.pedido()?.cliente.identificador ? origen : null;
  });
  protected readonly solicitudOrigen = computed(() => {
    const origen = this.consulta().get('solicitudOrigen');
    const solicitud = origen ? this.solicitudes.obtener(origen) : undefined;
    return solicitud && solicitud.pedido === this.pedido()?.codigo ? origen : null;
  });
  private readonly formato = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  });
  protected fecha(valor: string) {
    return this.formato.format(new Date(valor));
  }
}
