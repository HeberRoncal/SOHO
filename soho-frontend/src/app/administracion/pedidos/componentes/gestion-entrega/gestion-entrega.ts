import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
  viewChild,
  effect,
} from '@angular/core';
import { PedidoAdmin } from '../../modelos/pedido-admin';
import {
  AccionEntregaAdmin,
  PASOS_ENTREGA_ADMIN,
  accionEntregaDisponible,
} from '../../modelos/entrega-admin';
import { FormularioEntrega } from '../formulario-entrega/formulario-entrega';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { FormularioCancelacion } from '../formulario-cancelacion/formulario-cancelacion';
import { puedeCancelarPedido } from '../../modelos/cancelacion-admin';
import { FormularioRecuperacionReservas } from '../formulario-recuperacion-reservas/formulario-recuperacion-reservas';
@Component({
  selector: 'app-gestion-entrega',
  imports: [FormularioEntrega, FormularioCancelacion, FormularioRecuperacionReservas, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gestion-entrega.html',
  styleUrl: './gestion-entrega.css',
})
export class GestionEntrega {
  readonly pedido = input.required<PedidoAdmin>();
  protected readonly pasos = PASOS_ENTREGA_ADMIN;
  protected readonly indice = computed(() =>
    this.pasos.findIndex((p) => p.estado === this.pedido().estadoEntrega),
  );
  protected readonly disponible = computed(() => accionEntregaDisponible(this.pedido()));
  private readonly formulario = viewChild(FormularioEntrega);
  private readonly formularioCancelacion = viewChild(FormularioCancelacion);
  private readonly formularioRecuperacion = viewChild(FormularioRecuperacionReservas);
  protected readonly recuperarAbierto = signal(false);
  puedeSalir() {
    return (
      (this.formulario()?.puedeSalir() ?? true) &&
      (this.formularioCancelacion()?.puedeSalir() ?? true) &&
      (this.formularioRecuperacion()?.puedeSalir() ?? true)
    );
  }
  tieneCambiosPendientes() {
    return !!(
      this.formulario()?.tieneBorrador() ||
      this.formulario()?.ocupado() ||
      this.formularioCancelacion()?.tieneBorrador() ||
      this.formularioCancelacion()?.ocupado() ||
      this.formularioRecuperacion()?.tieneBorrador() ||
      this.formularioRecuperacion()?.ocupado()
    );
  }
  constructor() {
    let codigo = '';
    effect(() => {
      const actual = this.pedido().codigo;
      if (codigo && codigo !== actual) {
        this.accion.set(null);
        this.cancelarAbierto.set(false);
        this.liberarAbierto.set(false);
        this.recuperarAbierto.set(false);
      }
      codigo = actual;
    });
  }
  protected readonly registrosEnvio = computed(() => {
    const e = this.pedido().datosEnvio,
      r = this.pedido().responsablesEnvio;
    return e
      ? [
          {
            titulo: 'Preparación iniciada',
            fecha: e.preparacionIniciadaEn,
            responsable: r?.preparacion?.nombre,
          },
          { titulo: 'Despachado', fecha: e.despachadoEn, responsable: r?.despacho?.nombre },
          { titulo: 'Entregado', fecha: e.entregadoEn, responsable: r?.entrega?.nombre },
        ].filter(
          (
            v,
          ): v is typeof v & {
            fecha: string;
          } => !!v.fecha,
        )
      : [];
  });
  protected readonly accion = signal<AccionEntregaAdmin | null>(null);
  protected recuperado(comprobado: boolean) {
    this.recuperarAbierto.set(false);
    this.aviso.set({
      codigo: this.pedido().codigo,
      texto: comprobado
        ? 'Recuperación comprobada al consultar el pedido. El pago conserva su estado de revisión.'
        : 'Reservas recuperadas. El pago conserva su estado de revisión.',
    });
  }
  protected readonly puedeCancelar = computed(() => puedeCancelarPedido(this.pedido()));
  protected readonly cancelarAbierto = signal(false);
  protected readonly liberarAbierto = signal(false);
  protected readonly puedeLiberar = computed(
    () =>
      this.pedido().estadoEntrega === 'cancelado' &&
      ['aprobado', 'anulado'].includes(this.pedido().estadoPago) &&
      !!this.pedido().reservasCancelacion?.puedeLiberarRetenidas,
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
  protected cancelado() {
    const liberar = this.liberarAbierto();
    this.cancelarAbierto.set(false);
    this.liberarAbierto.set(false);
    this.aviso.set({
      codigo: this.pedido().codigo,
      texto: liberar
        ? 'Reservas retenidas liberadas. El pedido sigue cancelado.'
        : 'Cancelación registrada. Revisa el estado del pago y las reservas.',
    });
  }
  private readonly aviso = signal({ codigo: '', texto: '' });
  protected readonly mensaje = computed(() =>
    this.aviso().codigo === this.pedido().codigo ? this.aviso().texto : '',
  );
  protected registrado(accion: AccionEntregaAdmin) {
    this.accion.set(null);
    this.aviso.set({
      codigo: this.pedido().codigo,
      texto:
        accion === 'preparar'
          ? 'Preparación registrada.'
          : accion === 'enviar'
            ? 'Envío registrado. Las unidades se descontaron del stock físico.'
            : 'Entrega registrada. El pedido quedó en consulta.',
    });
  }
}
