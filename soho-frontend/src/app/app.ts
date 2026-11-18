import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Cuenta } from './tienda/cuenta/servicios/cuenta';
import { esRutaPrivada } from './tienda/cuenta/modelos/validacion-cuenta';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly cuenta = inject(Cuenta);
  protected readonly comprobandoRuta = toSignal(
    inject(Router).events.pipe(
      filter(
        (evento) =>
          evento instanceof NavigationStart ||
          evento instanceof NavigationEnd ||
          evento instanceof NavigationCancel ||
          evento instanceof NavigationError ||
          evento instanceof NavigationSkipped,
      ),
      map((evento) => evento instanceof NavigationStart && esRutaPrivada(evento.url)),
    ),
    { initialValue: esRutaPrivada(location.pathname) },
  );
}
