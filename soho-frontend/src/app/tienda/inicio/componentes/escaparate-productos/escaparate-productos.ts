import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { Producto } from '../../../catalogo/modelos/producto';
import { FiltrosCatalogo } from '../../../catalogo/modelos/filtros-catalogo';
import { TarjetaProducto } from '../../../catalogo/componentes/tarjeta-producto/tarjeta-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PresentacionTienda } from '../../../../estructuras/servicios/presentacion-tienda';

@Component({
  selector: 'app-escaparate-productos',
  imports: [TarjetaProducto, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './escaparate-productos.html',
  styleUrl: './escaparate-productos.css',
})
export class EscaparateProductos {
  readonly titulo = input('Zapatillas');
  readonly identificador = input('seleccion');
  readonly productos = input<readonly Producto[]>([]);
  readonly filtros = input<FiltrosCatalogo>({});
  readonly deslizable = input(false);
  protected readonly presentacion = inject(PresentacionTienda);
  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  protected readonly hayAnterior = signal(false);
  protected readonly haySiguiente = signal(true);
  protected actualizarDesplazamiento() {
    const elemento = this.lista()?.nativeElement;
    if (!elemento) return;
    this.hayAnterior.set(elemento.scrollLeft > 4);
    this.haySiguiente.set(elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 4);
  }
  protected desplazar(direccion: number) {
    const elemento = this.lista()?.nativeElement;
    const reducirMovimiento = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    elemento?.scrollBy({
      left: direccion * elemento.clientWidth * 0.8,
      behavior: reducirMovimiento ? 'instant' : 'smooth',
    });
  }
}
