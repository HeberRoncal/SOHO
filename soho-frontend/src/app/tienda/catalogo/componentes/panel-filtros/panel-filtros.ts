import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { FiltrosCatalogo } from '../filtros-catalogo/filtros-catalogo';
import {
  FiltrosCatalogo as CriteriosCatalogo,
  OrdenCatalogo,
} from '../../modelos/filtros-catalogo';
import { EtiquetaFiltro } from '../../modelos/etiqueta-filtro';

@Component({
  selector: 'app-panel-filtros',
  imports: [VentanaDialogo, Icono, FiltrosCatalogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './panel-filtros.html',
  styleUrl: './panel-filtros.css',
})
export class PanelFiltros {
  readonly abierto = input(false);
  readonly criterios = input<CriteriosCatalogo>({});
  readonly etiquetas = input<readonly EtiquetaFiltro[]>([]);
  readonly orden = input<OrdenCatalogo>('relevancia');
  readonly cantidad = input(0);
  readonly precioInvalido = input(false);
  readonly cerrado = output<void>();
  readonly cambiados = output<CriteriosCatalogo>();
  readonly ordenCambiado = output<OrdenCatalogo>();
  readonly borrarSolicitado = output<void>();
  protected readonly puedeBorrar = computed(
    () =>
      this.orden() !== 'relevancia' ||
      this.etiquetas().some((etiqueta) => !etiqueta.conservarAlLimpiar),
  );
  protected readonly ordenes: readonly { valor: OrdenCatalogo; texto: string }[] = [
    { valor: 'relevancia', texto: 'Relevancia' },
    { valor: 'precio-ascendente', texto: 'Precio: de menor a mayor' },
    { valor: 'novedades', texto: 'Novedades' },
    { valor: 'precio-descendente', texto: 'Precio: de mayor a menor' },
  ];
}
