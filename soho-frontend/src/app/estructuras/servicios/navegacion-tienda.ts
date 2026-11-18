import { computed, inject, Injectable } from '@angular/core';
import { FUENTE_CATALOGO } from '../../tienda/catalogo/modelos/fuente-catalogo';
import { NavegacionCatalogo } from '../../tienda/catalogo/servicios/navegacion-catalogo';
import { FiltrosCatalogo } from '../../tienda/catalogo/modelos/filtros-catalogo';
import { GrupoNavegacion } from '../modelos/grupo-navegacion';
import { EnlaceNavegacion } from '../modelos/enlace-navegacion';
import { nombreCategoriaTienda } from '../../tienda/catalogo/modelos/nombre-categoria';

const ROTULOS_NOVEDADES: Readonly<Record<string, string>> = {
  Clásicos: 'Recién llegados',
  Urbano: 'Más vendidos',
  'Uso diario': 'Ediciones limitadas',
};

@Injectable({ providedIn: 'root' })
export class NavegacionTienda {
  private readonly catalogo = inject(FUENTE_CATALOGO);
  private readonly navegacion = inject(NavegacionCatalogo);
  private readonly gruposActuales = computed<readonly GrupoNavegacion[]>(() => [
    this.crearSeccion('zapatillas-novedades', 'Novedades'),
    this.crearSeccion('zapatillas-hombre', 'Hombre'),
    this.crearSeccion('zapatillas-mujer', 'Mujer'),
    this.crearMarcas(),
    this.crearSeccion('zapatillas-ofertas', 'Ofertas'),
  ]);
  get grupos(): readonly GrupoNavegacion[] {
    return this.gruposActuales();
  }

  private crearSeccion(ruta: string, nombre: string): GrupoNavegacion {
    const seccion = this.navegacion.obtenerSeccion(ruta);
    const esNovedades = ruta === 'zapatillas-novedades';
    const esGenero = ruta === 'zapatillas-hombre' || ruta === 'zapatillas-mujer';
    const principal = this.crearEnlace('Ver todas', seccion.filtros, ruta);
    if (ruta === 'zapatillas-ofertas') {
      return {
        identificador: ruta,
        nombre,
        principal,
        destacado: true,
        enlaceDirecto: true,
        enlaces: [],
      };
    }
    const categorias =
      this.catalogo.opciones?.secciones[ruta] ??
      [
        ...new Set(this.catalogo.consultar(seccion.filtros).map((producto) => producto.categoria)),
      ].sort((a, b) => a.localeCompare(b, 'es-PE'));
    return {
      identificador: ruta,
      nombre,
      titulo: esNovedades ? undefined : 'Zapatillas',
      tituloEnlazado: esGenero,
      principal,
      destacado: ruta === 'zapatillas-ofertas',
      enlaces: [
        ...(esNovedades || esGenero ? [] : [principal]),
        ...categorias.map((categoria) =>
          this.crearEnlace(
            esNovedades
              ? (ROTULOS_NOVEDADES[categoria] ?? categoria)
              : esGenero
                ? nombreCategoriaTienda(categoria)
                : categoria === 'Urbano'
                  ? 'Urbanas'
                  : categoria,
            { ...seccion.filtros, categorias: [categoria] },
            ruta,
          ),
        ),
      ],
    };
  }

  private crearMarcas(): GrupoNavegacion {
    const principal: EnlaceNavegacion = {
      texto: 'Ver todas',
      ruta: '/',
      parametros: {},
      fragmento: 'marcas',
    };
    const marcas = [...new Set(this.catalogo.marcas.map((marca) => marca.nombre))].sort((a, b) =>
      a.localeCompare(b, 'es-PE'),
    );
    return {
      identificador: 'marcas',
      nombre: 'Marcas',
      principal,
      destacado: false,
      enlaces: [principal, ...marcas.map((marca) => this.crearEnlace(marca, { marcas: [marca] }))],
    };
  }

  private crearEnlace(texto: string, filtros: FiltrosCatalogo, seccion?: string): EnlaceNavegacion {
    const destino = this.navegacion.crearDestino(filtros, 'relevancia', seccion);
    return { texto, ruta: destino.ruta, parametros: destino.parametros };
  }
}
