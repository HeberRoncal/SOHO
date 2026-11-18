import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ESTADOS_PAGO_ADMIN, ESTADOS_ENTREGA_ADMIN } from '../../modelos/pedido-admin';
import { Icono } from '../../../../compartido/componentes/icono/icono';
@Component({
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-estado-pedido-admin',
  styleUrl: './estado-pedido-admin.css',
  templateUrl: './estado-pedido-admin.html',
})
export class EstadoPedidoAdmin {
  readonly tipo = input<'pago' | 'entrega'>('pago');
  readonly estado = input('pendiente');
  readonly compacto = input(false);
  protected readonly etiqueta = computed(() => {
    if (this.compacto() && this.tipo() === 'pago') {
      const etiquetas: Readonly<Record<string, string>> = {
        pendiente: 'Pendientes',
        observado: 'Observados',
        aprobado: 'Aprobados',
        rechazado: 'Rechazados',
        anulado: 'Anulados',
      };
      return etiquetas[this.estado()] ?? 'Estado no disponible';
    }
    if (this.compacto() && this.tipo() === 'entrega' && this.estado() === 'pendiente')
      return 'Esperando pago';
    const etiquetas: Readonly<Record<string, string>> =
      this.tipo() === 'pago' ? ESTADOS_PAGO_ADMIN : ESTADOS_ENTREGA_ADMIN;
    return etiquetas[this.estado()] ?? 'Estado no disponible';
  });
  protected readonly tono = computed(() =>
    ['aprobado', 'entregado'].includes(this.estado())
      ? 'positivo'
      : ['rechazado', 'cancelado', 'incidencia'].includes(this.estado())
        ? 'negativo'
        : this.estado() === 'observado' || (this.tipo() === 'pago' && this.estado() === 'pendiente')
          ? 'advertencia'
          : 'neutro',
  );
  protected readonly icono = computed(() =>
    this.compacto() && this.tipo() === 'entrega' && this.estado() === 'entregado'
      ? 'casa'
      : this.compacto() && this.tipo() === 'pago' && this.estado() === 'observado'
        ? 'informacion'
        : ['aprobado', 'entregado', 'confirmado'].includes(this.estado())
          ? 'verificar'
          : this.estado() === 'enviado'
            ? 'camion'
            : this.estado() === 'en-preparacion'
              ? 'paquete'
              : ['observado', 'rechazado', 'incidencia'].includes(this.estado())
                ? 'alerta'
                : ['cancelado', 'anulado'].includes(this.estado())
                  ? 'cerrar'
                  : 'reloj',
  );
}
