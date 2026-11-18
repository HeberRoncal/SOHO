import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ProductosAdministracion } from '../../servicios/productos-administracion';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-historial-inventario',
  styleUrl: './historial-inventario.css',
  templateUrl: './historial-inventario.html',
})
export class HistorialInventario {
  readonly productoId = input('');
  readonly registrar = output<string>();
  protected readonly fuente = inject(ProductosAdministracion);
  protected readonly busqueda = signal('');
  protected readonly tipo = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly origen = signal('');
  protected readonly pagina = signal(1);
  protected readonly errorFechas = computed(
    () => !!(this.desde() && this.hasta() && this.desde() > this.hasta()),
  );
  protected readonly hayFiltros = computed(
    () => !!(this.busqueda() || this.tipo() || this.desde() || this.hasta() || this.origen()),
  );
  protected readonly historial = computed(() =>
    this.fuente
      .movimientos()
      .filter((m) => !this.productoId() || m.productoId === this.productoId()),
  );
  protected readonly filas = computed(() => (this.errorFechas() ? [] : this.historial()));
  private readonly formato = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  });
  protected fecha(valor: string) {
    return this.formato.format(new Date(valor));
  }
  protected cambiar(campo: 'busqueda' | 'tipo' | 'desde' | 'hasta' | 'origen', evento: Event) {
    this.pagina.set(1);
    this[campo].set((evento.target as HTMLInputElement).value);
  }
  protected limpiar() {
    this.pagina.set(1);
    this.origen.set('');
    this.busqueda.set('');
    this.tipo.set('');
    this.desde.set('');
    this.hasta.set('');
  }
  private filtros() {
    return {
      producto: this.productoId(),
      busqueda: this.busqueda(),
      tipo: this.tipo(),
      origen: this.origen(),
      desde: this.desde(),
      hasta: this.hasta(),
      pagina: String(this.pagina()),
    };
  }
  protected cargar() {
    if (!this.errorFechas()) void this.fuente.cargarMovimientos(this.filtros());
  }
  constructor() {
    effect(() => {
      const filtros = this.filtros(),
        invalido = this.errorFechas();
      if (!invalido) untracked(() => void this.fuente.cargarMovimientos(filtros));
    });
  }
}
