import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pedidos } from '../../../pedidos/servicios/pedidos';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { Cuenta } from '../../servicios/cuenta';
import { identidadCuenta } from '../../modelos/cuenta';
import { estadoPedido } from '../../../pedidos/modelos/pedido';
@Component({
  imports: [RouterLink, Icono, PrecioProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pedidos-cuenta',
  styleUrl: './pedidos-cuenta.css',
  templateUrl: './pedidos-cuenta.html',
})
export class PedidosCuenta {
  readonly limite = input(0);
  protected readonly fuente = inject(Pedidos);
  private readonly cuenta = inject(Cuenta);
  private readonly identidadUsuario = computed(() => identidadCuenta(this.cuenta.perfil()));
  protected readonly estado = estadoPedido;
  protected readonly estadosPago = {
    pendiente: 'Pago pendiente',
    observado: 'Comprobante observado',
    aprobado: 'Pago aprobado',
    rechazado: 'Pago rechazado',
    anulado: 'Pago anulado',
  } as const;
  protected fechaCancelacion(valor: string) {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(valor));
  }
  protected readonly pedidos = computed(() => {
    const pedidos = this.fuente.listarMios();
    return this.limite() ? pedidos.slice(0, this.limite()) : pedidos;
  });
  constructor() {
    effect(() => {
      this.identidadUsuario();
      if (untracked(() => this.cuenta.perfil()?.id))
        untracked(() => {
          void this.fuente.cargarMios();
        });
    });
  }
  protected cargar(pagina = this.fuente.paginacion().pagina) {
    void this.fuente.cargarMios(pagina);
  }
  protected fecha(valor: string) {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeZone: 'America/Lima',
    }).format(new Date(valor));
  }
}
