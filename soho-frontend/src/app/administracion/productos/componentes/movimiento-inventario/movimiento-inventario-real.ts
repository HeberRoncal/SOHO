import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  afterNextRender,
  Injector,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { CampoFormulario } from '../../../../compartido/componentes/campo-formulario/campo-formulario';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { identidadCuenta } from '../../../../tienda/cuenta/modelos/cuenta';
import { ProductosAdministracion } from '../../servicios/productos-administracion';
import {
  ErrorMovimientoInventario,
  MovimientosInventarioApi,
} from '../../servicios/movimientos-inventario-api';
import { VarianteInventarioAdmin } from '../../modelos/movimientos-inventario-api';
import {
  MOVIMIENTO_VACIO,
  MovimientoInventario,
  evaluarMovimiento,
} from '../../modelos/movimiento-inventario';

@Component({
  selector: 'app-movimiento-inventario-real',
  imports: [ReactiveFormsModule, VentanaDialogo, CampoFormulario],
  templateUrl: './movimiento-inventario-real.html',
  styleUrls: ['./movimiento-inventario.css', './movimiento-inventario-real.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovimientoInventarioReal {
  readonly abierto = input(false);
  readonly skuInicial = input('');
  readonly productoId = input('');
  readonly cerrado = output<void>();
  readonly registrado = output<MovimientoInventario>();
  private readonly api = inject(MovimientosInventarioApi);
  private readonly fuente = inject(ProductosAdministracion);
  private readonly cuenta = inject(Cuenta);
  private readonly identidadUsuario = computed(() => identidadCuenta(this.cuenta.perfil()));
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly formulario = inject(FormBuilder).nonNullable.group({ ...MOVIMIENTO_VACIO });
  private readonly valores = toSignal(this.formulario.valueChanges, {
    initialValue: this.formulario.getRawValue(),
  });
  protected readonly busqueda = signal('');
  protected readonly pagina = signal(1);
  protected readonly paginas = signal(0);
  protected readonly total = signal(0);
  protected readonly opciones = signal<VarianteInventarioAdmin[]>([]);
  protected readonly seleccion = signal<VarianteInventarioAdmin | null>(null);
  protected readonly buscando = signal(false);
  protected readonly consultando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly pendiente = signal(false);
  protected readonly conflicto = signal(false);
  protected readonly errorBusqueda = signal('');
  protected readonly error = signal('');
  protected readonly intento = signal(false);
  protected readonly etapa = signal<'editar' | 'confirmar' | 'salir'>('editar');
  protected readonly confirmado = signal<MovimientoInventario | null>(null);
  private resolverSalida: ((v: boolean) => void) | null = null;
  private turnoBusqueda = 0;
  private turnoDetalle = 0;
  private apertura = 0;
  private vivo = true;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private propietario = '';
  private readonly base = signal(JSON.stringify(MOVIMIENTO_VACIO));
  protected readonly cambios = computed(() => {
    this.valores();
    return JSON.stringify(this.formulario.getRawValue()) !== this.base();
  });
  protected readonly bloqueado = computed(
    () => this.ocupado() || this.pendiente() || !!this.confirmado(),
  );
  protected readonly evaluacion = computed(() => {
    this.valores();
    const s = this.seleccion(),
      d = this.formulario.getRawValue();
    const e = evaluarMovimiento(
      d,
      s
        ? {
            identificador: s.id,
            sku: s.sku,
            codigoColor: s.color.codigo,
            talla: s.talla,
            sistemaTallas: 'EU',
            habilitada: s.habilitada,
            existencias: s.existencias,
            cantidadReservada: s.cantidadReservada,
          }
        : undefined,
    );
    if (!s) e.errores.sku = 'Selecciona una variante guardada.';
    if (s && e.delta < 0 && e.bajoReservas)
      e.errores.cantidad =
        'La reducción compromete unidades reservadas. Revisa la cantidad o los pedidos asociados.';
    if (/[\p{Cc}\p{Cf}]/u.test(d.motivo))
      e.errores.motivo = 'El motivo contiene caracteres no válidos.';
    if (/[\p{Cc}\p{Cf}]/u.test(d.referencia))
      e.errores.referencia = 'La referencia contiene caracteres no válidos.';
    return e;
  });
  protected readonly errores = computed(() => (this.intento() ? this.evaluacion().errores : {}));
  protected readonly listaErrores = computed(() => Object.values(this.errores()));
  protected readonly tipos = [
    ['entrada', 'Entrada', 'Suma unidades'],
    ['salida', 'Salida', 'Resta unidades'],
    ['ajuste', 'Ajuste', 'Corrige el saldo'],
  ] as const;
  protected readonly motivos = computed(() =>
    this.valores().tipo === 'entrada'
      ? ['Reposición de proveedor', 'Ingreso de inventario']
      : this.valores().tipo === 'salida'
        ? ['Par dañado', 'Muestra / uso interno']
        : ['Conteo físico', 'Corrección de registro'],
  );
  constructor() {
    effect(() => {
      const abierto = this.abierto(),
        sku = this.skuInicial(),
        producto = this.productoId();
      this.identidadUsuario();
      untracked(() => {
        const perfil = this.cuenta.perfil();
        if (!abierto || perfil?.rol !== 'ADMIN') {
          this.apertura++;
          this.turnoBusqueda++;
          this.turnoDetalle++;
          this.detener();
          if (perfil?.rol !== 'ADMIN') {
            this.formulario.reset({ ...MOVIMIENTO_VACIO });
            this.seleccion.set(null);
            this.opciones.set([]);
            this.confirmado.set(null);
            this.pendiente.set(false);
            this.resolverSalida?.(true);
            this.resolverSalida = null;
          }
          return;
        }
        this.propietario = perfil.id;
        void this.iniciar(sku, producto);
      });
    });
    const salir = (e: BeforeUnloadEvent) => {
      if (this.abierto() && (this.cambios() || this.pendiente() || this.ocupado())) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', salir);
    inject(DestroyRef).onDestroy(() => {
      this.vivo = false;
      this.apertura++;
      this.detener();
      window.removeEventListener('beforeunload', salir);
      this.resolverSalida?.(false);
    });
  }
  private vigente(turno: number) {
    return (
      this.vivo &&
      this.abierto() &&
      this.apertura === turno &&
      this.cuenta.perfil()?.id === this.propietario &&
      this.cuenta.perfil()?.rol === 'ADMIN'
    );
  }
  private async iniciar(sku: string, _producto: string) {
    const turno = ++this.apertura;
    this.formulario.reset({ ...MOVIMIENTO_VACIO, sku });
    this.base.set(JSON.stringify(this.formulario.getRawValue()));
    this.seleccion.set(null);
    this.opciones.set([]);
    this.error.set('');
    this.errorBusqueda.set('');
    this.pendiente.set(false);
    this.conflicto.set(false);
    this.confirmado.set(null);
    this.intento.set(false);
    this.etapa.set('editar');
    this.ocupado.set(false);
    this.consultando.set(false);
    this.buscando.set(false);
    this.busqueda.set('');
    this.pagina.set(1);
    try {
      const p = this.api.pendiente();
      this.pendiente.set(!!p);
      if (p) {
        const d = p.cuerpo;
        this.formulario.reset({
          ...MOVIMIENTO_VACIO,
          tipo: d.tipo.toLowerCase() as 'entrada' | 'salida' | 'ajuste',
          sentido: d.cantidad < 0 ? 'restar' : 'sumar',
          cantidad: String(Math.abs(d.cantidad)),
          motivo: d.motivo,
          referencia: d.referencia ?? '',
        });
        const v = await this.api.detalle(p.varianteId);
        if (this.vigente(turno)) {
          this.seleccion.set(v);
          this.formulario.patchValue({ sku: v.sku });
        }
        return;
      }
      if (sku) {
        const r = await this.api.buscar({ sku, producto: this.productoId(), limite: '1' });
        if (this.vigente(turno)) {
          if (r.variantes[0]) await this.cargarSeleccion(r.variantes[0].id);
          else this.error.set('No encontramos el SKU seleccionado. Busca otra variante.');
        }
      } else await this.buscar();
    } catch (e) {
      if (this.vigente(turno)) {
        this.pendiente.set(this.hayPendiente());
        this.mostrarError(e);
      }
    }
  }
  private hayPendiente() {
    try {
      return !!this.api.pendiente();
    } catch {
      return true;
    }
  }
  protected cambiarBusqueda(e: Event) {
    this.busqueda.set((e.target as HTMLInputElement).value);
    this.pagina.set(1);
    this.detener();
    this.temporizador = setTimeout(() => void this.buscar(), 300);
  }
  private detener() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
  protected async buscar(delta = 0) {
    if (this.bloqueado()) return;
    const turno = ++this.turnoBusqueda,
      apertura = this.apertura;
    this.pagina.update((n) => Math.max(1, n + delta));
    this.buscando.set(true);
    this.errorBusqueda.set('');
    try {
      const r = await this.api.buscar({
        busqueda: this.busqueda(),
        producto: this.productoId(),
        pagina: String(this.pagina()),
      });
      if (this.vigente(apertura) && turno === this.turnoBusqueda) {
        this.opciones.set(r.variantes);
        this.paginas.set(r.paginacion.paginas);
        this.total.set(r.paginacion.total);
      }
    } catch (e) {
      if (this.vigente(apertura) && turno === this.turnoBusqueda) {
        this.opciones.set([]);
        this.errorBusqueda.set(e instanceof Error ? e.message : 'No se pudo buscar.');
      }
    } finally {
      if (this.vigente(apertura) && turno === this.turnoBusqueda) this.buscando.set(false);
    }
  }
  protected async elegir(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    if (!id) {
      this.seleccion.set(null);
      this.formulario.patchValue({ sku: '' });
      return;
    }
    await this.cargarSeleccion(id);
  }
  private async cargarSeleccion(id: string) {
    const turno = ++this.turnoDetalle,
      apertura = this.apertura;
    this.consultando.set(true);
    this.error.set('');
    try {
      const v = await this.api.detalle(id);
      if (this.vigente(apertura) && turno === this.turnoDetalle) {
        this.seleccion.set(v);
        this.formulario.patchValue({ sku: v.sku });
        this.conflicto.set(false);
        this.etapa.set('editar');
      }
    } catch (e) {
      if (this.vigente(apertura) && turno === this.turnoDetalle) this.mostrarError(e);
    } finally {
      if (this.vigente(apertura) && turno === this.turnoDetalle) this.consultando.set(false);
    }
  }
  protected actualizarSaldos() {
    const s = this.seleccion();
    if (s && !this.bloqueado()) return this.cargarSeleccion(s.id);
    return Promise.resolve();
  }
  protected revisar() {
    if (this.bloqueado() || this.consultando() || this.conflicto()) return;
    this.intento.set(true);
    this.error.set('');
    if (this.listaErrores().length) {
      this.enfocarAlerta();
      return;
    }
    this.etapa.set('confirmar');
    afterNextRender(
      () =>
        this.elemento.nativeElement.querySelector<HTMLElement>('.confirmacion-movimiento')?.focus(),
      { injector: this.injector },
    );
  }
  protected async guardar() {
    const s = this.seleccion();
    if (
      !s ||
      this.etapa() !== 'confirmar' ||
      this.bloqueado() ||
      this.consultando() ||
      this.conflicto() ||
      Object.keys(this.evaluacion().errores).length
    )
      return;
    await this.operar(() => this.api.registrar(s, this.formulario.getRawValue()));
  }
  protected recuperar(reintentar = false) {
    if (this.ocupado() || !this.pendiente()) return Promise.resolve();
    return this.operar(() => this.api.recuperar(reintentar));
  }
  private async operar(trabajo: () => ReturnType<MovimientosInventarioApi['recuperar']>) {
    const apertura = this.apertura;
    this.ocupado.set(true);
    this.error.set('');
    try {
      const r = await trabajo();
      if (!this.vigente(apertura)) return;
      this.pendiente.set(false);
      this.seleccion.set(r.actual);
      this.confirmado.set(r.movimiento);
      this.base.set(JSON.stringify(this.formulario.getRawValue()));
      await this.actualizarConsultas();
    } catch (e) {
      if (this.vigente(apertura)) {
        this.pendiente.set(this.hayPendiente());
        this.mostrarError(e);
        this.etapa.set('editar');
        if (e instanceof ErrorMovimientoInventario && e.estado === 409 && !this.pendiente())
          this.conflicto.set(true);
      }
    } finally {
      if (this.vigente(apertura)) this.ocupado.set(false);
    }
  }
  protected async actualizarConsultas() {
    const movimiento = this.confirmado();
    if (!movimiento) return;
    this.ocupado.set(true);
    const apertura = this.apertura;
    try {
      const ok = await this.fuente.actualizarInventario(movimiento.productoId);
      if (!this.vigente(apertura)) return;
      if (ok) {
        this.registrado.emit(movimiento);
      } else
        this.error.set(
          'El movimiento está confirmado. No se pudieron actualizar todas las consultas; reintenta la actualización. El stock no se registrará otra vez.',
        );
    } catch {
      if (this.vigente(apertura))
        this.error.set('El movimiento está confirmado. Reintenta actualizar las consultas.');
    } finally {
      if (this.vigente(apertura)) this.ocupado.set(false);
    }
  }
  private mostrarError(e: unknown) {
    this.error.set(e instanceof Error ? e.message : 'No se pudo completar la operación.');
    this.enfocarAlerta();
  }
  private enfocarAlerta() {
    afterNextRender(
      () => {
        if (this.vivo)
          this.elemento.nativeElement.querySelector<HTMLElement>('[role="alert"]')?.focus();
      },
      { injector: this.injector },
    );
  }
  puedeSalir(): boolean | Promise<boolean> {
    if (!this.abierto() || this.cuenta.perfil()?.rol !== 'ADMIN') return true;
    if (this.ocupado()) return false;
    if ((!this.cambios() && !this.pendiente()) || this.confirmado()) return true;
    if (this.resolverSalida) return false;
    this.etapa.set('salir');
    return new Promise((r) => (this.resolverSalida = r));
  }
  protected async cerrar() {
    if (await this.puedeSalir()) this.cerrado.emit();
  }
  protected resolverCierre(salir: boolean) {
    this.etapa.set('editar');
    const r = this.resolverSalida;
    this.resolverSalida = null;
    r?.(salir);
  }
}
