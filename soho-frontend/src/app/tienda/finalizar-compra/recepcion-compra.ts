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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Cuenta } from '../cuenta/servicios/cuenta';
import { identidadCuenta } from '../cuenta/modelos/cuenta';
import { ComprobantePago } from '../pedidos/modelos/comprobante-pago';
import { CheckoutPagosApi } from './servicios/checkout-pagos-api';
import { CabeceraCompra } from './componentes/cabecera-compra/cabecera-compra';
import { PieCompra } from './componentes/pie-compra/pie-compra';
import { InstruccionesCompra } from './componentes/instrucciones-compra/instrucciones-compra';
import { ImagenComprobante } from './componentes/imagen-comprobante/imagen-comprobante';

@Component({
  selector: 'app-recepcion-compra',
  imports: [RouterLink, CabeceraCompra, PieCompra, InstruccionesCompra, ImagenComprobante],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recepcion-compra.html',
  styleUrls: ['./checkout-estructura.css', './checkout-compra.css'],
})
export class RecepcionCompra {
  protected readonly pagos = inject(CheckoutPagosApi);
  private readonly cuenta = inject(Cuenta);
  private readonly identidadUsuario = computed(() => identidadCuenta(this.cuenta.perfil()));
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly id = signal('');
  protected readonly cargando = signal(true);
  protected readonly ocupado = computed(() => this.cargando() || this.pagos.ocupado());
  protected readonly imagen = signal<string | null>(null);
  protected readonly consulta = computed(() => {
    const c = this.pagos.consulta();
    return c?.recepcion.id === this.id() ? c : null;
  });
  protected readonly titulo = computed(() => {
    switch (this.consulta()?.recepcion.estado) {
      case 'RECIBIENDO':
        return 'Estamos recibiendo tu comprobante';
      case 'RECIBIDA':
        return this.ocupado() ? 'Estamos registrando tu pedido' : 'Tu comprobante fue recibido';
      case 'REQUIERE_ATENCION':
        return 'Tu compra necesita atención';
      case 'PEDIDO_CREADO':
        return 'Tu pedido está registrado';
      default:
        return 'Consulta tu recepción';
    }
  });
  private turno = 0;
  private revision = 0;
  private destruido = false;
  constructor() {
    effect(() => {
      this.consulta()?.recepcion.comprobante.id;
      this.identidadUsuario();
      untracked(() => this.cerrarImagen());
    });
    this.ruta.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.id.set(p.get('id') ?? '');
      this.cerrarImagen();
      void this.cargar();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      this.revision++;
      this.cerrarImagen();
    });
  }
  protected async cargar() {
    const id = this.id();
    await this.continuar(() => this.pagos.abrir(id));
  }
  private async continuar(accion: () => Promise<boolean>) {
    const revision = ++this.revision,
      id = this.id(),
      identidad = this.identidadUsuario();
    const vigente = () =>
      !this.destruido &&
      revision === this.revision &&
      id === this.id() &&
      identidad === this.identidadUsuario();
    this.cargando.set(true);
    try {
      if (!(await accion()) || !vigente() || !this.consulta()) return;
      const codigo = await this.pagos.completarRegistro();
      if (codigo && vigente()) await this.router.navigate(['/pedido', codigo]);
    } finally {
      if (!this.destruido && revision === this.revision) this.cargando.set(false);
    }
  }
  protected async procesar() {
    if (!this.ocupado()) await this.continuar(async () => true);
  }
  protected async corregir(c: ComprobantePago) {
    if (this.ocupado()) return;
    this.cerrarImagen();
    await this.continuar(() => this.pagos.corregir(c));
  }
  protected async reintentar() {
    if (!this.ocupado()) await this.continuar(() => this.pagos.reintentar());
  }
  protected async reenviar(c: ComprobantePago) {
    if (!this.ocupado()) await this.continuar(() => this.pagos.recibir(c));
  }
  protected async abrirImagen() {
    this.cerrarImagen();
    const turno = this.turno;
    const url = await this.pagos.comprobante();
    if (!url) return;
    if (this.destruido || turno !== this.turno) URL.revokeObjectURL(url);
    else this.imagen.set(url);
  }
  protected cerrarImagen() {
    this.turno++;
    const url = this.imagen();
    if (url) URL.revokeObjectURL(url);
    this.imagen.set(null);
  }
  protected async verPedido() {
    await this.procesar();
  }
  protected async nuevaCompra() {
    if (await this.pagos.nuevaCompra()) await this.router.navigate(['/finalizar-compra']);
  }
}
