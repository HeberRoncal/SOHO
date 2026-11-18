import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { SolicitudesAdministracion } from '../../servicios/solicitudes-administracion';
import {
  ACCIONES_SOLICITUD,
  AccionSolicitud,
  EvidenciaSolicitud,
  MOTIVOS_SOLICITUD,
  pedidoAdmiteSolicitud,
} from '../../modelos/solicitud-admin';
import { EstadoSolicitudComponent } from '../../componentes/estado-solicitud/estado-solicitud';
import { DecisionSolicitudComponent } from '../../componentes/decision-solicitud/decision-solicitud';
import { EstadoPedidoAdmin } from '../../../pedidos/componentes/estado-pedido-admin/estado-pedido-admin';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  selector: 'app-detalle-solicitud',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    EstadoSolicitudComponent,
    DecisionSolicitudComponent,
    EstadoPedidoAdmin,
    PrecioProducto,
    VentanaDialogo,
    Icono,
  ],
  templateUrl: './detalle-solicitud.html',
  styleUrls: ['../../cambios-admin.css', './detalle-solicitud.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetalleSolicitud {
  protected readonly fuente = inject(SolicitudesAdministracion);
  private readonly ruta = inject(ActivatedRoute);
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  protected readonly solicitud = computed(() =>
    this.fuente.obtener(this.parametros().get('identificador') ?? ''),
  );
  protected readonly pedido = computed(() => this.fuente.pedido(this.solicitud()?.pedido ?? ''));
  protected readonly pedidoValido = computed(() => pedidoAdmiteSolicitud(this.pedido()));
  protected readonly varianteActual = computed(() =>
    this.fuente
      .variantes(this.solicitud()?.articulo.sku ?? '')
      .find((v) => v.sku === this.solicitud()?.variante?.sku),
  );
  protected readonly accion = signal<AccionSolicitud | null>(null);
  protected readonly evidencia = signal<EvidenciaSolicitud | null>(null);
  protected readonly mensaje = signal('');
  protected readonly errorNota = signal('');
  protected readonly nota = inject(FormBuilder).nonNullable.control('');
  protected readonly motivos = MOTIVOS_SOLICITUD;
  protected readonly acciones = ACCIONES_SOLICITUD;
  private readonly formato = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  });
  constructor() {
    effect(() => {
      this.parametros();
      this.nota.setValue('');
      this.errorNota.set('');
      this.mensaje.set('');
      this.accion.set(null);
      this.evidencia.set(null);
    });
  }
  protected fecha(valor: string) {
    return this.formato.format(new Date(valor));
  }
  protected registrado() {
    this.accion.set(null);
    this.mensaje.set(
      'Acción simulada registrada en el historial. Los pagos e inventario conservan sus datos.',
    );
  }
  protected guardarNota() {
    const resultado = this.fuente.guardarNota(
      this.solicitud()?.identificador ?? '',
      this.nota.value,
    );
    this.errorNota.set(resultado.error ?? '');
    if (resultado.ok) {
      this.nota.setValue('');
      this.mensaje.set('Nota interna guardada en esta demostración. No se envió al cliente.');
    }
  }
}
