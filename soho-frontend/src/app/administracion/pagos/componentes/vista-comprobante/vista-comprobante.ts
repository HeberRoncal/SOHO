import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { PagosAdministracionApi } from '../../servicios/pagos-administracion-api';
import { NgTemplateOutlet } from '@angular/common';
import { PedidoAdmin } from '../../../pedidos/modelos/pedido-admin';
import { ComprobanteAdmin } from '../../modelos/pago-admin';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
@Component({
  selector: 'app-vista-comprobante',
  imports: [NgTemplateOutlet, Icono, VentanaDialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vista-comprobante.html',
  styleUrl: './vista-comprobante.css',
})
export class VistaComprobante {
  private readonly injector = inject(Injector);
  protected readonly imagen = signal('');
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  private secuencia = 0;
  private limpiarImagen() {
    if (this.imagen()) URL.revokeObjectURL(this.imagen());
    this.imagen.set('');
  }
  protected async cargar() {
    const pedido = this.pedido(),
      comprobante = this.comprobante(),
      secuencia = ++this.secuencia;
    this.limpiarImagen();
    this.error.set('');

    this.cargando.set(true);
    try {
      const blob = await this.injector
        .get(PagosAdministracionApi)
        .comprobante(pedido.codigo, comprobante.id);
      if (secuencia !== this.secuencia) return;
      this.imagen.set(URL.createObjectURL(blob));
    } catch {
      if (secuencia === this.secuencia)
        this.error.set('No pudimos abrir el comprobante privado. Inténtalo nuevamente.');
    } finally {
      if (secuencia === this.secuencia) this.cargando.set(false);
    }
  }
  readonly pedido = input.required<PedidoAdmin>();
  readonly comprobante = input.required<ComprobanteAdmin>();
  protected readonly zoom = signal(100);
  protected readonly rotacion = signal(0);
  protected readonly ampliado = signal(false);
  constructor() {
    effect(() => {
      this.comprobante();
      this.zoom.set(100);
      this.rotacion.set(0);
      untracked(() => void this.cargar());
    });
    inject(DestroyRef).onDestroy(() => {
      this.secuencia++;
      this.limpiarImagen();
    });
  }
  protected cambiarZoom(delta: number) {
    this.zoom.update((v) => Math.max(75, Math.min(200, v + delta)));
  }
  protected restablecer() {
    this.zoom.set(100);
    this.rotacion.set(0);
  }
}
