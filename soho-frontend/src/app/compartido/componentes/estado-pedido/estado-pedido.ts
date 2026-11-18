import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EstadoPago, EstadoPreparacion, Pedido } from '../../../tienda/pedidos/modelos/pedido';

@Component({
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-estado-pedido',
  styleUrl: './estado-pedido.css',
  templateUrl: './estado-pedido.html',
})
export class EstadoPedido {
  readonly pedido = input<Pedido | null>(null);
  protected readonly pagos: Record<EstadoPago, string> = {
    pendiente: 'Pendiente de revisión',
    aprobado: 'Pago aprobado',
    rechazado: 'Comprobante rechazado',
    observado: 'Comprobante observado',
    anulado: 'Pago anulado',
  };
  protected readonly preparacion: Record<EstadoPreparacion, string> = {
    pendiente: 'Esperando validación del pago',
    confirmado: 'Pedido confirmado',
    incidencia: 'Incidencia en la entrega',
    'en-preparacion': 'En preparación',
    enviado: 'En camino',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };
}
