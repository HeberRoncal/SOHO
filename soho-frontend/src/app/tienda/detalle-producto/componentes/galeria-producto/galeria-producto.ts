import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';

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
  private readonly cintaMiniaturas = viewChild<ElementRef<HTMLDivElement>>('cintaMiniaturas');
  protected readonly imagen = computed(() => this.imagenes()[this.indice()] ?? this.imagenes()[0]);
  constructor() {
    effect(() => {
      this.imagenes();
      this.indice.set(0);
      this.ampliada.set(false);
      const cinta = this.cintaMiniaturas()?.nativeElement;
      if (cinta) cinta.scrollTop = 0;
    });
  }
  protected seleccionar(indice: number) {
    if (indice >= 0 && indice < this.imagenes().length) this.indice.set(indice);
  }
  protected desplazarMiniaturas(direccion: -1 | 1) {
    const cinta = this.cintaMiniaturas()?.nativeElement;
    if (cinta)
      cinta.scrollBy({
        top: direccion * cinta.clientHeight * 0.75,
        behavior: 'auto',
      });
  }
}
