import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Icono } from '../../../compartido/componentes/icono/icono';
import { VentanaDialogo } from '../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { ArchivoQrPago, BilleteraPago } from './modelos/configuracion-pagos';
import { ConfiguracionPagosApi } from './servicios/configuracion-pagos-api';
@Component({
  selector: 'app-configuracion-pagos',
  imports: [FormsModule, RouterLink, Icono, VentanaDialogo],
  templateUrl: './pagos.html',
  styleUrl: './pagos.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'antesDeSalir($event)' },
})
export class Pagos implements OnInit {
  readonly estado = inject(ConfiguracionPagosApi);
  protected readonly errorAccion = signal('');
  protected readonly erroresArchivo = signal<ReadonlyMap<BilleteraPago, string>>(new Map());
  protected readonly imagenesFallidas = signal<ReadonlySet<string>>(new Set());
  private readonly qrAmpliado = signal<ArchivoQrPago | null>(null);
  protected readonly ampliado = computed(() => (this.estado.actual() ? this.qrAmpliado() : null));
  protected readonly listaErrores = computed(() => Object.values(this.estado.errores()));
  private readonly resumen = viewChild<ElementRef<HTMLElement>>('resumen');
  private destruido = false;
  constructor() {
    effect(() => {
      if (!this.estado.actual()) {
        this.qrAmpliado.set(null);
        this.imagenesFallidas.set(new Set());
        this.erroresArchivo.set(new Map());
        this.errorAccion.set('');
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      this.estado.salir();
    });
  }
  ngOnInit() {
    void this.estado.abrir();
  }
  protected nombre(m: BilleteraPago) {
    return m === 'YAPE' ? 'Yape' : 'Plin';
  }
  protected fecha(v: string) {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(v));
  }
  protected async guardar(m?: BilleteraPago, activo?: boolean) {
    this.errorAccion.set('');
    const identidad = this.estado.actual();
    try {
      await this.estado.guardarDirecto(m, activo);
    } catch (e) {
      if (!this.destruido && this.estado.actual() === identidad) {
        this.errorAccion.set(e instanceof Error ? e.message : 'No pudimos guardar los cambios.');
        setTimeout(() => this.resumen()?.nativeElement.focus());
      }
    }
  }
  protected async cargar(e: Event, m: BilleteraPago) {
    const entrada = e.target as HTMLInputElement,
      archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo || !this.estado.editable(m)) return;
    this.erroresArchivo.update((v) => {
      const n = new Map(v);
      n.delete(m);
      return n;
    });
    const identidad = this.estado.actual();
    try {
      await this.estado.cargarQr(m, archivo);
      await this.aplicarQr(m);
    } catch (e) {
      if (!this.destruido && this.estado.actual() === identidad)
        this.erroresArchivo.update((v) =>
          new Map(v).set(m, e instanceof Error ? e.message : 'No pudimos guardar el QR.'),
        );
    }
  }
  private async aplicarQr(m: BilleteraPago) {
    const carga = this.estado.carga(m);
    if (this.destruido || carga?.fase !== 'confirmada' || !this.estado.editable(m)) return;
    this.estado.usarQr(m);
    await this.guardar(m);
  }
  protected async recuperarCarga(m: BilleteraPago) {
    await this.estado.recuperarCarga(m);
    await this.aplicarQr(m);
  }
  protected async quitarQr(m: BilleteraPago) {
    if (!this.estado.editable(m)) return;
    this.estado.quitarQr(m);
    await this.guardar(m);
  }
  protected async recuperarGuardado(reenviar = false) {
    if (reenviar) await this.estado.reenviarPublicacion();
    else await this.estado.recuperarPublicacion();
    if (!this.destruido && this.estado.publicacion()?.fase === 'confirmada')
      this.estado.cerrarPublicacion();
  }
  protected descartar() {
    if (window.confirm('¿Descartar los cambios sin guardar y recuperar los datos actuales?'))
      this.estado.descartar();
  }
  protected ampliar(a: ArchivoQrPago) {
    if (a.estado === 'DISPONIBLE') this.qrAmpliado.set(a);
  }
  protected cerrarAmpliado() {
    this.qrAmpliado.set(null);
  }
  protected falloImagen(id: string) {
    this.imagenesFallidas.update((s) => new Set(s).add(id));
  }
  protected reintentarImagen(id: string) {
    this.imagenesFallidas.update((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }
  puedeSalir() {
    if (this.estado.publicacion()?.fase === 'enviando' || this.estado.cargasPendientes())
      return false;
    return (
      !this.estado.cambios() ||
      window.confirm('Tienes cambios de Pagos sin guardar. ¿Quieres salir?')
    );
  }
  antesDeSalir(e: BeforeUnloadEvent) {
    if (this.estado.cambios() || this.estado.cargasPendientes() || this.estado.publicacion()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
