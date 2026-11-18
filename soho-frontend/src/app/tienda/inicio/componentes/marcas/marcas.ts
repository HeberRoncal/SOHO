import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FUENTE_CATALOGO } from '../../../catalogo/modelos/fuente-catalogo';
import { MARCAS_CON_LOGOTIPO } from '../../../catalogo/datos/logotipos-marcas';
import { PresentacionTienda } from '../../../../estructuras/servicios/presentacion-tienda';

@Component({
  selector: 'app-marcas',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marcas.html',
  styleUrl: './marcas.css',
})
export class Marcas {
  protected readonly catalogo = inject(FUENTE_CATALOGO);
  protected readonly marcas = computed(() => {
    const actuales = this.catalogo.marcas;
    const nombres = new Set(actuales.map((marca) => marca.nombre.toLowerCase().replace(/\s/g, '')));
    return [
      ...actuales,
      ...MARCAS_CON_LOGOTIPO.filter(
        (marca) => !nombres.has(marca.nombre.toLowerCase().replace(/\s/g, '')),
      ),
    ];
  });
  protected readonly presentacion = inject(PresentacionTienda);
}
