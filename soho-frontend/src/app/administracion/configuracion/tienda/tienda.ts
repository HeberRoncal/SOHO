import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TiendaEstado } from './tienda-estado';
import { DatosTienda } from './contrato-tienda';
@Component({
  selector: 'app-configuracion-tienda',
  imports: [FormsModule],
  providers: [TiendaEstado],
  host: {
    '(window:beforeunload)': 'antesDeSalir($event)',
  },
  templateUrl: './tienda.html',
  styleUrl: './tienda.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tienda {
  readonly estado = inject(TiendaEstado);
  ngOnInit() {
    void this.estado.cargar();
  }
  puedeSalir() {
    return (
      (!this.estado.cambios() && !this.estado.pendiente()) ||
      window.confirm('Hay cambios sin guardar o un envío pendiente de confirmar. ¿Quieres salir?')
    );
  }
  antesDeSalir(evento: BeforeUnloadEvent) {
    if (this.estado.cambios() || this.estado.pendiente()) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  }
  readonly politicas = [
    { clave: 'cambios' as const, titulo: 'Cambios y devoluciones' },
    { clave: 'privacidad' as const, titulo: 'Privacidad y datos personales' },
    { clave: 'terminos' as const, titulo: 'Términos y condiciones' },
  ];
  cambiar(cambio: Partial<DatosTienda>) {
    this.estado.actualizar(cambio);
  }
  politica(clave: keyof DatosTienda['politicas'], valor: string) {
    this.cambiar({ politicas: { ...this.estado.borrador().politicas, [clave]: valor } });
  }
}
