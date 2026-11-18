import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { ProductoAdministracion, resumenInventario } from '../../modelos/producto-administracion';
import { VarianteProducto } from '../../../../tienda/catalogo/modelos/variante-producto';
import { EstadoConsultaProductos } from '../../modelos/consulta-productos-api';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';

@Component({
  imports: [VentanaDialogo, PrecioProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vista-producto',
  styleUrl: './vista-producto.css',
  templateUrl: './vista-producto.html',
})
export class VistaProducto {
  readonly abierto = input(false);
  readonly estado = input<EstadoConsultaProductos>('lista');
  readonly mensaje = input('');
  readonly reintentar = output<void>();
  readonly verHistorial = output<string>();
  readonly producto = input<ProductoAdministracion | null>(null);
  readonly tabInicial = input<'datos' | 'variantes'>('datos');
  readonly cerrado = output<void>();
  protected readonly pestana = signal<'datos' | 'variantes'>('datos');
  protected readonly inventario = computed(() =>
    this.producto() ? resumenInventario(this.producto()!) : null,
  );
  constructor() {
    effect(() => {
      this.producto();
      this.pestana.set(this.tabInicial());
    });
  }
  protected color(codigo: string) {
    return this.producto()?.colores.find((c) => c.codigo === codigo)?.nombre ?? codigo;
  }
  protected disponible(variante: VarianteProducto) {
    return variante.habilitada ? Math.max(0, variante.existencias - variante.cantidadReservada) : 0;
  }
}
