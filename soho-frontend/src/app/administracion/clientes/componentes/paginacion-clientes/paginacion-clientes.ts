import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PAGINA_CLIENTES, PaginaClientes } from '../../modelos/consulta-clientes-api';
@Component({
  selector: 'app-paginacion-clientes',
  imports: [],
  templateUrl: './paginacion-clientes.html',
  styleUrl: './paginacion-clientes.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginacionClientes {
  readonly pagina = input<PaginaClientes>(PAGINA_CLIENTES);
  readonly etiqueta = input('clientes');
  readonly cambiar = output<number>();
}
