import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { EstadoConsulta, PaginaCatalogo } from './modelos/catalogo-api';
import { FUENTE_CATALOGO } from './modelos/fuente-catalogo';
import { NavegacionCatalogo } from './servicios/navegacion-catalogo';
import { FiltrosCatalogo as CriteriosCatalogo, OrdenCatalogo } from './modelos/filtros-catalogo';
import { PanelFiltros } from './componentes/panel-filtros/panel-filtros';
import { EtiquetaFiltro } from './modelos/etiqueta-filtro';
import { SISTEMA_TALLAS } from './modelos/variante-producto';
import { TarjetaProducto } from './componentes/tarjeta-producto/tarjeta-producto';
import { Icono } from '../../compartido/componentes/icono/icono';

@Component({
  selector: 'app-catalogo',
  imports: [PanelFiltros, TarjetaProducto, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalogo.html',
  styleUrl: './catalogo.css',
})
export class Catalogo {
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navegacion = inject(NavegacionCatalogo);
  private readonly catalogo = inject(FUENTE_CATALOGO);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  private readonly datosRuta = toSignal(this.ruta.data, { initialValue: this.ruta.snapshot.data });
  private readonly seccion = computed(() =>
    this.navegacion.obtenerSeccion(this.datosRuta()['seccion']),
  );
  protected readonly estado = computed(() =>
    this.navegacion.leerConSeccion(this.parametros(), this.seccion().ruta),
  );
  protected readonly filtros = computed(() => this.estado().filtros);
  private readonly intento = signal(0);
  protected readonly paginaActual = computed(() => {
    const pagina = Number(this.parametros().get('pagina') ?? 1);
    return Number.isInteger(pagina) && pagina > 0 && pagina <= 10000 ? pagina : 1;
  });
  private readonly solicitud = computed(() => ({
    filtros: this.filtros(),
    orden: this.estado().orden,
    pagina: this.paginaActual(),
    intento: this.intento(),
  }));
  protected readonly respuesta = toSignal(
    toObservable(this.solicitud).pipe(
      switchMap(({ filtros, orden, pagina }) => {
        const invalidos =
          filtros.precioMinimo !== undefined &&
          filtros.precioMaximo !== undefined &&
          filtros.precioMinimo > filtros.precioMaximo;
        const locales =
          !this.catalogo.consultarPagina && !invalidos
            ? this.catalogo.consultar(filtros, orden)
            : [];
        const consulta =
          !invalidos && this.catalogo.consultarPagina
            ? this.catalogo.consultarPagina(filtros, orden, pagina)
            : of({
                productos: locales.slice((pagina - 1) * 12, pagina * 12),
                paginacion: {
                  pagina,
                  limite: 12,
                  total: locales.length,
                  paginas: Math.ceil(locales.length / 12),
                },
              });
        return consulta.pipe(
          map((datos): EstadoConsulta<PaginaCatalogo> => ({ estado: 'listo', datos })),
          catchError(() => of<EstadoConsulta<PaginaCatalogo>>({ estado: 'error' })),
          startWith<EstadoConsulta<PaginaCatalogo>>({ estado: 'cargando' }),
        );
      }),
    ),
    { initialValue: { estado: 'cargando' } as EstadoConsulta<PaginaCatalogo> },
  );
  protected readonly resultado = computed(() => {
    const r = this.respuesta();
    return r.estado === 'listo' ? r.datos : undefined;
  });
  protected readonly productos = computed(() => this.resultado()?.productos ?? []);
  protected readonly total = computed(() => this.resultado()?.paginacion.total ?? 0);
  protected readonly paginas = computed(() => this.resultado()?.paginacion.paginas ?? 0);
  protected reintentar() {
    this.intento.update((n) => n + 1);
  }
  protected cambiarPagina(pagina: number, replaceUrl = false) {
    if (pagina < 1 || pagina > this.paginas()) return;
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { pagina: pagina === 1 ? null : pagina },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
  constructor() {
    effect(() => {
      if (this.paginas() > 0 && this.paginaActual() > this.paginas())
        this.cambiarPagina(this.paginas(), true);
    });
  }
  protected readonly filtrosAbiertos = signal(
    this.router.currentNavigation()?.extras.state?.['panelFiltrosAbierto'] === true,
  );
  protected readonly titulo = computed(() => {
    const filtros = this.filtros();
    if (filtros.busqueda) return 'Resultados de búsqueda';
    return this.seccion().titulo;
  });
  protected readonly precioInvalido = computed(() => {
    const filtros = this.filtros();
    return (
      filtros.precioMinimo !== undefined &&
      filtros.precioMaximo !== undefined &&
      filtros.precioMinimo > filtros.precioMaximo
    );
  });
  protected readonly etiquetas = computed(() => {
    const filtros = this.filtros();
    const etiquetas: EtiquetaFiltro[] = [];
    for (const campo of ['marcas', 'categorias', 'colores', 'tallas'] as const) {
      for (const valor of filtros[campo] ?? []) {
        const nombre =
          campo === 'colores'
            ? (this.catalogo.opciones?.colores.find((color) => color.codigo === valor)?.nombre ??
              this.catalogo.productos
                .flatMap((producto) => producto.colores)
                .find((color) => color.codigo === valor)?.nombre ??
              valor)
            : valor;
        etiquetas.push({
          texto: campo === 'tallas' ? 'Talla ' + SISTEMA_TALLAS + ' ' + nombre : nombre,
          quitar: () =>
            this.cambiarFiltros({
              ...this.filtros(),
              [campo]: this.filtros()[campo]?.filter((actual) => actual !== valor),
            }),
        });
      }
    }
    for (const genero of filtros.generos ?? (filtros.genero ? [filtros.genero] : [])) {
      etiquetas.push({
        texto: genero,
        conservarAlLimpiar: genero === this.seccion().filtros.genero,
        quitar: () => {
          const actuales = this.filtros();
          this.cambiarFiltros({
            ...actuales,
            genero: undefined,
            generos: (actuales.generos ?? (actuales.genero ? [actuales.genero] : [])).filter(
              (actual) => actual !== genero,
            ),
          });
        },
      });
    }
    for (const [campo, texto] of [
      ['busqueda', filtros.busqueda ? 'Búsqueda: ' + filtros.busqueda : undefined],
      [
        'precioMinimo',
        filtros.precioMinimo !== undefined ? 'Desde S/ ' + filtros.precioMinimo : undefined,
      ],
      [
        'precioMaximo',
        filtros.precioMaximo !== undefined ? 'Hasta S/ ' + filtros.precioMaximo : undefined,
      ],
      [
        'soloNovedades',
        filtros.soloNovedades && !this.seccion().filtros.soloNovedades ? 'Novedades' : undefined,
      ],
      [
        'soloOfertas',
        filtros.soloOfertas && !this.seccion().filtros.soloOfertas ? 'Ofertas' : undefined,
      ],
    ] as const) {
      if (texto)
        etiquetas.push({
          texto,
          quitar: () => this.cambiarFiltros({ ...this.filtros(), [campo]: undefined }),
        });
    }
    return etiquetas;
  });
  protected cambiarFiltros(filtros: CriteriosCatalogo) {
    this.navegar(filtros, this.estado().orden);
  }
  protected ordenar(orden: string) {
    const valido = ['relevancia', 'precio-ascendente', 'precio-descendente', 'novedades'].includes(
      orden,
    )
      ? (orden as OrdenCatalogo)
      : 'relevancia';
    this.navegar(this.filtros(), valido);
  }
  protected limpiar() {
    this.navegar(this.seccion().filtros, 'relevancia');
  }
  private navegar(filtros: CriteriosCatalogo, orden: OrdenCatalogo) {
    const destino = this.navegacion.crearDestino(filtros, orden, this.seccion().ruta);
    void this.router.navigate([destino.ruta], {
      queryParams: destino.parametros,
      state: { panelFiltrosAbierto: this.filtrosAbiertos() },
    });
  }
}
