import {
  DestroyRef,
  Injectable,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';
import type { FuenteProductosAdministracion } from '../modelos/fuente-productos-administracion';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { ProductoAdministracion } from '../modelos/producto-administracion';
import { MovimientoInventario } from '../modelos/movimiento-inventario';
import {
  CONTEOS_PRODUCTOS,
  PAGINA_PRODUCTOS,
  EstadoConsultaProductos,
  OpcionesProductos,
  ResumenInventario,
  adaptarListadoProductos,
  adaptarMovimientos,
  adaptarOpciones,
  adaptarProductoAdmin,
  adaptarResumenInventario,
  soloConsulta,
} from '../modelos/consulta-productos-api';
import { registro } from '../../../tienda/pedidos/modelos/contrato-pedidos';

type Canal = 'listado' | 'detalle' | 'opciones' | 'movimientos' | 'resumen';
@Injectable({ providedIn: 'root' })
export class ProductosAdministracionApi implements FuenteProductosAdministracion {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  readonly remoto = true;
  readonly estadoListado = signal<EstadoConsultaProductos>('lista');
  readonly mensajeListado = signal('');
  readonly paginacion = signal({ ...PAGINA_PRODUCTOS });
  readonly opciones = signal<OpcionesProductos>({ marcas: [], categorias: [] });
  readonly estadoOpciones = signal<EstadoConsultaProductos>('lista');
  readonly detalleActual = signal<ProductoAdministracion | null>(null);
  readonly estadoDetalle = signal<EstadoConsultaProductos>('lista');
  readonly mensajeDetalle = signal('');
  readonly estadoMovimientos = signal<EstadoConsultaProductos>('lista');
  readonly mensajeMovimientos = signal('');
  readonly paginaMovimientos = signal({ ...PAGINA_PRODUCTOS });
  readonly resumenRemoto = signal<ResumenInventario | null>(null);
  readonly estadoResumen = signal<EstadoConsultaProductos>('lista');
  readonly mensajeResumen = signal('');

  private readonly reales = signal<readonly ProductoAdministracion[]>([]);
  private readonly registroReal = signal<readonly MovimientoInventario[]>([]);
  private readonly conteosReales = signal({ ...CONTEOS_PRODUCTOS });
  readonly productos = computed(() => (this.autorizado() ? this.reales() : []));
  readonly movimientos = computed(() => (this.autorizado() ? this.registroReal() : []));
  readonly resumen = computed(() => (this.autorizado() ? this.conteosReales() : CONTEOS_PRODUCTOS));
  private propietario = '';
  private filtrosListado: Record<string, string> = {};
  private filtrosMovimientos: Record<string, string> = {};
  private ultimoDetalle = '';
  private readonly turnos: Record<Canal, number> = {
    listado: 0,
    detalle: 0,
    opciones: 0,
    movimientos: 0,
    resumen: 0,
  };
  private readonly cancelaciones: Record<Canal, Subject<void>> = {
    listado: new Subject(),
    detalle: new Subject(),
    opciones: new Subject(),
    movimientos: new Subject(),
    resumen: new Subject(),
  };
  constructor() {
    this.limpiar();
    effect(() => {
      this.cuenta.perfil();
      this.cuenta.estadoSesion();
      untracked(() => this.sincronizar());
    });
    inject(DestroyRef).onDestroy(() => this.limpiar());
  }
  private identidad() {
    return `${this.cuenta.perfil()?.id ?? ''}:${this.auth.revision}:${this.cuenta.perfil()?.rol ?? ''}`;
  }
  private autorizado() {
    return this.cuenta.perfil()?.rol === 'ADMIN' && this.propietario === this.identidad();
  }
  private sincronizar() {
    const identidad = this.identidad();
    if (identidad !== this.propietario) {
      this.limpiar();
      this.propietario = identidad;
    }
  }
  private limpiar() {
    this.filtrosListado = {};
    this.filtrosMovimientos = {};
    this.ultimoDetalle = '';
    for (const canal of Object.keys(this.turnos) as Canal[]) {
      this.turnos[canal]++;
      this.cancelaciones[canal].next();
    }
    this.reales.set([]);
    this.registroReal.set([]);
    this.conteosReales.set({ ...CONTEOS_PRODUCTOS });
    this.detalleActual.set(null);
    this.resumenRemoto.set(null);
    this.opciones.set({ marcas: [], categorias: [] });
    this.paginacion.set({ ...PAGINA_PRODUCTOS });
    this.paginaMovimientos.set({ ...PAGINA_PRODUCTOS });
    for (const e of [
      this.estadoListado,
      this.estadoDetalle,
      this.estadoOpciones,
      this.estadoMovimientos,
      this.estadoResumen,
    ])
      e.set('inicial');
    for (const m of [
      this.mensajeListado,
      this.mensajeDetalle,
      this.mensajeMovimientos,
      this.mensajeResumen,
    ])
      m.set('');
  }
  private async consultar(
    canal: Canal,
    ruta: string,
    filtros: Record<string, string>,
    estado: WritableSignal<EstadoConsultaProductos>,
    mensaje: WritableSignal<string> | null,
    recibir: (r: unknown) => void,
  ) {
    this.sincronizar();
    this.cancelaciones[canal].next();
    const turno = ++this.turnos[canal],
      propietario = this.propietario;
    estado.set('cargando');
    mensaje?.set('');
    try {
      if (!this.autorizado()) throw Error('La sesión no autoriza esta consulta.');
      let params = new HttpParams();
      for (const [k, v] of Object.entries(filtros)) if (v) params = params.set(k, v);
      const r = await firstValueFrom(
        this.http
          .get<unknown>(ruta, { params })
          .pipe(timeout(15000), takeUntil(this.cancelaciones[canal])),
      );
      if (turno !== this.turnos[canal] || propietario !== this.identidad() || !this.autorizado())
        return;
      recibir(r);
      estado.set('lista');
    } catch (e) {
      if (turno !== this.turnos[canal] || propietario !== this.identidad()) return;
      if (e instanceof HttpErrorResponse && (e.status === 401 || e.status === 403)) this.limpiar();
      mensaje?.set(
        e instanceof HttpErrorResponse && [401, 403].includes(e.status)
          ? 'Tu sesión ya no permite consultar el inventario. Vuelve a iniciar sesión.'
          : 'No se pudo consultar el inventario. Inténtalo nuevamente.',
      );
      estado.set('error');
    }
  }
  cargarListado(filtros: Record<string, string> = {}) {
    this.sincronizar();
    this.filtrosListado = { ...filtros };
    this.reales.set([]);
    return this.consultar(
      'listado',
      '/api/admin/productos',
      filtros,
      this.estadoListado,
      this.mensajeListado,
      (r) => {
        const v = adaptarListadoProductos(r);
        this.reales.set(v.productos);
        this.paginacion.set(v.paginacion);
        this.conteosReales.set(v.resumen);
      },
    );
  }
  cargarDetalle(id: string) {
    this.sincronizar();
    this.ultimoDetalle = id;
    this.detalleActual.set(null);
    return this.consultar(
      'detalle',
      '/api/admin/productos/' + encodeURIComponent(id),
      {},
      this.estadoDetalle,
      this.mensajeDetalle,
      (r) => {
        soloConsulta(r);
        this.detalleActual.set(adaptarProductoAdmin(registro(r)['producto']));
      },
    );
  }
  cargarOpciones() {
    return this.consultar(
      'opciones',
      '/api/admin/productos/opciones',
      {},
      this.estadoOpciones,
      null,
      (r) => this.opciones.set(adaptarOpciones(r)),
    );
  }
  cargarMovimientos(filtros: Record<string, string> = {}) {
    this.sincronizar();
    this.filtrosMovimientos = { ...filtros };
    this.registroReal.set([]);
    return this.consultar(
      'movimientos',
      '/api/admin/inventario/movimientos',
      filtros,
      this.estadoMovimientos,
      this.mensajeMovimientos,
      (r) => {
        const v = adaptarMovimientos(r);
        this.registroReal.set(v.movimientos);
        this.paginaMovimientos.set(v.paginacion);
      },
    );
  }
  cargarResumen() {
    this.resumenRemoto.set(null);
    return this.consultar(
      'resumen',
      '/api/admin/inventario/resumen',
      {},
      this.estadoResumen,
      this.mensajeResumen,
      (r) => {
        const v = adaptarResumenInventario(r);
        this.resumenRemoto.set(v);
      },
    );
  }
  async actualizarInventario(_productoId: string) {
    const identidad = this.identidad();
    const tareas: Promise<void>[] = [],
      estados: WritableSignal<EstadoConsultaProductos>[] = [];
    if (this.estadoListado() !== 'inicial') {
      tareas.push(this.cargarListado({ ...this.filtrosListado }));
      estados.push(this.estadoListado);
    }
    if (this.ultimoDetalle) {
      tareas.push(this.cargarDetalle(this.ultimoDetalle));
      estados.push(this.estadoDetalle);
    }
    if (this.estadoMovimientos() !== 'inicial') {
      tareas.push(this.cargarMovimientos({ ...this.filtrosMovimientos }));
      estados.push(this.estadoMovimientos);
    }
    tareas.push(this.cargarResumen());
    estados.push(this.estadoResumen);
    await Promise.all(tareas);
    return (
      identidad === this.identidad() && this.autorizado() && estados.every((e) => e() === 'lista')
    );
  }
}
