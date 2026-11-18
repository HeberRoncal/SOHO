import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  afterNextRender,
  Injector,
  ElementRef,
} from '@angular/core';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { identidadCuenta } from '../../../../tienda/cuenta/modelos/cuenta';
import { EdicionProductosApi, ErrorEdicionProducto } from '../../servicios/edicion-productos-api';
import { ProductosAdministracion } from '../../servicios/productos-administracion';
import { OperacionProducto, ProductoEdicion } from '../../modelos/edicion-productos-api';

export type SolicitudEstadoProducto = {
  productoId: string | null;
  accion: 'ARCHIVAR' | 'RESTAURAR' | null;
};
export interface ResultadoEstadoProducto {
  nombre: string;
  estado: string;
  tipo: OperacionProducto['tipo'] | null;
}

@Component({
  selector: 'app-estado-producto',
  imports: [VentanaDialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado-producto.html',
  styleUrl: './estado-producto.css',
})
export class EstadoProducto {
  readonly solicitud = input<SolicitudEstadoProducto | null>(null);
  readonly cerrado = output<void>();
  readonly retomar = output<void>();
  readonly completado = output<ResultadoEstadoProducto>();
  private readonly api = inject(EdicionProductosApi);
  private readonly fuente = inject(ProductosAdministracion);
  private readonly cuenta = inject(Cuenta);
  private readonly identidadUsuario = computed(() => identidadCuenta(this.cuenta.perfil()));
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly ficha = signal<ProductoEdicion | null>(null);
  protected readonly cargando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly pendiente = signal(false);
  protected readonly reintentoDisponible = signal(true);
  protected readonly error = signal('');
  protected readonly conflicto = signal(false);
  protected readonly confirmado = signal<ProductoEdicion | null>(null);
  protected readonly salir = signal(false);
  protected readonly titulo = computed(() =>
    this.salir()
      ? 'Salir de la operación'
      : this.pendiente() || !this.solicitud()?.accion
        ? 'Recuperar operación de producto'
        : this.solicitud()?.accion === 'ARCHIVAR'
          ? 'Archivar producto'
          : 'Restaurar como borrador',
  );
  protected readonly reservado = computed(
    () => this.ficha()?.producto.variantes.reduce((n, v) => n + v.cantidadReservada, 0) ?? 0,
  );
  private tipoConfirmado: OperacionProducto['tipo'] | null = null;
  private turno = 0;
  private vivo = true;
  private resolverSalida: ((v: boolean) => void) | null = null;
  constructor() {
    effect(() => {
      const solicitud = this.solicitud();
      this.identidadUsuario();
      untracked(() => {
        const perfil = this.cuenta.perfil();
        if (perfil?.rol !== 'ADMIN') {
          this.turno++;
          this.ocupado.set(false);
          this.cargando.set(false);
          this.ficha.set(null);
          this.confirmado.set(null);
          this.pendiente.set(false);
          this.resolverSalida?.(true);
          this.resolverSalida = null;
          return;
        }
        void this.iniciar(solicitud);
      });
    });
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      if (this.solicitud() && (this.ocupado() || this.pendiente())) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', antesDeSalir);
    this.destroy.onDestroy(() => {
      this.vivo = false;
      this.turno++;
      this.resolverSalida?.(false);
      window.removeEventListener('beforeunload', antesDeSalir);
    });
  }
  private leerPendiente() {
    try {
      const p = this.api.pendiente();
      this.pendiente.set(!!p);
      this.reintentoDisponible.set(true);
      return p;
    } catch (e) {
      this.pendiente.set(true);
      this.reintentoDisponible.set(false);
      this.mostrarError(e);
      return null;
    }
  }
  private async iniciar(s: SolicitudEstadoProducto | null) {
    const turno = ++this.turno;
    this.error.set('');
    this.ocupado.set(false);
    this.ficha.set(null);
    this.confirmado.set(null);
    this.conflicto.set(false);
    this.salir.set(false);
    this.cargando.set(false);
    const p = this.leerPendiente();
    if (!s) return;
    const id = p ? p.productoId : s.productoId;
    if (!id) return;
    this.cargando.set(true);
    try {
      const f = await this.api.detalle(id);
      if (this.vivo && turno === this.turno) this.ficha.set(f);
    } catch (e) {
      if (turno === this.turno) this.mostrarError(e);
    } finally {
      if (turno === this.turno) this.cargando.set(false);
    }
  }
  protected async actualizar() {
    if (this.ocupado() || this.pendiente()) return;
    await this.iniciar(this.solicitud());
  }
  protected async confirmar() {
    const s = this.solicitud(),
      f = this.ficha();
    if (
      !s?.accion ||
      !f ||
      this.ocupado() ||
      this.cargando() ||
      this.pendiente() ||
      this.conflicto() ||
      this.confirmado()
    )
      return;
    const estado = f.producto.estado;
    if (s.accion === 'ARCHIVAR' ? estado === 'archivado' : estado !== 'archivado') {
      this.error.set('La ficha ya no admite esta acción. Actualiza sus datos antes de continuar.');
      this.conflicto.set(true);
      return;
    }
    await this.operar(
      () => this.api.escribir(s.accion!, f.producto.identificador, f.version, {}),
      s.accion,
    );
  }
  protected async recuperar(reintentar = false) {
    if (this.ocupado() || (reintentar && !this.reintentoDisponible())) return;
    let tipo: OperacionProducto['tipo'] | null = null;
    try {
      tipo = this.api.pendiente()?.tipo ?? null;
    } catch {
      /* Solo consulta si el registro necesita revisión. */
    }
    await this.operar(() => this.api.recuperar(reintentar), tipo);
  }
  private async operar(
    trabajo: () => Promise<ProductoEdicion>,
    tipo: OperacionProducto['tipo'] | null,
  ) {
    const turno = this.turno;
    this.ocupado.set(true);
    this.error.set('');
    try {
      const f = await trabajo();
      if (!this.vivo || turno !== this.turno) return;
      this.ficha.set(f);
      this.confirmado.set(f);
      this.tipoConfirmado = tipo;
      this.pendiente.set(false);
      await this.actualizarConsultas();
    } catch (e) {
      if (this.vivo && turno === this.turno) {
        this.leerPendiente();
        this.mostrarError(e);
      }
    } finally {
      if (this.vivo && turno === this.turno) this.ocupado.set(false);
    }
  }
  protected async actualizarConsultas() {
    const f = this.confirmado();
    if (!f) return;
    const turno = this.turno;
    this.ocupado.set(true);
    try {
      if (!(await this.fuente.actualizarInventario(f.producto.identificador)))
        throw Error('Consulta no disponible');
      if (this.vivo && turno === this.turno)
        this.completado.emit({
          nombre: f.producto.nombre,
          estado: f.producto.estado,
          tipo: this.tipoConfirmado,
        });
    } catch {
      if (turno === this.turno)
        this.error.set(
          'La operación quedó confirmada. No se repetirá; actualiza las consultas para ver los datos vigentes.',
        );
    } finally {
      if (this.vivo && turno === this.turno) this.ocupado.set(false);
    }
  }
  private mostrarError(e: unknown) {
    this.error.set(
      e instanceof Error ? e.message : 'No se pudo completar la consulta. Inténtalo nuevamente.',
    );
    if (e instanceof ErrorEdicionProducto && e.estado === 409) this.conflicto.set(true);
    afterNextRender(
      () => this.elemento.nativeElement.querySelector<HTMLElement>('[role="alert"]')?.focus(),
      { injector: this.injector },
    );
  }
  protected cerrar() {
    if (this.ocupado()) return;
    if (this.pendiente() && !this.confirmado()) {
      this.salir.set(true);
      return;
    }
    this.cerrado.emit();
  }
  protected decidirSalida(valor: boolean) {
    this.salir.set(false);
    const resolver = this.resolverSalida;
    this.resolverSalida = null;
    if (resolver) resolver(valor);
    else if (valor) this.cerrado.emit();
  }
  puedeSalir(): boolean | Promise<boolean> {
    if (!this.solicitud() || this.cuenta.perfil()?.rol !== 'ADMIN') return true;
    if (this.ocupado()) return false;
    if (!this.pendiente()) return true;
    if (this.resolverSalida) return false;
    this.salir.set(true);
    return new Promise((resolve) => (this.resolverSalida = resolve));
  }
}
