import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  afterNextRender,
  Injector,
  ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProductosAdministracion } from '../../servicios/productos-administracion';
import {
  DisponibilidadAdmin,
  EstadoProductoAdmin,
  FILTROS_ADMIN_INICIALES,
  FiltrosProductosAdmin,
  OrdenProductosAdmin,
  ProductoAdministracion,
  resumenInventario,
} from '../../modelos/producto-administracion';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { VistaProducto } from '../../componentes/vista-producto/vista-producto';
import { HistorialInventario } from '../../componentes/historial-inventario/historial-inventario';
import {
  EstadoProducto,
  SolicitudEstadoProducto,
  ResultadoEstadoProducto,
} from '../../componentes/estado-producto/estado-producto';
import { NuevoProductoModal } from '../../componentes/nuevo-producto-modal/nuevo-producto-modal';

@Component({
  imports: [
    RouterLink,
    Icono,
    PrecioProducto,
    VistaProducto,
    HistorialInventario,
    EstadoProducto,
    NuevoProductoModal,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-listado-productos',
  styleUrls: ['./listado-productos.css', './tabla-productos.css'],
  templateUrl: './listado-productos.html',
})
export class ListadoProductos {
  protected readonly nuevoProductoAbierto = signal(false);
  private readonly nuevoProducto = viewChild<NuevoProductoModal>('nuevoProducto');
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly formularioEstado = viewChild(EstadoProducto);
  protected readonly estadoSolicitado = signal<SolicitudEstadoProducto | null>(null);
  protected rutaListado() {
    this.parametros();
    return this.router.url;
  }
  puedeSalir(): boolean | Promise<boolean> {
    if (this.nuevoProductoAbierto()) return this.nuevoProducto()?.puedeSalir() ?? true;
    return this.formularioEstado()?.puedeSalir() ?? true;
  }
  protected abrirArchivo(producto: ProductoAdministracion) {
    this.estadoSolicitado.set({ productoId: producto.identificador, accion: 'ARCHIVAR' });
  }
  protected estadoCompletado(r: ResultadoEstadoProducto) {
    this.estadoSolicitado.set(null);
    this.notificacion.set(
      r.tipo === 'ARCHIVAR'
        ? `Producto archivado: ${r.nombre}. Sus pedidos y reservas se conservan.`
        : r.tipo === 'RESTAURAR'
          ? `Producto restaurado como borrador: ${r.nombre}.`
          : `Operación recuperada: ${r.nombre} · ${r.estado}.`,
    );
    afterNextRender(
      () => this.elemento.nativeElement.querySelector<HTMLElement>('.notificacion')?.focus(),
      { injector: this.injector },
    );
    const paginas = Math.max(1, this.fuente.paginacion().paginas);
    if (this.pagina() > paginas)
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { pagina: String(paginas) },
        queryParamsHandling: 'merge',
      });
  }
  protected readonly fuente = inject(ProductosAdministracion);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly marcas = computed(() => this.fuente.opciones().marcas.map((m) => m.slug));
  protected readonly categorias = computed(() =>
    this.fuente.opciones().categorias.map((c) => c.slug),
  );
  protected readonly filtros = computed<FiltrosProductosAdmin>(() => {
    const q = this.parametros();
    const estado = q.get('estado') ?? '';
    const disponibilidad = q.get('disponibilidad') ?? '';
    return {
      busqueda: (q.get('busqueda') ?? '').slice(0, 120),
      marca: q.get('marca') ?? '',
      categoria: q.get('categoria') ?? '',
      estado: ['publicado', 'borrador', 'archivado'].includes(estado)
        ? (estado as EstadoProductoAdmin)
        : '',
      disponibilidad: ['disponible', 'bajo', 'agotado'].includes(disponibilidad)
        ? (disponibilidad as DisponibilidadAdmin)
        : '',
    };
  });
  protected readonly orden = computed<OrdenProductosAdmin>(() => {
    const valor = this.parametros().get('orden') ?? 'catalogo';
    return ['catalogo', 'nombre', 'precio-ascendente', 'precio-descendente', 'stock'].includes(
      valor,
    )
      ? (valor as OrdenProductosAdmin)
      : 'catalogo';
  });
  protected readonly vista = computed(() => {
    const estado = this.fuente.estadoListado();
    return estado === 'error'
      ? 'error'
      : estado !== 'lista'
        ? 'cargando'
        : !this.fuente.paginacion().total && !this.hayFiltros()
          ? 'vacio'
          : 'normal';
  });
  protected readonly resultados = computed(() =>
    this.fuente
      .productos()
      .map((producto) => ({ producto, inventario: resumenInventario(producto) })),
  );
  protected readonly hayFiltros = computed(() => Object.values(this.filtros()).some(Boolean));
  protected readonly seleccionado = signal<string | null>(null);
  protected readonly productoVisto = computed(() =>
    this.fuente.detalleActual()?.identificador === this.seleccionado()
      ? this.fuente.detalleActual()
      : null,
  );
  protected readonly tabVista = signal<'datos' | 'variantes'>('datos');
  protected readonly notificacion = signal('');
  protected readonly historialAbierto = computed(
    () => this.parametros().get('tab') === 'movimientos',
  );
  protected readonly historialProducto = computed(
    () => this.parametros().get('inventarioProducto') ?? '',
  );
  protected verHistorial(id: string) {
    this.seleccionado.set(null);
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { tab: 'movimientos', inventarioProducto: id, producto: null },
      queryParamsHandling: 'merge',
    });
  }
  protected todosLosMovimientos() {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { inventarioProducto: null },
      queryParamsHandling: 'merge',
    });
  }
  protected cambiarPestana(historial: boolean) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { tab: historial ? 'movimientos' : null },
      queryParamsHandling: 'merge',
    });
  }
  protected actualizar(campo: keyof FiltrosProductosAdmin, evento: Event) {
    const valor = (evento.target as HTMLInputElement).value;
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { [campo]: valor || null, pagina: null },
      queryParamsHandling: 'merge',
      replaceUrl: campo === 'busqueda',
    });
  }
  protected cambiarOrden(evento: Event) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        pagina: null,
        orden:
          (evento.target as HTMLSelectElement).value === 'catalogo'
            ? null
            : (evento.target as HTMLSelectElement).value,
      },
      queryParamsHandling: 'merge',
    });
  }
  protected reintentarListado() {
    this.cargar();
    if (this.fuente.estadoOpciones() === 'error') void this.fuente.cargarOpciones();
  }
  protected limpiar() {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        ...Object.fromEntries(Object.keys(FILTROS_ADMIN_INICIALES).map((k) => [k, null])),
        pagina: null,
      },
      queryParamsHandling: 'merge',
    });
  }
  protected abrir(producto: ProductoAdministracion, tab: 'datos' | 'variantes' = 'datos') {
    this.tabVista.set(tab);
    this.seleccionado.set(producto.identificador);
    void this.fuente.cargarDetalle(producto.identificador);
  }
  protected nombreOpcion(tipo: 'marcas' | 'categorias', slug: string) {
    return this.fuente.opciones()[tipo].find((o) => o.slug === slug)?.nombre ?? slug;
  }
  protected readonly pagina = computed(() => {
    const n = Number(this.parametros().get('pagina') ?? '1');
    return Number.isInteger(n) && n > 0 && n <= 100000 ? n : 1;
  });
  protected cambiarPagina(pagina: number) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { pagina: pagina === 1 ? null : pagina },
      queryParamsHandling: 'merge',
    });
  }
  protected cargar() {
    void this.fuente.cargarListado({
      ...this.filtros(),
      orden: this.orden(),
      pagina: String(this.pagina()),
    });
  }
  protected cerrarDetalle() {
    this.seleccionado.set(null);
    if (this.parametros().has('producto'))
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { producto: null },
        queryParamsHandling: 'merge',
      });
  }
  protected reintentarDetalle() {
    const id = this.seleccionado();
    if (id) void this.fuente.cargarDetalle(id);
  }
  constructor() {
    void this.fuente.cargarOpciones();
    effect(() => {
      const filtros = this.filtros(),
        orden = this.orden(),
        pagina = this.pagina();
      untracked(
        () => void this.fuente.cargarListado({ ...filtros, orden, pagina: String(pagina) }),
      );
    });
    effect(() => {
      const id = this.parametros().get('producto');
      if (id)
        untracked(() => {
          this.seleccionado.set(id);
          this.tabVista.set('variantes');
          void this.fuente.cargarDetalle(id);
        });
    });
  }
  protected restaurar(producto: ProductoAdministracion) {
    this.estadoSolicitado.set({ productoId: producto.identificador, accion: 'RESTAURAR' });
  }
}
