import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  ComprobantePago,
  FORMATOS_COMPROBANTE,
  MAXIMO_COMPROBANTE,
} from '../../../pedidos/modelos/comprobante-pago';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  selector: 'app-imagen-comprobante',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  templateUrl: './imagen-comprobante.html',
  styleUrl: './imagen-comprobante.css',
})
export class ImagenComprobante {
  readonly ocupado = input(false);
  readonly correccion = input(false);
  readonly habilitado = input(true);
  readonly mostrarRequisitos = input(false);
  readonly referencia = input('');
  readonly enviado = output<ComprobantePago>();
  protected readonly imagen = signal<ComprobantePago | null>(null);
  protected readonly error = signal('');
  protected readonly leyendo = signal(false);
  protected readonly numero = signal('');
  protected readonly arrastrando = signal(false);
  private lector?: FileReader;
  private turno = 0;
  private readonly entradaNumero = viewChild<ElementRef<HTMLInputElement>>('entradaNumero');
  constructor() {
    effect(() => {
      this.referencia();
      untracked(() => {
        this.quitar();
        this.numero.set('');
        const campo = this.entradaNumero()?.nativeElement;
        if (campo) campo.value = '';
      });
    });
    inject(DestroyRef).onDestroy(() => this.cancelar());
  }
  private cancelar() {
    this.turno++;
    if (this.lector) {
      this.lector.onload = null;
      this.lector.onerror = null;
      if (this.lector.readyState === 1) this.lector.abort();
    }
    this.lector = undefined;
    this.leyendo.set(false);
  }
  protected operacion(e: Event) {
    const input = e.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').slice(0, 12);
    this.numero.set(input.value);
  }
  protected seleccionar(e: Event) {
    const entrada = e.target as HTMLInputElement,
      archivo = entrada.files?.[0];
    entrada.value = '';
    this.tomarArchivo(archivo);
  }
  protected soltar(e: DragEvent) {
    e.preventDefault();
    this.arrastrando.set(false);
    this.tomarArchivo(e.dataTransfer?.files?.[0]);
  }
  protected quitar() {
    this.cancelar();
    this.imagen.set(null);
    this.error.set('');
  }
  private tomarArchivo(archivo?: File) {
    if (!archivo || this.ocupado() || !this.habilitado()) return;
    this.cancelar();
    this.imagen.set(null);
    this.error.set('');
    if (
      !FORMATOS_COMPROBANTE.includes(archivo.type as (typeof FORMATOS_COMPROBANTE)[number]) ||
      archivo.size < 1 ||
      archivo.size > MAXIMO_COMPROBANTE
    ) {
      this.error.set('Elige una imagen JPG, PNG o WebP de hasta 5 MB.');
      return;
    }
    const turno = this.turno,
      lector = new FileReader();
    this.lector = lector;
    this.leyendo.set(true);
    lector.onerror = () => {
      if (turno === this.turno) {
        this.error.set('No pudimos leer la imagen. Vuelve a seleccionarla.');
        this.leyendo.set(false);
      }
    };
    lector.onload = async () => {
      const vistaPrevia = String(lector.result),
        imagen = new Image();
      imagen.src = vistaPrevia;
      try {
        await imagen.decode();
        if (turno !== this.turno) return;
        if (
          !imagen.naturalWidth ||
          !imagen.naturalHeight ||
          imagen.naturalWidth > 8192 ||
          imagen.naturalHeight > 8192 ||
          imagen.naturalWidth * imagen.naturalHeight > 20000000
        )
          throw Error();
        this.imagen.set({
          nombreArchivo: archivo.name,
          tipoArchivo: archivo.type,
          tamanoBytes: archivo.size,
          vistaPrevia,
        });
      } catch {
        if (turno === this.turno)
          this.error.set('La imagen no es válida o es demasiado grande en píxeles.');
      } finally {
        if (turno === this.turno) this.leyendo.set(false);
      }
    };
    lector.readAsDataURL(archivo);
  }
  protected enviar(e: Event) {
    e.preventDefault();
    const imagen = this.imagen();
    if (!imagen || this.ocupado() || this.leyendo() || !this.habilitado()) return;
    this.enviado.emit({
      ...imagen,
      ...(this.correccion() || !this.numero() ? {} : { numeroOperacion: this.numero() }),
    });
  }
}
