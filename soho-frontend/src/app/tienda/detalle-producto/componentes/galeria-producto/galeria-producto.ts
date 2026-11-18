import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { Icono } from '../../../../compartido/componentes/icono/icono';
import { ZoomImagen } from '../../../../compartido/directivas/zoom-imagen';
import { VisorImagenes } from '../visor-imagenes/visor-imagenes';

@Component({
  selector: 'app-galeria-producto',
  imports: [Icono, VisorImagenes, ZoomImagen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './galeria-producto.html',
  styleUrl: './galeria-producto.css',
})
export class GaleriaProducto {
  readonly imagenes = input<readonly string[]>([]);
  readonly descripcion = input('Producto');
  protected readonly indice = signal(0);
  protected readonly ampliada = signal(false);
  protected readonly imagen = computed(() => this.imagenes()[this.indice()] ?? this.imagenes()[0]);
  constructor() {
    effect(() => {
      this.imagenes();
      this.indice.set(0);
      this.ampliada.set(false);
    });
  }
  protected seleccionar(indice: number) {
    if (indice >= 0 && indice < this.imagenes().length) this.indice.set(indice);
  }
}
