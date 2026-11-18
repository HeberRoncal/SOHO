import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { SolicitudesAdministracion } from '../../servicios/solicitudes-administracion';
import {
  EvidenciaSolicitud,
  MOTIVOS_SOLICITUD,
  NuevaSolicitud as DatosNuevaSolicitud,
} from '../../modelos/solicitud-admin';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';

@Component({
  selector: 'app-nueva-solicitud',
  imports: [ReactiveFormsModule, VentanaDialogo, PrecioProducto],
  templateUrl: './nueva-solicitud.html',
  styleUrl: '../../formulario-solicitud.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuevaSolicitudComponent {
  readonly cerrado = output<void>();
  readonly registrado = output<string>();
  protected readonly fuente = inject(SolicitudesAdministracion);
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    pedido: '',
    sku: '',
    tipo: 'cambio' as DatosNuevaSolicitud['tipo'],
    cantidad: 1,
    motivo: '',
    descripcion: '',
    variante: '',
    confirmado: false,
  });
  private readonly valores = toSignal(this.formulario.valueChanges, {
    initialValue: this.formulario.getRawValue(),
  });
  protected readonly evidencias = signal<readonly EvidenciaSolicitud[]>([]);
  protected readonly leyendo = signal(false);
  protected readonly errorArchivo = signal('');
  protected readonly intento = signal(false);
  private readonly fallo = signal<Record<string, string>>({});
  private readonly resumen = viewChild<ElementRef<HTMLElement>>('resumen');
  protected readonly motivos = Object.entries(MOTIVOS_SOLICITUD);
  protected readonly datos = computed<DatosNuevaSolicitud>(() => {
    this.valores();
    return { ...this.formulario.getRawValue(), evidencias: this.evidencias() };
  });
  protected readonly pedido = computed(() => this.fuente.pedido(this.datos().pedido));
  protected readonly variantes = computed(() => this.fuente.variantes(this.datos().sku));
  protected readonly disponibles = computed(() =>
    this.fuente.pendientes(this.datos().pedido, this.datos().sku),
  );
  protected readonly importe = computed(() => this.fuente.importe(this.datos()));
  protected readonly errores = computed(() =>
    this.intento() ? { ...this.fuente.validar(this.datos()), ...this.fallo() } : {},
  );
  protected readonly listaErrores = computed(() => Object.values(this.errores()));
  constructor() {
    effect(() => {
      this.valores();
      this.evidencias();
      this.fallo.set({});
    });
  }
  protected cambiarPedido() {
    this.formulario.patchValue({ sku: '', cantidad: 1, variante: '' });
  }
  protected cambiarArticulo() {
    this.formulario.patchValue({ cantidad: 1, variante: '' });
  }
  protected quitarEvidencia(indice: number) {
    this.evidencias.update((todas) => todas.filter((_, i) => i !== indice));
    this.errorArchivo.set('');
  }
  protected async adjuntar(evento: Event) {
    const input = evento.target as HTMLInputElement,
      archivos = [...(input.files ?? [])];
    input.value = '';
    this.errorArchivo.set('');
    if (!archivos.length) return;
    if (
      archivos.length + this.evidencias().length > 3 ||
      archivos.some(
        (a) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(a.type) ||
          a.size <= 0 ||
          a.size > 2 * 1024 * 1024,
      )
    ) {
      this.errorArchivo.set('Adjunta hasta 3 imágenes JPG, PNG o WEBP de máximo 2 MB cada una.');
      return;
    }
    this.leyendo.set(true);
    try {
      const leidas = await Promise.all(
        archivos.map(
          (a) =>
            new Promise<EvidenciaSolicitud>((resolve, reject) => {
              const lector = new FileReader();
              lector.onload = () =>
                resolve({
                  nombre: a.name,
                  tipo: a.type,
                  bytes: a.size,
                  imagen: String(lector.result),
                });
              lector.onerror = () => reject(new Error('lectura'));
              lector.readAsDataURL(a);
            }),
        ),
      );
      await Promise.all(
        leidas.map(async (e) => {
          const imagen = new Image();
          imagen.src = e.imagen;
          await imagen.decode();
        }),
      );
      this.evidencias.update((todas) => [...todas, ...leidas]);
    } catch {
      this.errorArchivo.set('No pudimos leer la imagen. Selecciónala nuevamente.');
    } finally {
      this.leyendo.set(false);
    }
  }
  protected guardar() {
    if (this.leyendo()) return;
    this.intento.set(true);
    const resultado = this.fuente.crear(this.datos());
    if (resultado.ok && resultado.identificador) this.registrado.emit(resultado.identificador);
    else {
      this.fallo.set(resultado.errores);
      setTimeout(() => this.resumen()?.nativeElement.focus(), 0);
    }
  }
}
