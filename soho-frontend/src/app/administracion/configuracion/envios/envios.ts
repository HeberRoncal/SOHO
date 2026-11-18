import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icono } from '../../../compartido/componentes/icono/icono';
import { EnviosEstado } from './envios-estado';
@Component({
  selector: 'app-configuracion-envios',
  imports: [FormsModule, Icono],
  templateUrl: './envios.html',
  styleUrl: './envios.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EnviosEstado],
  host: { '(window:beforeunload)': 'antesDeSalir($event)' },
})
export class Envios implements OnInit {
  readonly estado = inject(EnviosEstado);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  ngOnInit() {
    void this.estado.cargar();
  }
  puedeSalir() {
    if (this.estado.guardando()) return false;
    return (
      !this.estado.cambios() ||
      window.confirm('Tienes cambios sin guardar en Envíos. ¿Quieres salir y descartarlos?')
    );
  }
  antesDeSalir(evento: BeforeUnloadEvent) {
    if (this.estado.cambios() || this.estado.guardando()) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  }
  revisarEstado() {
    if (
      !this.estado.cambios() ||
      window.confirm(
        'Consultar el estado guardado reemplazará los cambios locales. ¿Quieres continuar?',
      )
    )
      void this.estado.cargar();
  }
  async guardar() {
    await this.estado.guardar();
    if (this.estado.esError())
      afterNextRender(
        {
          read: () =>
            this.elemento.nativeElement
              .querySelector<HTMLElement>('[aria-invalid="true"]')
              ?.focus(),
        },
        { injector: this.injector },
      );
  }
}
