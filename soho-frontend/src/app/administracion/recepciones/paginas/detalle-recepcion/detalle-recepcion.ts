import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { RecepcionesAdministracionApi } from '../../servicios/recepciones-administracion-api';
import {
  AccionRecepcion,
  ESTADOS_RECEPCION,
  fechaRecepcion,
  importeRecepcion,
  motivoRecepcion,
} from '../../modelos/recepcion-admin';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';

@Component({
  selector: 'app-detalle-recepcion',
  imports: [RouterLink, VentanaDialogo],
  templateUrl: './detalle-recepcion.html',
  styleUrls: ['../../recepciones-admin.css', './detalle-recepcion.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetalleRecepcion {
  protected readonly fuente = inject(RecepcionesAdministracionApi);
  private readonly ruta = inject(ActivatedRoute);
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  protected readonly id = computed(() => this.parametros().get('id') ?? '');
  protected readonly detalle = computed(() => {
    const d = this.fuente.detalle();
    return d?.recepcion.id === this.id() ? d : null;
  });
  protected readonly intento = computed(() => this.fuente.intento(this.id()));
  protected readonly etiquetas = ESTADOS_RECEPCION;
  protected readonly fecha = fechaRecepcion;
  protected readonly importe = importeRecepcion;
  protected readonly motivo = motivoRecepcion;
  protected readonly accion = signal<AccionRecepcion | null>(null);
  protected readonly motivoInterno = signal('');
  protected readonly mensajeCliente = signal('');
  protected readonly confirmado = signal(false);
  protected readonly originales = signal(false);
  protected readonly errorFormulario = signal('');
  protected readonly seleccionId = signal('');
  protected readonly seleccion = computed(() => {
    const d = this.detalle();
    return d?.comprobantes.find((c) => c.id === this.seleccionId()) ?? d?.recepcion.comprobante;
  });
  protected readonly imagen = signal('');
  protected readonly errorImagen = signal('');
  protected readonly cargandoImagen = signal(false);
  protected readonly ampliado = signal(false);
  private turnoImagen = 0;
  private destruido = false;
  private versionFormulario = '';
  constructor() {
    effect(() => {
      const id = this.id();
      this.reiniciarFormulario();
      this.seleccionId.set('');
      untracked(() => void this.fuente.cargarDetalle(id));
    });
    effect(() => {
      const d = this.detalle();
      const version = d
        ? `${d.recepcion.id}:${d.recepcion.version}:${d.recepcion.comprobante.id}`
        : '';
      if (version !== this.versionFormulario) {
        this.versionFormulario = version;
        this.reiniciarFormulario();
      }
      if (!d) {
        this.reiniciarFormulario();
        this.ampliado.set(false);
      }
    });
    effect(() => {
      if (this.intento()) this.reiniciarFormulario();
    });
    effect(() => {
      this.seleccion();
      untracked(() => void this.cargarImagen());
    });
    const antesSalir = (e: BeforeUnloadEvent) => {
      if (this.accion()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', antesSalir);
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      window.removeEventListener('beforeunload', antesSalir);
      this.turnoImagen++;
      this.retirarImagen();
      this.fuente.salirDetalle();
    });
  }
  private retirarImagen() {
    if (this.imagen()) URL.revokeObjectURL(this.imagen());
    this.imagen.set('');
  }
  protected async cargarImagen() {
    const d = this.detalle(),
      c = this.seleccion(),
      turno = ++this.turnoImagen;
    this.retirarImagen();
    this.errorImagen.set('');
    this.cargandoImagen.set(false);
    this.ampliado.set(false);
    if (!d || !c || c.estadoArchivo !== 'DISPONIBLE') return;
    this.cargandoImagen.set(true);
    try {
      const blob = await this.fuente.comprobante(d.recepcion.id, c.id);
      if (
        turno !== this.turnoImagen ||
        this.destruido ||
        this.detalle()?.recepcion.id !== d.recepcion.id ||
        this.seleccion()?.id !== c.id
      )
        return;
      this.imagen.set(URL.createObjectURL(blob));
    } catch {
      if (turno === this.turnoImagen)
        this.errorImagen.set(
          'No pudimos abrir esta imagen privada. Puedes reintentar sin repetir ninguna decisión.',
        );
    } finally {
      if (turno === this.turnoImagen) this.cargandoImagen.set(false);
    }
  }
  protected cargar() {
    void this.fuente.cargarDetalle(this.id());
  }
  protected abrir(accion: AccionRecepcion) {
    this.reiniciarFormulario();
    this.accion.set(accion);
  }
  protected reiniciarFormulario() {
    this.accion.set(null);
    this.motivoInterno.set('');
    this.mensajeCliente.set('');
    this.confirmado.set(false);
    this.originales.set(false);
    this.errorFormulario.set('');
  }
  protected async guardar(e: Event) {
    e.preventDefault();
    const accion = this.accion(),
      id = this.id();
    if (!accion) return;
    this.errorFormulario.set('');
    try {
      await this.fuente.decidir(
        id,
        accion,
        this.motivoInterno(),
        this.mensajeCliente(),
        this.confirmado(),
        this.originales(),
      );
      if (id === this.id() && !this.destruido && this.fuente.intento(id))
        this.reiniciarFormulario();
    } catch (e) {
      if (id === this.id() && !this.destruido)
        this.errorFormulario.set(
          e instanceof Error ? e.message : 'Revisa los textos y las confirmaciones.',
        );
    }
  }
  puedeSalir() {
    return (
      !this.accion() ||
      !!this.intento() ||
      window.confirm('Hay una decisión sin enviar. ¿Quieres salir y descartar el formulario?')
    );
  }
  protected nombreAccion(accion: string) {
    return (
      (
        {
          PROCESAR: 'Procesamiento de recepción',
          REGISTRAR_PEDIDO: 'Registro con condiciones originales',
          SOLICITAR_CORRECCION: 'Solicitud de otra imagen',
          ADJUNTAR_COMPROBANTE: 'Nueva imagen del comprador',
        } as Record<string, string>
      )[accion] ?? 'Operación de recepción'
    );
  }
}
