import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  afterNextRender,
  Injector,
  input,
  output,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import {
  MovimientosInventarioApi,
  ErrorMovimientoInventario,
} from '../../servicios/movimientos-inventario-api';
import { VarianteInventarioAdmin } from '../../modelos/movimientos-inventario-api';
import { EdicionProductosApi, ErrorEdicionProducto } from '../../servicios/edicion-productos-api';
import {
  ArchivoProducto,
  ImagenGaleria,
  OpcionesEdicionProductos,
  ProductoEdicion,
} from '../../modelos/edicion-productos-api';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { identidadCuenta } from '../../../../tienda/cuenta/modelos/cuenta';
import { ProductosAdministracion } from '../../servicios/productos-administracion';

const VACIO = {
  nombre: '',
  descripcion: '',
  grupo: '',
  marcaId: '',
  modelo: '',
  codigoModelo: '',
  colorCodigo: '',
  colorNombre: '',
  hexadecimal: '#FFFFFF',
  categoriaId: '',
  genero: 'UNISEX',
  precio: '',
  precioAnterior: '',
  esNovedad: false,
  ordenCatalogo: 0,
  ordenColor: 0,
};
const INCIDENCIAS: Record<string, string> = {
  IDENTIDAD_INCOMPLETA: 'Completa el grupo de modelo, la marca y el color.',
  MARCA_NO_ACTIVA: 'Selecciona una marca activa.',
  CATEGORIA_NO_ACTIVA: 'Selecciona una categoría activa.',
  DATOS_MODELO_INCOHERENTES: 'Revisa la identidad del modelo y su color.',
  PRECIO_INVALIDO: 'Define un precio positivo y un precio anterior mayor, si corresponde.',
  VARIANTE_HABILITADA_REQUERIDA: 'Agrega al menos una talla habilitada.',
  RELACIONES_COLOR_INCOHERENTES: 'Las variantes deben corresponder al color de esta ficha.',
  SKU_O_TALLA_INCOHERENTES: 'Revisa las tallas y los SKU registrados.',
  GALERIA_INCOMPLETA: 'Guarda entre una y diez fotografías, con la portada primero.',
  FOTOGRAFIA_NO_DISPONIBLE: 'Espera a que las fotografías estén disponibles y guarda la galería.',
};
@Component({
  selector: 'app-editor-producto',
  imports: [ReactiveFormsModule, RouterLink, VentanaDialogo, CurrencyPipe, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.en-modal]': 'enModal()' },
  templateUrl: './editor-producto.html',
  styleUrls: [
    './formulario-producto.css',
    './barra-guardar.css',
    './estados-formulario.css',
    './editor-producto.css',
    './completar-borrador.css',
  ],
})
export class EditorProducto {
  readonly enModal = input(false);
  readonly volverA = input<string | null>(null);
  readonly cancelado = output<void>();
  private readonly api = inject(EdicionProductosApi);
  private readonly stockApi = inject(MovimientosInventarioApi);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cuenta = inject(Cuenta);
  private readonly identidadUsuario = computed(() => identidadCuenta(this.cuenta.perfil()));
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destruccion = inject(DestroyRef);
  private readonly fuente = inject(ProductosAdministracion);
  private readonly injector = inject(Injector);
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  protected readonly idRuta = computed(() => this.parametros().get('identificador'));
  protected readonly regreso = computed(() => {
    const r = this.volverA() ?? this.ruta.snapshot.queryParamMap?.get('volver') ?? '';
    return this.router.parseUrl(
      /^\/admin\/productos(?:\?[^#]*)?$/.test(r) ? r : '/admin/productos',
    );
  });
  protected readonly ficha = signal<ProductoEdicion | null>(null);
  protected readonly alta = computed(() => !this.idRuta() && !this.ficha());
  protected readonly completando = computed(
    () => !this.enModal() && this.ficha()?.producto.estado === 'borrador',
  );
  protected readonly pasoBorrador = signal<'variantes' | 'fotos' | 'publicacion'>('variantes');
  protected readonly editandoDatos = signal(false);
  protected readonly cantidadesStock = signal<
    Record<string, { valor: string; base: number; reservado: number }>
  >({});
  protected readonly stockPendiente = signal(false);
  protected readonly stockCambiado = computed(() => Object.keys(this.cantidadesStock()).length > 0);
  protected readonly tallasGuardadas = computed(
    () =>
      this.ficha()
        ?.producto.variantes.filter((v) => v.habilitada)
        .map((v) => v.talla)
        .join(' · ') || 'Sin tallas',
  );
  protected readonly opciones = signal<OpcionesEdicionProductos>({
    marcas: [],
    categorias: [],
    gruposModelo: [],
    tallas: [],
  });
  protected readonly formulario = inject(FormBuilder).nonNullable.group({ ...VACIO });
  private readonly valores = toSignal(this.formulario.valueChanges, {
    initialValue: this.formulario.getRawValue(),
  });
  protected readonly marcaSeleccionada = computed(
    () => this.opciones().marcas.find((marca) => marca.id === this.valores().marcaId)?.nombre ?? '',
  );
  protected readonly nuevasTallas = signal<string[]>([]);
  protected readonly galeria = signal<ImagenGaleria[]>([]);
  protected readonly archivos = signal<ArchivoProducto[]>([]);
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly incidencias = signal<string[]>([]);
  protected readonly aviso = signal('');
  protected readonly pendiente = signal(false);
  protected readonly conflicto = signal(false);
  protected readonly reintentoDisponible = signal(true);
  protected readonly confirmadoSinActualizar = signal(false);
  private ultimoConfirmado: {
    ficha: ProductoEdicion;
    aviso: string;
    conservarGaleria: boolean;
  } | null = null;
  protected readonly fotosConfiguradas = signal(false);
  protected readonly carga = signal<{
    clave: string;
    productoId: string;
    version: number;
    nombre: string;
  } | null>(null);
  protected readonly consultandoCarga = signal(false);
  protected readonly dialogo = signal<'salir' | 'publicar' | 'recargar' | null>(null);
  private readonly baseCampos = signal('');
  private readonly baseGaleria = signal('[]');
  private resolverSalida: ((valor: boolean) => void) | null = null;
  private turno = 0;
  private vivo = true;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private archivoEnMemoria: File | null = null;
  private cargaTuvoIncertidumbre = false;
  private navegandoGuardado = false;
  protected readonly publicado = computed(() => this.ficha()?.producto.estado === 'publicado');
  protected readonly soloConsulta = computed(() => this.ficha()?.producto.estado === 'archivado');
  protected readonly identidadFija = computed(
    () =>
      this.publicado() ||
      !!this.ficha()?.producto.variantes.length ||
      this.archivos().length > 0 ||
      this.galeria().length > 0,
  );
  protected readonly bloqueado = computed(
    () =>
      this.ocupado() ||
      this.pendiente() ||
      this.stockPendiente() ||
      this.conflicto() ||
      this.soloConsulta() ||
      (this.cargando() && !this.alta()) ||
      !!this.carga() ||
      this.confirmadoSinActualizar() ||
      this.cuenta.perfil()?.rol !== 'ADMIN',
  );
  private firma() {
    this.valores();
    return JSON.stringify(this.formulario.getRawValue());
  }
  protected readonly datosCambiados = computed(
    () => this.baseCampos() !== this.firma() || this.nuevasTallas().length > 0,
  );
  protected readonly galeriaCambiada = computed(
    () => this.baseGaleria() !== JSON.stringify(this.galeria()),
  );
  protected readonly cambios = computed(
    () => this.datosCambiados() || this.galeriaCambiada() || this.stockCambiado(),
  );
  protected readonly gruposMarca = computed(() => {
    const v = this.valores();
    return this.opciones().gruposModelo.filter((g) => !v.marcaId || g.marcaId === v.marcaId);
  });
  protected readonly tallasAgregables = computed(() =>
    this.opciones().tallas.filter(
      (t) => !this.ficha()?.producto.variantes.some((v) => v.talla === t),
    ),
  );
  protected readonly disponibles = computed(() =>
    this.archivos().filter(
      (a) => a.estado === 'DISPONIBLE' && !this.galeria().some((g) => g.archivoId === a.id),
    ),
  );
  protected readonly puedePublicar = computed(
    () =>
      this.ficha()?.producto.estado === 'borrador' &&
      !this.bloqueado() &&
      !this.cambios() &&
      !this.conflicto(),
  );
  protected readonly requisitos = computed(() => {
    const f = this.ficha(),
      p = f?.producto,
      faltan: string[] = [];
    if (!f?.grupo || !p?.colores.length) faltan.push('Grupo de modelo y color completos.');
    if (!f?.categoriaId) faltan.push('Una categoría activa.');
    if (!p?.precio) faltan.push('Un precio de venta positivo.');
    if (!p?.variantes.some((v) => v.habilitada)) faltan.push('Al menos una talla habilitada.');
    if (!this.galeria().length) faltan.push('Al menos una fotografía guardada como portada.');
    return faltan;
  });
  constructor() {
    effect(() => {
      const id = this.idRuta();
      this.identidadUsuario();
      untracked(() => {
        const perfil = this.cuenta.perfil();
        if (perfil?.rol !== 'ADMIN') {
          this.cantidadesStock.set({});
          this.stockPendiente.set(false);
          this.turno++;
          this.detenerSondeo();
          this.incorporar(null);
          this.galeria.set([]);
          this.baseGaleria.set('[]');
          this.archivos.set([]);
          this.carga.set(null);
          this.ocupado.set(false);
          this.consultandoCarga.set(false);
          this.archivoEnMemoria = null;
          this.pendiente.set(false);
          this.ultimoConfirmado = null;
          this.confirmadoSinActualizar.set(false);
          this.cargando.set(false);
          this.dialogo.set(null);
          this.resolverSalida?.(true);
          this.resolverSalida = null;
          this.error.set('Inicia sesión como administrador para gestionar productos.');
          return;
        }
        void this.iniciar(id);
      });
    });
    const salir = (e: BeforeUnloadEvent) => {
      if (
        this.cambios() ||
        this.pendiente() ||
        this.stockPendiente() ||
        this.carga() ||
        this.ocupado()
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', salir);
    this.destruccion.onDestroy(() => {
      this.vivo = false;
      this.turno++;
      this.detenerSondeo();
      window.removeEventListener('beforeunload', salir);
      this.resolverSalida?.(false);
    });
  }
  private async iniciar(id: string | null) {
    this.cantidadesStock.set({});
    try {
      this.stockPendiente.set(!!this.stockApi.pendiente());
    } catch {
      this.stockPendiente.set(true);
    }
    const turno = ++this.turno;
    this.pasoBorrador.set('variantes');
    this.editandoDatos.set(false);
    this.detenerSondeo();
    this.incorporar(null);
    this.galeria.set([]);
    this.archivos.set([]);
    this.baseGaleria.set('[]');
    this.cargando.set(true);
    this.error.set('');
    this.conflicto.set(false);
    this.carga.set(null);
    this.consultandoCarga.set(false);
    this.archivoEnMemoria = null;
    this.confirmadoSinActualizar.set(false);
    this.ultimoConfirmado = null;
    this.leerPendiente();
    if (this.enModal() && !id)
      afterNextRender(
        () => this.elemento.nativeElement.querySelector<HTMLElement>('#producto-nombre')?.focus(),
        { injector: this.injector },
      );
    try {
      const [opciones, ficha, fotos, config] = await Promise.all([
        this.api.opciones(),
        id ? this.api.detalle(id) : null,
        id ? this.api.fotografias(id) : null,
        id ? this.api.configuracion().catch(() => null) : null,
      ]);
      if (!this.vivo || turno !== this.turno) return;
      if (ficha && fotos && (ficha.version !== fotos.version || fotos.productoId !== id))
        throw Error('La ficha cambió durante la consulta.');
      this.opciones.set(opciones);
      this.fotosConfiguradas.set(config?.configurada === true);
      if (id) this.incorporar(ficha);
      this.galeria.set(fotos?.imagenes ?? []);
      this.archivos.set(fotos?.archivos ?? []);
      this.baseGaleria.set(JSON.stringify(this.galeria()));
      this.leerPendiente();
      this.restaurarCarga();
    } catch (e) {
      if (turno === this.turno && this.vivo) this.mostrarError(e);
    } finally {
      if (turno === this.turno && this.vivo) {
        this.cargando.set(false);
      }
    }
  }
  private leerPendiente() {
    try {
      this.pendiente.set(!!this.api.pendiente());
      this.reintentoDisponible.set(true);
    } catch (e) {
      this.pendiente.set(true);
      this.reintentoDisponible.set(false);
      this.mostrarError(e);
    }
  }
  private incorporar(f: ProductoEdicion | null) {
    this.ficha.set(f);
    const p = f?.producto,
      c = p?.colores[0];
    if (f?.grupo && p?.modelo && p.codigoModelo) {
      const grupo = {
        ...f.grupo,
        marcaId: f.marcaId,
        modelo: p.modelo,
        codigoModelo: p.codigoModelo,
      };
      this.opciones.update((o) => ({
        ...o,
        gruposModelo: [...o.gruposModelo.filter((g) => g.id !== grupo.id), grupo],
      }));
    }
    this.formulario.reset({
      ...VACIO,
      nombre: p?.nombre ?? '',
      descripcion: p?.descripcion ?? '',
      grupo: f?.grupo?.id ?? '',
      marcaId: f?.marcaId ?? '',
      modelo: p?.modelo ?? '',
      codigoModelo: p?.codigoModelo ?? '',
      colorCodigo: c?.codigo ?? '',
      colorNombre: c?.nombre ?? '',
      hexadecimal: c?.hexadecimal ?? '#FFFFFF',
      categoriaId: f?.categoriaId ?? '',
      genero: p?.genero.toUpperCase() ?? 'UNISEX',
      precio: p?.precio?.toFixed(2) ?? '',
      precioAnterior: p?.precioAnterior?.toFixed(2) ?? '',
      esNovedad: p?.esNovedad ?? false,
      ordenCatalogo: f?.ordenCatalogo ?? 0,
      ordenColor: f?.ordenColor ?? 0,
    });
    this.nuevasTallas.set([]);
    this.baseCampos.set(this.firma());
  }
  protected seleccionarGrupo() {
    const g = this.opciones().gruposModelo.find(
      (g) => g.id === this.formulario.controls.grupo.value,
    );
    if (g)
      this.formulario.patchValue({
        marcaId: g.marcaId,
        modelo: g.modelo,
        codigoModelo: g.codigoModelo,
      });
  }
  protected irSeccion(evento: Event, id: string) {
    evento.preventDefault();
    const panel = this.elemento.nativeElement.querySelector<HTMLElement>('#sec-' + id);
    panel?.scrollIntoView({ block: 'start' });
    panel?.focus({ preventScroll: true });
  }
  protected cambiarPaso(paso: 'variantes' | 'fotos' | 'publicacion') {
    if (this.bloqueado()) return;
    this.editandoDatos.set(false);
    this.pasoBorrador.set(paso);
    this.enfocarSeccion(
      paso === 'variantes' ? 'precio' : paso === 'fotos' ? 'fotos' : 'publicacion',
    );
  }
  protected editarDatos() {
    if (this.bloqueado()) return;
    this.editandoDatos.set(!this.editandoDatos());
    this.enfocarSeccion(
      this.editandoDatos()
        ? 'general'
        : this.pasoBorrador() === 'variantes'
          ? 'precio'
          : this.pasoBorrador() === 'fotos'
            ? 'fotos'
            : 'publicacion',
    );
  }
  private enfocarSeccion(id: string) {
    afterNextRender(
      () => {
        const panel = this.elemento.nativeElement.querySelector<HTMLElement>('#sec-' + id);
        panel?.scrollIntoView({ block: 'start' });
        panel?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
  protected async continuarBorrador() {
    if (!this.completando() || this.bloqueado()) return;
    if (this.cambios()) await this.guardarCambios();
    if (this.bloqueado() || this.cambios()) return;
    if (this.editandoDatos()) {
      this.editarDatos();
      return;
    }
    this.cambiarPaso(this.pasoBorrador() === 'variantes' ? 'fotos' : 'publicacion');
  }
  protected usarComoPortada(indice: number) {
    if (this.bloqueado()) return;
    this.galeria.update((galeria) => {
      const foto = galeria[indice];
      return foto ? [foto, ...galeria.filter((_, i) => i !== indice)] : galeria;
    });
  }
  protected marcaGrupo(id: string) {
    return this.opciones().marcas.find((m) => m.id === id)?.codigo ?? '';
  }
  protected elegirTalla(talla: string, evento: Event) {
    if (this.publicado() || this.bloqueado()) return;
    if (!(evento.target as HTMLInputElement).checked) {
      this.cantidadesStock.update((valores) => {
        const siguientes = { ...valores };
        delete siguientes[talla];
        return siguientes;
      });
    }
    this.nuevasTallas.update((t) =>
      (evento.target as HTMLInputElement).checked ? [...t, talla] : t.filter((x) => x !== talla),
    );
  }
  private datos(): Record<string, unknown> {
    const v = this.formulario.getRawValue(),
      seleccionado = this.opciones().gruposModelo.find((g) => g.id === v.grupo);
    const grupo = this.identidadFija()
      ? this.ficha()?.grupo
      : seleccionado
        ? { id: seleccionado.id, version: seleccionado.version }
        : v.marcaId && v.modelo.trim() && v.codigoModelo.trim()
          ? {
              marcaId: v.marcaId,
              modelo: v.modelo.trim(),
              codigoModelo: v.codigoModelo.trim().toUpperCase(),
            }
          : null;
    if (!v.nombre.trim()) throw new ErrorEdicionProducto('Escribe el nombre del producto.');
    const importe = (s: string) => {
      if (!s.trim()) return null;
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(s) || Number(s) <= 0)
        throw new ErrorEdicionProducto('Escribe precios positivos con hasta dos decimales.');
      return Number(s).toFixed(2);
    };
    if (
      ![v.ordenCatalogo, v.ordenColor].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295,
      )
    )
      throw new ErrorEdicionProducto('Los órdenes deben ser números enteros entre 0 y 4294967295.');
    const comerciales = {
      nombre: v.nombre.trim(),
      descripcion: v.descripcion.trim(),
      categoriaId: v.categoriaId || null,
      genero: v.genero,
      precio: importe(v.precio),
      precioAnterior: importe(v.precioAnterior),
      esNovedad: v.esNovedad,
      ordenCatalogo: v.ordenCatalogo,
      ordenColor: v.ordenColor,
    };
    if (this.publicado()) {
      if (!comerciales.categoriaId || !comerciales.precio)
        throw new ErrorEdicionProducto(
          'Un publicado necesita una categoría activa y un precio positivo.',
        );
      if (
        comerciales.precioAnterior &&
        Number(comerciales.precioAnterior) <= Number(comerciales.precio)
      )
        throw new ErrorEdicionProducto('El precio anterior debe superar el precio de venta.');
      return comerciales;
    }
    if (
      !this.identidadFija() &&
      !seleccionado &&
      [v.marcaId, v.modelo.trim(), v.codigoModelo.trim()].some(Boolean) &&
      !grupo
    )
      throw new ErrorEdicionProducto(
        'Completa la marca, el modelo y su código, o deja los tres vacíos para continuar después.',
      );
    const color =
      v.colorCodigo.trim() || v.colorNombre.trim()
        ? {
            codigo: this.identidadFija()
              ? this.ficha()!.producto.colores[0].codigo
              : v.colorCodigo.trim().toUpperCase(),
            nombre: v.colorNombre.trim(),
            hexadecimal: v.hexadecimal,
          }
        : null;
    if (color && (!/^[A-Z]{2}$/.test(color.codigo) || !color.nombre))
      throw new ErrorEdicionProducto('El color necesita un código de dos letras y un nombre.');
    if (this.nuevasTallas().length && (!grupo || !color))
      throw new ErrorEdicionProducto(
        'Define el grupo de modelo y el color antes de agregar tallas.',
      );
    return {
      ...comerciales,
      grupoModelo: grupo ?? null,
      color,
      ...(this.nuevasTallas().length ? { tallas: this.nuevasTallas() } : {}),
    };
  }
  protected async guardarDatos() {
    if (this.cargando() || this.bloqueado() || this.conflicto() || !this.datosCambiados()) return;
    try {
      const datos = this.datos();
      await this.operar(
        () =>
          this.publicado()
            ? this.api.escribir(
                'ACTUALIZAR',
                this.ficha()!.producto.identificador,
                this.ficha()!.version,
                datos,
                'publicado',
              )
            : this.api.escribir(
                this.ficha() ? 'ACTUALIZAR' : 'CREAR',
                this.ficha()?.producto.identificador ?? null,
                this.ficha()?.version ?? null,
                datos,
              ),
        this.publicado()
          ? 'Cambios guardados. El producto continúa publicado.'
          : this.alta()
            ? 'Borrador creado. Completa el precio, las tallas y las fotografías antes de publicar.'
            : 'Cambios guardados. El producto continúa como borrador.',
        true,
      );
    } catch (e) {
      this.mostrarError(e);
    }
  }
  protected async guardarCambios() {
    if (this.bloqueado() || this.conflicto()) return;
    try {
      this.validarStock();
    } catch (e) {
      this.mostrarError(e);
      return;
    }
    if (this.datosCambiados()) await this.guardarDatos();
    if (!this.bloqueado() && !this.datosCambiados() && this.galeriaCambiada())
      await this.guardarGaleria();
    if (!this.bloqueado() && !this.datosCambiados() && !this.galeriaCambiada())
      await this.guardarStock();
  }
  private async operar(
    trabajo: () => Promise<ProductoEdicion>,
    aviso: string,
    conservarGaleria = false,
  ) {
    if (this.ocupado()) return;
    const turno = this.turno;
    this.ocupado.set(true);
    this.error.set('');
    this.incidencias.set([]);
    this.aviso.set('');
    try {
      const f = await trabajo();
      if (!this.vivo || turno !== this.turno) return;
      this.pendiente.set(false);
      this.conflicto.set(false);
      this.ultimoConfirmado = { ficha: f, aviso, conservarGaleria };
      this.confirmadoSinActualizar.set(true);
      await this.completarConfirmado(f, turno);
    } catch (e) {
      if (this.vivo && turno === this.turno) {
        this.leerPendiente();
        this.mostrarError(e);
      }
    } finally {
      if (this.vivo && turno === this.turno) this.ocupado.set(false);
    }
  }
  private async completarConfirmado(f: ProductoEdicion, turno: number) {
    const r = this.ultimoConfirmado;
    if (!r) return;
    try {
      const [fotos, actualizado] = await Promise.all([
        this.api.fotografias(f.producto.identificador),
        this.fuente.actualizarInventario(f.producto.identificador),
      ]);
      if (!this.vivo || turno !== this.turno) return;
      if (!actualizado || fotos.version !== f.version) throw Error('Consultas pendientes');
      this.incorporar(f);
      if (!r.conservarGaleria || !this.galeriaCambiada()) {
        this.galeria.set(fotos.imagenes);
        this.baseGaleria.set(JSON.stringify(fotos.imagenes));
      }
      this.archivos.set(fotos.archivos);
      this.aviso.set(r.aviso);
      this.error.set('');
      this.conflicto.set(false);
      this.confirmadoSinActualizar.set(false);
      this.ultimoConfirmado = null;
      if (this.idRuta() !== f.producto.identificador) {
        this.navegandoGuardado = true;
        try {
          const volver = this.volverA() ?? this.ruta.snapshot.queryParamMap?.get('volver');
          await this.router.navigate(['/admin/productos', f.producto.identificador, 'editar'], {
            replaceUrl: true,
            ...(volver && /^\/admin\/productos(?:\?[^#]*)?$/.test(volver)
              ? { queryParams: { volver } }
              : {}),
          });
        } finally {
          this.navegandoGuardado = false;
        }
      }
    } catch {
      if (this.vivo && turno === this.turno)
        this.error.set(
          'Operación confirmada. Actualiza las consultas para ver la ficha y fotografías vigentes; no se repetirá el guardado.',
        );
    }
  }
  protected async actualizarConsultas() {
    const r = this.ultimoConfirmado;
    if (!r || this.ocupado()) return;
    const turno = this.turno;
    this.ocupado.set(true);
    try {
      const f = await this.api.detalle(r.ficha.producto.identificador);
      await this.completarConfirmado(f, turno);
    } catch {
      if (turno === this.turno)
        this.error.set(
          'Operación confirmada. No se pudieron actualizar las consultas; vuelve a intentarlo.',
        );
    } finally {
      if (turno === this.turno) this.ocupado.set(false);
    }
  }
  protected recuperar(reintentar = false) {
    if (reintentar && !this.reintentoDisponible()) return;
    return this.operar(
      () => this.api.recuperar(reintentar),
      'Operación confirmada. Se cargó la versión actual de la ficha.',
    );
  }
  protected async guardarGaleria() {
    const f = this.ficha();
    if (!f || this.bloqueado() || this.datosCambiados() || this.conflicto()) return;
    const imagenes = this.galeria().map((i) => ({ ...i }));
    if (this.publicado() && !imagenes.length) {
      this.error.set('Un publicado necesita al menos una fotografía. Agrega una antes de guardar.');
      return;
    }
    await this.operar(
      () =>
        this.api.escribir('ACTUALIZAR_GALERIA', f.producto.identificador, f.version, { imagenes }),
      'Galería guardada. La primera fotografía es la portada.',
    );
  }
  protected agregarFoto(a: ArchivoProducto) {
    if (this.galeria().length < 10 && !this.galeria().some((g) => g.archivoId === a.id))
      this.galeria.update((g) => [...g, { archivoId: a.id, textoAlternativo: '' }]);
  }
  protected async restaurarFoto(a: ArchivoProducto) {
    if (this.bloqueado() || this.cambios() || this.galeria().length >= 10) return;
    this.agregarFoto(a);
    await this.guardarGaleria();
  }
  protected quitarFoto(i: number) {
    if (this.bloqueado() || (this.publicado() && this.galeria().length <= 1)) return;
    this.galeria.update((g) => g.filter((_, n) => n !== i));
  }
  protected moverFoto(i: number, delta: number) {
    this.galeria.update((g) => {
      const a = [...g],
        j = i + delta;
      if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }
  protected alternativa(i: number, e: Event) {
    const textoAlternativo = (e.target as HTMLInputElement).value;
    this.galeria.update((g) => g.map((a, n) => (n === i ? { ...a, textoAlternativo } : a)));
  }
  protected foto(id: string) {
    return this.archivos().find((a) => a.id === id);
  }
  private claveCarga() {
    return 'soho:carga-producto:' + this.cuenta.perfil()?.id;
  }
  private restaurarCarga() {
    try {
      const c = JSON.parse(sessionStorage.getItem(this.claveCarga()) ?? 'null');
      if (c && /^[\da-f-]{36}$/i.test(c.productoId) && /^[\da-f-]{36}$/i.test(c.clave)) {
        this.carga.set(c);
        this.cargaTuvoIncertidumbre = true;
        this.sondear(0);
      }
    } catch {
      /* Sin información recuperable de una carga anterior. */
    }
  }
  protected async subir(e: Event) {
    const input = e.target as HTMLInputElement;
    const archivos = Array.from(input.files ?? []);
    input.value = '';
    if (!archivos.length || this.bloqueado() || this.cambios()) return;
    if (archivos.length + this.galeria().length > 10) {
      this.error.set('Puedes agregar hasta 10 fotografías en total.');
      return;
    }
    if (
      archivos.some(
        (a) =>
          !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(a.type) ||
          a.size > 5242880 ||
          a.size === 0,
      )
    ) {
      this.error.set(
        'Selecciona fotografías JPG/JPEG, PNG, WebP o AVIF de hasta 5 MB por archivo.',
      );
      return;
    }
    const turno = this.turno;
    for (const archivo of archivos) {
      await this.subirUna(archivo);
      if (!this.vivo || turno !== this.turno || this.bloqueado() || this.cambios() || this.error())
        return;
    }
  }
  private async subirUna(archivo: File) {
    const f = this.ficha();
    if (!archivo || !f || this.bloqueado() || this.cambios()) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(archivo.type) ||
      archivo.size > 5242880 ||
      archivo.size === 0
    ) {
      this.error.set('Selecciona una fotografía JPEG, PNG, WebP o AVIF de hasta 5 MB.');
      return;
    }
    const carga = {
      clave: crypto.randomUUID(),
      productoId: f.producto.identificador,
      version: f.version,
      nombre: archivo.name,
    };
    try {
      sessionStorage.setItem(this.claveCarga(), JSON.stringify(carga));
    } catch {
      this.error.set('Habilita el almacenamiento de esta pestaña antes de subir fotografías.');
      return;
    }
    this.archivoEnMemoria = archivo;
    this.cargaTuvoIncertidumbre = false;
    this.carga.set(carga);
    await this.enviarCarga();
  }
  protected async enviarCarga() {
    const c = this.carga(),
      a = this.archivoEnMemoria;
    if (!c || !a || this.consultandoCarga()) return;
    const turno = this.turno;
    this.consultandoCarga.set(true);
    this.error.set('');
    try {
      const archivo = await this.api.subir(c.productoId, c.version, c.clave, a);
      if (this.vivo && turno === this.turno) await this.recibirCarga(archivo);
    } catch (e) {
      if (this.vivo && turno === this.turno) {
        if (e instanceof ErrorEdicionProducto && !e.incierto && !this.cargaTuvoIncertidumbre)
          this.limpiarCarga();
        else this.cargaTuvoIncertidumbre = true;
        this.mostrarError(e);
      }
    } finally {
      if (this.vivo && turno === this.turno) {
        this.consultandoCarga.set(false);
        if (this.carga()) this.sondear(0);
      }
    }
  }
  protected get puedeReintentarCarga() {
    return !!this.archivoEnMemoria;
  }
  protected async consultarCarga() {
    const c = this.carga();
    if (!c || this.consultandoCarga()) return;
    const turno = this.turno;
    this.consultandoCarga.set(true);
    try {
      const a = await this.api.carga(c.productoId, c.clave);
      if (this.vivo && turno === this.turno) {
        this.error.set('');
        await this.recibirCarga(a);
      }
    } catch (e) {
      if (this.vivo && turno === this.turno) this.mostrarError(e);
    } finally {
      if (this.vivo && turno === this.turno) this.consultandoCarga.set(false);
    }
  }
  private async recibirCarga(a: ArchivoProducto) {
    this.cargaTuvoIncertidumbre = true;
    if (this.carga()?.productoId === this.ficha()?.producto.identificador)
      this.archivos.update((list) => [...list.filter((x) => x.id !== a.id), a]);
    if (a.estado === 'DISPONIBLE') {
      this.limpiarCarga();
      if (this.bloqueado() || this.galeria().some((g) => g.archivoId === a.id)) return;
      if (this.galeria().length >= 10) {
        this.error.set(
          'La galería ya tiene 10 fotos. Quita una antes de recuperar esta fotografía.',
        );
        return;
      }
      this.agregarFoto(a);
      await this.guardarGaleria();
    } else if (['FALLIDO', 'ELIMINADO'].includes(a.estado)) {
      this.limpiarCarga();
      this.error.set('La fotografía no pudo completarse. Puedes seleccionar otro archivo.');
    }
  }
  private sondear(intentos: number) {
    this.detenerSondeo();
    if (!this.vivo || !this.carga() || intentos >= 10) return;
    this.temporizador = setTimeout(() => {
      void this.consultarCarga().finally(() => this.sondear(intentos + 1));
    }, 3000);
  }
  private detenerSondeo() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
  private limpiarCarga() {
    this.detenerSondeo();
    this.carga.set(null);
    this.archivoEnMemoria = null;
    this.cargaTuvoIncertidumbre = false;
    sessionStorage.removeItem(this.claveCarga());
  }
  protected async confirmarPublicacion() {
    this.dialogo.set(null);
    const f = this.ficha();
    if (!f || !this.puedePublicar()) return;
    await this.operar(
      () => this.api.escribir('PUBLICAR', f.producto.identificador, f.version, {}),
      'Producto publicado. Ya forma parte del catálogo de la tienda.',
    );
  }
  protected async recargar() {
    this.dialogo.set(null);
    await this.iniciar(this.idRuta());
  }
  private mostrarError(e: unknown) {
    this.error.set(
      e instanceof ErrorEdicionProducto || e instanceof ErrorMovimientoInventario
        ? e.message
        : 'No se pudo cargar una respuesta válida. Tus cambios se conservan; vuelve a consultar.',
    );
    this.incidencias.set(
      e instanceof ErrorEdicionProducto
        ? e.incidencias.map((c) => INCIDENCIAS[c] ?? 'Revisa los datos del producto.')
        : [],
    );
    if (e instanceof ErrorEdicionProducto && e.estado === 409) this.conflicto.set(true);
    afterNextRender(
      () => this.elemento.nativeElement.querySelector<HTMLElement>('[role="alert"]')?.focus(),
      { injector: this.injector },
    );
  }
  puedeSalir(): boolean | Promise<boolean> {
    if (
      this.navegandoGuardado ||
      this.cuenta.perfil()?.rol !== 'ADMIN' ||
      (!this.cambios() &&
        !this.pendiente() &&
        !this.stockPendiente() &&
        !this.carga() &&
        !this.ocupado())
    )
      return true;
    if (this.ocupado()) return false;
    if (this.resolverSalida) return false;
    this.dialogo.set('salir');
    return new Promise((resolve) => (this.resolverSalida = resolve));
  }
  protected cerrarDialogo(salir = false) {
    this.dialogo.set(null);
    this.resolverSalida?.(salir);
    this.resolverSalida = null;
  }
  protected cantidadStock(talla: string, actual = 0) {
    return this.cantidadesStock()[talla]?.valor ?? String(actual);
  }
  protected cambiarStock(talla: string, evento: Event) {
    if (this.bloqueado()) return;
    const v = this.ficha()?.producto.variantes.find((v) => v.talla === talla);
    const valor = (evento.target as HTMLInputElement).value;
    const anterior = this.cantidadesStock()[talla];
    const base = anterior?.base ?? v?.existencias ?? 0;
    this.cantidadesStock.update((valores) => {
      const siguientes = { ...valores };
      if (valor.trim() !== '' && Number(valor) === base) delete siguientes[talla];
      else
        siguientes[talla] = {
          valor,
          base,
          reservado: anterior?.reservado ?? v?.cantidadReservada ?? 0,
        };
      return siguientes;
    });
  }
  private validarStock() {
    for (const [talla, c] of Object.entries(this.cantidadesStock())) {
      if (!/^\d{1,5}$/.test(c.valor) || Number(c.valor) < c.reservado)
        throw new ErrorEdicionProducto(
          `Talla ${talla}: escribe un stock entero de ${c.reservado} a 99,999 pares.`,
        );
    }
  }
  private incorporarStock(actual: VarianteInventarioAdmin) {
    if (actual.producto.id !== this.ficha()?.producto.identificador) return;
    this.ficha.update(
      (f) =>
        f && {
          ...f,
          producto: {
            ...f.producto,
            variantes: f.producto.variantes.map((v) =>
              v.identificador === actual.id
                ? {
                    ...v,
                    existencias: actual.existencias,
                    cantidadReservada: actual.cantidadReservada,
                  }
                : v,
            ),
          },
        },
    );
    this.cantidadesStock.update((valores) => {
      const siguientes = { ...valores };
      delete siguientes[actual.talla];
      return siguientes;
    });
  }
  private async guardarStock() {
    if (!this.stockCambiado() || this.bloqueado()) return;
    const turno = this.turno;
    this.ocupado.set(true);
    this.error.set('');
    try {
      for (const [talla, c] of Object.entries(this.cantidadesStock())) {
        const variante = this.ficha()?.producto.variantes.find((v) => v.talla === talla);
        if (!variante) throw new ErrorEdicionProducto(`Guarda primero la talla ${talla}.`);
        const actual = await this.stockApi.detalle(variante.identificador);
        if (!this.vivo || turno !== this.turno) return;
        if (
          actual.existencias !== c.base ||
          actual.cantidadReservada !== c.reservado ||
          actual.habilitada !== variante.habilitada
        )
          throw new ErrorEdicionProducto(
            `El stock de la talla ${talla} cambió. Recarga la ficha y revisa la cantidad.`,
            409,
          );
        const delta = Number(c.valor) - actual.existencias;
        if (!delta) {
          this.incorporarStock(actual);
          continue;
        }
        const r = await this.stockApi.registrar(actual, {
          sku: actual.sku,
          tipo: 'ajuste',
          sentido: delta < 0 ? 'restar' : 'sumar',
          cantidad: String(Math.abs(delta)),
          motivo: 'Cantidad en stock editada desde la ficha del producto',
          referencia: '',
        });
        if (!this.vivo || turno !== this.turno) return;
        this.incorporarStock(r.actual);
      }
      await this.fuente.actualizarInventario(this.ficha()!.producto.identificador);
      if (this.vivo && turno === this.turno) this.aviso.set('Cantidades en stock guardadas.');
    } catch (e) {
      if (this.vivo && turno === this.turno) {
        try {
          this.stockPendiente.set(!!this.stockApi.pendiente());
        } catch {
          this.stockPendiente.set(true);
        }
        this.mostrarError(e);
      }
    } finally {
      if (this.vivo && turno === this.turno) this.ocupado.set(false);
    }
  }
  protected async recuperarStock(reintentar = false) {
    if (this.ocupado()) return;
    const turno = this.turno;
    this.ocupado.set(true);
    try {
      const r = await this.stockApi.recuperar(reintentar);
      if (!this.vivo || turno !== this.turno) return;
      this.incorporarStock(r.actual);
      this.stockPendiente.set(false);
      this.error.set('');
      this.aviso.set(
        'Cantidad confirmada. Guarda las cantidades restantes si hay cambios pendientes.',
      );
      await this.fuente.actualizarInventario(this.ficha()!.producto.identificador);
    } catch (e) {
      if (this.vivo && turno === this.turno) this.mostrarError(e);
    } finally {
      if (this.vivo && turno === this.turno) this.ocupado.set(false);
    }
  }
}
