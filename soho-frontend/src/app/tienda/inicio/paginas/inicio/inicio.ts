import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { Portada } from '../../componentes/portada/portada';
import { Marcas } from '../../componentes/marcas/marcas';
import { Colecciones } from '../../componentes/colecciones/colecciones';
import { EscaparateProductos } from '../../componentes/escaparate-productos/escaparate-productos';
import { Campana } from '../../componentes/campana/campana';
import { FUENTE_CATALOGO } from '../../../catalogo/modelos/fuente-catalogo';

@Component({
  selector: 'app-inicio',
  imports: [Portada, Marcas, Colecciones, EscaparateProductos, Campana],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  private readonly catalogo = inject(FUENTE_CATALOGO);
  protected readonly novedades = computed(() =>
    this.catalogo.consultar({ soloNovedades: true }).slice(0, 4),
  );
  protected readonly destacados = computed(() =>
    this.catalogo.consultar({ soloDestacados: true }).slice(0, 12),
  );
}
