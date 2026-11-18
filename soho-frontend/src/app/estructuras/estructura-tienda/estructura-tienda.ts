import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
  computed,
} from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { PresentacionTienda } from '../servicios/presentacion-tienda';
import { CabeceraTienda } from '../componentes/cabecera-tienda/cabecera-tienda';
import { PieTienda } from '../componentes/pie-tienda/pie-tienda';
import { PanelTienda } from '../componentes/panel-tienda/panel-tienda';

@Component({
  selector: 'app-estructura-tienda',
  imports: [RouterOutlet, CabeceraTienda, PieTienda, PanelTienda],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estructura-tienda.html',
  styleUrl: './estructura-tienda.css',
})
export class EstructuraTienda {
  private readonly router = inject(Router);
  private readonly navegacion = toSignal(
    this.router.events.pipe(filter((evento) => evento instanceof NavigationEnd)),
  );
  protected readonly compra = computed(() => {
    const url = this.navegacion()?.urlAfterRedirects ?? this.router.url;
    return /^\/(finalizar-compra|pedido\/|iniciar-sesion(?:[?#]|$)|crear-cuenta(?:[?#]|$)|verificar-correo(?:[?#]|$)|recuperar-contrasena(?:[?#]|$)|restablecer-contrasena(?:[?#]|$)|sesion-no-disponible(?:[?#]|$)|sin-permiso(?:[?#]|$))/.test(
      url,
    );
  });
  private readonly cabecera = viewChild('cabecera', { read: ElementRef<HTMLElement> });

  constructor() {
    const presentacion = inject(PresentacionTienda);
    inject(Router)
      .events.pipe(
        filter((evento) => evento instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => presentacion.cerrar());
    const desplazamiento = inject(ViewportScroller);
    desplazamiento.setOffset(() => [
      0,
      Math.ceil(this.cabecera()?.nativeElement.getBoundingClientRect().height ?? 110) + 24,
    ]);
    inject(DestroyRef).onDestroy(() => desplazamiento.setOffset([0, 0]));
  }
}
