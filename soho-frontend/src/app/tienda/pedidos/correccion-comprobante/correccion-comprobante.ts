import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Pedido } from '../modelos/pedido';
import {
  ComprobantePago,
  MAXIMO_COMPROBANTE,
  FORMATOS_COMPROBANTE,
} from '../modelos/comprobante-pago';
import { Pedidos } from '../servicios/pedidos';
@Component({
  selector: 'app-correccion-comprobante',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './correccion-comprobante.html',
  styleUrl: './correccion-comprobante.css',
})
export class CorreccionComprobante {
  readonly pedido = input.required<Pedido>();
  private readonly pedidos = inject(Pedidos);
  protected readonly archivo = signal<ComprobantePago | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly leyendo = signal(false);
  protected readonly error = signal('');
  protected readonly operacion = signal('');
  private lector?: FileReader;
  private esperado?: {
    versionPedido: number;
    versionPago: number;
    comprobanteId: string;
  };
  constructor() {
    effect(() => {
      const codigo = this.pedido().codigo;
      untracked(() => {
        void codigo;
        this.lector?.abort();
        this.archivo.set(null);
        this.esperado = undefined;
        this.leyendo.set(false);
        this.error.set('');
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.lector?.abort();
      this.lector = undefined;
    });
  }
  protected seleccionar(evento: Event) {
    if (this.ocupado()) return;
    const entrada = evento.target as HTMLInputElement,
      file = entrada.files?.[0];
    this.lector?.abort();
    this.lector = undefined;
    this.leyendo.set(false);
    this.archivo.set(null);
    this.error.set('');
    if (!file) return;
    if (
      !FORMATOS_COMPROBANTE.some((t) => t === file.type) ||
      !file.size ||
      file.size > MAXIMO_COMPROBANTE
    ) {
      this.error.set('Elige una imagen PNG, JPG o WebP de hasta 5 MB.');
      return;
    }
    const p = this.pedido();
    this.esperado = {
      versionPedido: p.version!,
      versionPago: p.versionPago!,
      comprobanteId: p.comprobante.id!,
    };
    const lector = new FileReader();
    this.lector = lector;
    this.leyendo.set(true);
    lector.onload = () => {
      if (this.lector !== lector) return;
      this.leyendo.set(false);
      this.archivo.set({
        nombreArchivo: file.name,
        tipoArchivo: file.type,
        tamanoBytes: file.size,
        vistaPrevia: String(lector.result),
      });
    };
    lector.onerror = () => {
      if (this.lector === lector) {
        this.leyendo.set(false);
        this.error.set('No pudimos leer el archivo. Selecciónalo nuevamente.');
      }
    };
    lector.readAsDataURL(file);
  }
  protected cambiarOperacion(evento: Event) {
    const e = evento.target as HTMLInputElement;
    e.value = e.value.replace(/\D/g, '').slice(0, 12);
    this.operacion.set(e.value);
  }
  protected async enviar(evento: Event) {
    evento.preventDefault();
    const archivo = this.archivo(),
      esperado = this.esperado,
      codigo = this.pedido().codigo;
    if (this.ocupado() || !archivo || !esperado) return;
    this.ocupado.set(true);
    this.error.set('');
    const r = await this.pedidos.corregir(
      codigo,
      { ...archivo, ...(this.operacion() ? { numeroOperacion: this.operacion() } : {}) },
      esperado,
    );
    if (codigo !== this.pedido().codigo) return;
    this.ocupado.set(false);
    if (!r.correcto) this.error.set(r.mensaje);
    else this.archivo.set(null);
  }
}
