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
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Cuenta } from '../cuenta/servicios/cuenta';
import { Carrito } from '../carrito/servicios/carrito';
import { Pedidos } from '../pedidos/servicios/pedidos';
import { ComprobantePago } from '../pedidos/modelos/comprobante-pago';
import { DatosEntrega as DatosCompra } from './modelos/datos-entrega';
import { ValidacionEntrega } from './modelos/validacion-entrega';
import { MetodoCheckout, PreparacionCompra } from './modelos/contrato-checkout';
import { CoberturaEntrega } from './servicios/cobertura-entrega';
import { CheckoutPagosApi } from './servicios/checkout-pagos-api';
import { DatosEntrega } from './componentes/datos-entrega/datos-entrega';
import { CabeceraCompra } from './componentes/cabecera-compra/cabecera-compra';
import { PieCompra } from './componentes/pie-compra/pie-compra';
import { ResumenCheckout } from './componentes/resumen-checkout/resumen-checkout';
import { InstruccionesCompra } from './componentes/instrucciones-compra/instrucciones-compra';
import { ImagenComprobante } from './componentes/imagen-comprobante/imagen-comprobante';
import { VentanaDialogo } from '../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { FACTURACION_INICIAL } from './modelos/facturacion';
import { Icono } from '../../compartido/componentes/icono/icono';
import { ArticuloPedido } from '../pedidos/modelos/articulo-pedido';

