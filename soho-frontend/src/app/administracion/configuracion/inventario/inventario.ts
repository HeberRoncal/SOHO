import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icono } from '../../../compartido/componentes/icono/icono';
import { InventarioEstado } from './inventario-estado';
import type { BorradorReserva } from './contrato-reservas';
@Component({
  selector: 'app-configuracion-inventario',
  imports: [FormsModule, Icono],
  templateUrl: './inventario.html',
  styleUrl: './inventario.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InventarioEstado],
  host: { '(window:beforeunload)': 'antesDeSalir($event)' },
})
export class Inventario implements OnInit {
  readonly estado = inject(InventarioEstado);
  private readonly resumen = viewChild<ElementRef<HTMLElement>>('resumen');
  ngOnInit() {
    void this.estado.cargar();
  }
  cambiar(cambio: Partial<BorradorReserva>) {
    this.estado.cambiar(cambio);
  }
  actualizar() {
    void this.estado.cargar(true);
  }
  puedeSalir() {
    return (
      !this.estado.guardando() &&
      (!this.estado.cambios() ||
        window.confirm('¿Salir y descartar los cambios de reservas sin guardar?'))
    );
  }
  antesDeSalir(e: BeforeUnloadEvent) {
    if (this.estado.cambios() || this.estado.guardando()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  descartar() {
    if (
      !this.estado.cambios() ||
      window.confirm('¿Descartar el borrador de configuración de reservas?')
    )
      this.estado.descartar();
  }
  async guardar() {
    await this.estado.guardar();
    if (this.estado.listaErrores().length)
      setTimeout(() => this.resumen()?.nativeElement.focus(), 0);
  }
  fecha(valor: string) {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(valor));
  }
}
