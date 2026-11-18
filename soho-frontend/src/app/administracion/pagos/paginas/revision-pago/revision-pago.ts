import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PagosAdministracion } from '../../servicios/pagos-administracion';
import { AccionPagoAdmin, MOTIVOS_REVISION_PAGO, puedeRevisarPago } from '../../modelos/pago-admin';
import { EstadoPedidoAdmin } from '../../../pedidos/componentes/estado-pedido-admin/estado-pedido-admin';
import { VistaComprobante } from '../../componentes/vista-comprobante/vista-comprobante';
import { DecisionPago } from '../../componentes/decision-pago/decision-pago';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';
@Component({
  selector: 'app-revision-pago',
  imports: [RouterLink, EstadoPedidoAdmin, VistaComprobante, DecisionPago, PrecioProducto, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './revision-pago.html',
  styleUrls: ['./revision-pago.css', './datos-revision.css'],
})
export class RevisionPago {
  private readonly ruta = inject(ActivatedRoute);
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  private readonly consulta = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly fuente = inject(PagosAdministracion);
  protected readonly codigo = computed(() => this.parametros().get('codigo') ?? '');
  protected readonly pago = computed(() => this.fuente.obtener(this.codigo()));
  protected readonly cargando = signal(false);
  protected readonly errorCarga = signal('');
  constructor() {
    effect(() => {
      this.codigo();
      this.accion.set(null);
      untracked(() => void this.cargar());
    });
  }
  protected async cargar() {
    const codigo = this.codigo();
    this.cargando.set(true);
    this.errorCarga.set('');
    const r = await this.fuente.cargarDetalle(codigo);
    if (codigo !== this.codigo()) return;
    this.cargando.set(false);
    if (!r.ok) this.errorCarga.set(r.error ?? 'No pudimos cargar el pago.');
  }
  protected readonly volverPedido = computed(
    () => this.consulta().get('origen') === 'pedido' && !!this.pago(),
  );
  protected readonly seleccionId = signal('');
  protected readonly seleccion = computed(
    () =>
      this.pago()?.comprobantes.find((c) => c.id === this.seleccionId()) ??
      this.pago()?.comprobantes[0],
  );
  protected readonly esActual = computed(
    () => this.seleccion()?.id === this.pago()?.comprobantes[0]?.id,
  );
  protected readonly puedeDecidir = computed(() => {
    const pago = this.pago(),
      comprobante = this.seleccion();
    return !!(pago && comprobante && puedeRevisarPago(pago, comprobante.id));
  });
  protected readonly siguiente = computed(
    () =>
      this.fuente
        .pagos()
        .find(
          (p) =>
            p.pedido.codigo !== this.codigo() &&
            p.pedido.estadoPago === 'pendiente' &&
            p.pedido.estadoEntrega !== 'cancelado' &&
            p.comprobantes.length,
        )?.pedido.codigo,
  );
  protected readonly coincideMonto = computed(() => {
    const monto = this.seleccion()?.monto,
      total = this.pago()?.pedido.total;
    return monto == null || total == null
      ? null
      : Math.round(monto * 100) === Math.round(total * 100);
  });
  protected readonly accion = signal<AccionPagoAdmin | null>(null);
  private readonly aviso = signal({ codigo: '', texto: '' });
  protected readonly mensaje = computed(() =>
    this.aviso().codigo === this.codigo() ? this.aviso().texto : '',
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
  protected motivo(codigo?: string) {
    return (
      MOTIVOS_REVISION_PAGO.find((m) => m.codigo === codigo)?.nombre ?? 'Observación registrada'
    );
  }
  protected mostrarActual() {
    this.seleccionId.set(this.pago()?.comprobantes[0]?.id ?? '');
  }
  protected registrado(accion: AccionPagoAdmin) {
    this.accion.set(null);
    this.aviso.set({
      codigo: this.codigo(),
      texto:
        accion === 'aprobado'
          ? 'Pago aprobado y pedido confirmado. Las unidades siguen reservadas.'
          : accion === 'observado'
            ? 'Observación guardada. El cliente puede corregir su comprobante desde el seguimiento.'
            : 'Pago rechazado y reservas activas liberadas. El pedido conserva su historial.',
    });
    this.mostrarActual();
  }
}