@Component({
  selector: 'app-checkout-compra',
  imports: [
    RouterLink,
    DatosEntrega,
    CabeceraCompra,
    PieCompra,
    ResumenCheckout,
    InstruccionesCompra,
    ImagenComprobante,
    VentanaDialogo,
    Icono,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-compra.html',
  styleUrls: ['./checkout-estructura.css', './checkout-compra.css'],
})
export class CheckoutCompra implements OnInit {
  protected readonly cuenta = inject(Cuenta);
  protected readonly carrito = inject(Carrito);
  protected readonly pedidos = inject(Pedidos);
  protected readonly cobertura = inject(CoberturaEntrega);
  protected readonly pagos = inject(CheckoutPagosApi);
  private readonly router = inject(Router);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly datos = signal<DatosCompra>({
    nombres: '',
    apellidos: '',
    correo: '',
    celular: '',
    distrito: '',
    direccion: '',
    referencia: '',
  });
  protected readonly paso = signal<1 | 2>(1);
  protected readonly metodo = signal<MetodoCheckout | null>(null);
  protected readonly iniciando = signal(true);
  protected readonly validando = signal(false);
  protected readonly registrando = signal(false);
  protected readonly error = signal('');
  protected readonly cargandoDirecciones = signal(false);
  protected readonly errorDirecciones = signal('');
  protected readonly seleccionada = signal('');
  protected readonly confirmandoCambio = signal(false);
  protected readonly metodoPendiente = signal<MetodoCheckout | null>(null);
  private readonly duenoDirecciones = signal<string | null>(null);
  protected readonly direcciones = computed(() =>
    this.duenoDirecciones() === this.cuenta.perfil()?.id ? this.cuenta.direcciones() : [],
  );
  protected readonly entrega = computed(() => this.cobertura.cotizar(this.datos().distrito));
  protected readonly datosPago = computed(() => {
    const i = this.pagos.instruccion();
    return i ? { ...i.preparacion.contacto, ...i.preparacion.entrega } : this.datos();
  });
  protected readonly entregaPago = computed(() => {
    const i = this.pagos.instruccion();
    return i
      ? {
          nombreDistrito: i.verificacion.distritoNombre,
          costo: Number(i.verificacion.costoEnvio),
          plazo: i.verificacion.plazoEntrega,
        }
      : this.entrega();
  });
  protected readonly subtotalPago = computed(() =>
    this.pagos.instruccion()
      ? Number(this.pagos.instruccion()!.verificacion.subtotal)
      : this.carrito.subtotal(),
  );
  protected readonly articulosPago = computed<readonly ArticuloPedido[]>(() => {
    const i = this.pagos.instruccion(),
      actuales = this.pedidos.articulos();
    const marca = (sku: string) =>
      this.carrito.lineas().find((l) => l.sku === sku)?.producto?.marca;
    if (!i) return actuales.map((a) => ({ ...a, marca: marca(a.sku) }));
    return i.verificacion.articulos.map((a) => ({
      sku: a.sku,
      nombre: a.nombreProducto,
      marca: marca(a.sku),
      color: a.color,
      talla: a.talla,
      cantidad: a.cantidad,
      precioUnitario: Number(a.precioUnitario),
      importe: Number(a.importe),
      imagen: actuales.find((p) => p.sku === a.sku)?.imagen ?? '',
    }));
  });
  protected readonly metodosPago = computed(() => {
    const metodos = this.pagos.metodos()?.metodos ?? [],
      i = this.pagos.instruccion();
    return i && !metodos.some((m) => m.metodo === i.metodo)
      ? [...metodos, { metodo: i.metodo, nombre: i.metodo === 'YAPE' ? 'Yape' : 'Plin' }]
      : metodos;
  });
  protected readonly metodoSeleccionado = computed(
    () => this.pagos.instruccion()?.metodo ?? this.metodo(),
  );
  protected readonly ocupado = computed(
    () => this.iniciando() || this.validando() || this.registrando() || this.pagos.ocupado(),
  );
  protected readonly sesionPendiente = computed(() =>
    ['inicial', 'cargando'].includes(this.cuenta.estadoSesion()),
  );
  private revision = 0;
  private destruido = false;
  constructor() {
    let anterior: string | null | undefined;
    effect(() => {
      const p = this.cuenta.perfil();
      if (p?.id === anterior || (!p && anterior === null)) return;
      untracked(() => {
        anterior = p?.id ?? null;
        this.revision++;
        this.datos.set({
          nombres: p?.nombres ?? '',
          apellidos: p?.apellidos ?? '',
          correo: p?.correo ?? '',
          celular: p?.celular ?? '',
          distrito: '',
          direccion: '',
          referencia: '',
        });
        this.paso.set(1);
        this.confirmandoCambio.set(false);
        this.metodoPendiente.set(null);
        this.metodo.set(null);
        this.duenoDirecciones.set(null);
        this.seleccionada.set('');
        if (p) void this.cargarDirecciones();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      this.revision++;
      this.cobertura.invalidar();
    });
  }
  async ngOnInit() {
    try {
      await this.cuenta.comprobarSesion();
      await Promise.all([this.cobertura.cargar(), this.pagos.cargarMetodos()]);
      const anterior = await this.pedidos.recuperarPendiente();
      if (this.destruido) return;
      if (anterior?.correcto) {
        await this.router.navigate(['/pedido', anterior.pedido.codigo]);
        return;
      }
      if (!this.pedidos.envioPendiente()) {
        const recuperado = await this.pagos.recuperarCheckout();
        if (!this.destruido && this.pagos.instruccion()) this.paso.set(2);
        await this.abrirRecepcion(recuperado);
      }
    } finally {
      if (!this.destruido) this.iniciando.set(false);
    }
  }
  protected async cargarDirecciones() {
    const dueno = this.cuenta.perfil()?.id,
      revision = ++this.revision;
    if (!dueno) return;
    this.cargandoDirecciones.set(true);
    this.errorDirecciones.set('');
    const r = await this.cuenta.cargarDirecciones();
    if (this.destruido || revision !== this.revision || this.cuenta.perfil()?.id !== dueno) return;
    this.cargandoDirecciones.set(false);
    if (r.correcto) this.duenoDirecciones.set(dueno);
    else this.errorDirecciones.set(r.mensaje);
  }
  protected usarDireccion(id: string) {
    if (this.ocupado() || this.pagos.instruccion()) return;
    const d = this.direcciones().find((v) => v.id === id);
    this.seleccionada.set(id);
    this.actualizarDatos({
      ...this.datos(),
      destinatario: d?.destinatario ?? '',
      celular: d?.celular ?? '',
      distrito: d?.distrito ?? '',
      direccion: d?.direccion ?? '',
      referencia: d?.referencia ?? '',
    });
  }
  protected actualizarDatos(d: DatosCompra) {
    if (this.pagos.instruccion() || this.pagos.intento()?.recepcion) return;
    const cambio = d.distrito !== this.datos().distrito;
    this.datos.set(d);
    if (cambio) void this.cobertura.confirmar(d.distrito);
  }
  protected async continuar(d: DatosCompra) {
    if (
      this.ocupado() ||
      this.sesionPendiente() ||
      this.pagos.requiereSesion() ||
      !this.carrito.puedeContinuar() ||
      Object.keys(ValidacionEntrega.errores(d)).length
    )
      return;
    this.datos.set(ValidacionEntrega.normalizar(d));
    this.error.set('');
    this.validando.set(true);
    const huella = JSON.stringify([
      this.datos(),
      this.carrito.lineas().map((l) => [l.sku, l.cantidad, l.importe]),
      this.cuenta.perfil()?.id,
    ]);
    const anterior = this.entrega();
    try {
      const nueva = await this.cobertura.confirmar(d.distrito);
      if (
        this.destruido ||
        huella !==
          JSON.stringify([
            this.datos(),
            this.carrito.lineas().map((l) => [l.sku, l.cantidad, l.importe]),
            this.cuenta.perfil()?.id,
          ])
      )
        return;
      if (!nueva) {
        this.error.set(
          this.cobertura.mensajeCotizacion() || 'Selecciona un distrito con entrega disponible.',
        );
        return;
      }
      if (anterior && (anterior.costo !== nueva.costo || anterior.plazo !== nueva.plazo)) {
        this.error.set('El envío cambió. Revisa el resumen y continúa nuevamente.');
        return;
      }
      this.paso.set(2);
    } finally {
      this.validando.set(false);
    }
  }
  protected cambiarPaso(paso: 1 | 2) {
    if (this.ocupado()) return;
    if (this.pagos.intento()?.recepcion || this.pedidos.envioPendiente()) {
      this.error.set(
        'Conserva el envío de tu comprobante y consulta su estado antes de cambiar la compra.',
      );
      return;
    }
    if (this.pagos.instruccion()) {
      if (paso === 1) {
        this.metodoPendiente.set(null);
        this.confirmandoCambio.set(true);
      }
      return;
    }
    if (paso === 2) void this.continuar(this.datos());
    else this.paso.set(1);
  }
  protected async emitir() {
    const metodo = this.metodo(),
      d = this.datos(),
      e = this.entrega(),
      articulos = this.pedidos.articulos();
    if (
      !metodo ||
      !e ||
      this.ocupado() ||
      !this.carrito.puedeContinuar() ||
      !articulos.length ||
      Object.keys(ValidacionEntrega.errores(d)).length
    )
      return;
    this.error.set('');
    const f = d.facturacion;
    const preparacion: PreparacionCompra = {
      contacto: { nombres: d.nombres, apellidos: d.apellidos, correo: d.correo },
      entrega: {
        destinatario: d.destinatario || `${d.nombres} ${d.apellidos}`,
        celular: d.celular,
        distrito: d.distrito,
        direccion: d.direccion,
        referencia: d.referencia,
      },
      ...(f
        ? {
            facturacion:
              f.tipo === 'factura'
                ? {
                    tipo: 'FACTURA' as const,
                    tipoDocumento: 'RUC' as const,
                    numeroDocumento: f.ruc,
                    razonSocial: f.razonSocial,
                    domicilioFiscal: f.domicilioFiscal,
                  }
                : {
                    tipo: 'BOLETA' as const,
                    tipoDocumento: f.documento,
                    numeroDocumento: f.numero,
                  },
          }
        : {}),
      articulos: articulos
        .map((a) => ({
          sku: a.sku,
          cantidad: a.cantidad,
          precioUnitarioEsperado: a.precioUnitario.toFixed(2),
        }))
        .sort((a, b) => a.sku.localeCompare(b.sku)),
      cotizacion: {
        costoEnvio: e.costo.toFixed(2),
        plazoEntrega: e.plazo ?? null,
        total: (
          (Math.round(this.carrito.subtotal() * 100) + Math.round(e.costo * 100)) /
          100
        ).toFixed(2),
      },
    };
    await this.pagos.emitir(preparacion, metodo);
  }
  protected async elegirMetodo(metodo: MetodoCheckout, evento?: Event) {
    if (this.ocupado() || this.pagos.intento()?.recepcion) return;
    const i = this.pagos.instruccion();
    if (i) evento?.preventDefault();
    if (i?.metodo === metodo) return;
    if (i) {
      this.metodoPendiente.set(metodo);
      this.confirmandoCambio.set(true);
      return;
    }
    this.metodo.set(metodo);
    await this.emitir();
  }
  protected cerrarCambio() {
    this.confirmandoCambio.set(false);
    this.metodoPendiente.set(null);
  }
  protected async recuperar(reintentar = false) {
    if (this.ocupado()) return;
    this.registrando.set(true);
    try {
      const recuperado = reintentar
        ? await this.pagos.reintentar()
        : await this.pagos.recuperar();
      if (this.pagos.instruccion()) this.paso.set(2);
      await this.abrirRecepcion(recuperado);
    } finally {
      this.registrando.set(false);
    }
  }
  protected async enviar(c: ComprobantePago) {
    if (this.ocupado()) return;
    this.registrando.set(true);
    try {
      const recibido = await this.pagos.recibir(c);
      await this.abrirRecepcion(recibido);
    } finally {
      this.registrando.set(false);
    }
  }
  private async abrirRecepcion(completar: boolean) {
    const id = this.pagos.consulta()?.recepcion.id;
    if (!id || this.destruido) return;
    const codigo = completar ? await this.pagos.completarRegistro() : null;
    if (this.destruido || this.pagos.consulta()?.recepcion.id !== id) return;
    await this.router.navigate(codigo ? ['/pedido', codigo] : ['/recepcion', id]);
  }
  protected async cambiarAntesDePagar(metodoNuevo?: MetodoCheckout) {
    if (this.ocupado() || this.pagos.intento()?.recepcion) return;
    const instruccion = this.pagos.instruccion();
    if (!(await this.pagos.cambiarAntesDePagar()) || this.destruido) return;
    if (instruccion) {
      const { contacto, entrega, facturacion: f } = instruccion.preparacion;
      this.datos.set({
        ...contacto,
        celular: entrega.celular,
        distrito: entrega.distrito,
        direccion: entrega.direccion,
        referencia: entrega.referencia ?? '',
        destinatario: entrega.destinatario ?? '',
        ...(f
          ? {
              facturacion:
                f.tipo === 'FACTURA'
                  ? {
                      ...FACTURACION_INICIAL,
                      tipo: 'factura',
                      ruc: f.numeroDocumento,
                      razonSocial: f.razonSocial ?? '',
                      domicilioFiscal: f.domicilioFiscal ?? '',
                    }
                  : {
                      ...FACTURACION_INICIAL,
                      tipo: 'boleta',
                      documento: f.tipoDocumento as 'DNI' | 'CE' | 'PAS',
                      numero: f.numeroDocumento,
                    },
            }
          : {}),
      });
      this.seleccionada.set('');
      if (metodoNuevo) {
        this.validando.set(true);
        try {
          await this.cobertura.confirmar(entrega.distrito);
        } finally {
          this.validando.set(false);
        }
      } else void this.cobertura.confirmar(entrega.distrito);
    }
    this.error.set('');
    this.cerrarCambio();
    if (metodoNuevo) {
      this.metodo.set(metodoNuevo);
      this.paso.set(2);
      await this.emitir();
      return;
    }
    this.paso.set(1);
    setTimeout(() => {
      if (!this.destruido)
        this.elemento.nativeElement.querySelector<HTMLElement>('#entrega-correo')?.focus();
    });
  }
  protected async recuperarAnterior() {
    if (this.ocupado()) return;
    this.validando.set(true);
    try {
      const r = await this.pedidos.reintentarPendiente();
      if (r?.correcto) await this.router.navigate(['/pedido', r.pedido.codigo]);
      else this.error.set(r?.mensaje ?? 'Comprueba el envío anterior.');
    } finally {
      this.validando.set(false);
    }
  }
}
