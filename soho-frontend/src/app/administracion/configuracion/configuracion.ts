import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-configuracion',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './configuracion.html',
  styleUrls: ['./configuracion-controles.css', './configuracion.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Configuracion {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destruccion = inject(DestroyRef);
  readonly pestanas = [
    { ruta: 'pagos', nombre: 'Pagos' },
    { ruta: 'envios', nombre: 'Envíos' },
    { ruta: 'inventario', nombre: 'Inventario' },
    { ruta: 'tienda', nombre: 'Tienda' },
  ] as const;
  constructor() {
    afterNextRender(() => {
      const navegacion = this.elemento.nativeElement.querySelector<HTMLElement>('.config-tabs');
      if (!navegacion || typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(() => {
        const activa = navegacion.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
        if (activa) this.mostrarApartado(activa);
      });
      observador.observe(navegacion);
      this.destruccion.onDestroy(() => observador.disconnect());
    });
  }
  mostrarApartado(enlace: HTMLAnchorElement) {
    setTimeout(() => {
      const navegacion = enlace.parentElement;
      if (enlace.isConnected && navegacion && navegacion.scrollWidth > navegacion.clientWidth)
        navegacion.scrollTo({ left: Math.max(0, enlace.offsetLeft - 14) });
    });
  }
}
