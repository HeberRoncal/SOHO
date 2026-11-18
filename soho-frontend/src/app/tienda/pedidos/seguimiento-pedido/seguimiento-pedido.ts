import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Pedidos } from '../servicios/pedidos';
import { CabeceraCompra } from '../../finalizar-compra/componentes/cabecera-compra/cabecera-compra';
import { PieCompra } from '../../finalizar-compra/componentes/pie-compra/pie-compra';
import { ResumenCheckout } from '../../finalizar-compra/componentes/resumen-checkout/resumen-checkout';
import { VentanaDialogo } from '../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { Icono } from '../../../compartido/componentes/icono/icono';
import { Cuenta } from '../../cuenta/servicios/cuenta';
import { identidadCuenta } from '../../cuenta/modelos/cuenta';
import { estadoPedido } from '../modelos/pedido';
import { CorreccionComprobante } from '../correccion-comprobante/correccion-comprobante';
@Component({
  imports: [
    RouterLink,
    CabeceraCompra,
    PieCompra,
    ResumenCheckout,
    VentanaDialogo,
    Icono,
    CorreccionComprobante,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-seguimiento-pedido',
  styleUrls: ['./seguimiento-pedido.css', './confirmacion-pedido.css'],
  templateUrl: './seguimiento-pedido.html',
})
export class SeguimientoPedido {
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly pedidos = inject(Pedidos);
  protected readonly cuenta = inject(Cuenta);
  private readonly identidadUsuario = computed(() => identidadCuenta(this.cuenta.perfil()));
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  protected readonly codigo = computed(() => this.parametros().get('codigo') ?? '');
  protected readonly pedido = computed(() => this.pedidos.obtener(this.codigo()));
  protected readonly vistaPrevia = computed(() => this.pedidos.obtenerVistaPrevia(this.codigo()));
  protected readonly estadoAbierto = signal(false);
  protected readonly comprobanteAbierto = signal(false);
  protected readonly copiado = signal(false);
  protected readonly errorCopia = signal('');
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly cargandoImagen = signal(false);
  protected readonly errorImagen = signal('');
  protected readonly estado = computed(() => (this.pedido() ? estadoPedido(this.pedido()!) : ''));
  protected readonly estadosPago = {
    pendiente: 'Pendiente de revisión',
    observado: 'Comprobante observado',
    aprobado: 'Pago aprobado',
    rechazado: 'Pago rechazado',
    anulado: 'Pago anulado',
  } as const;
  protected readonly mensajeEstado = computed(() => {
    const p = this.pedido();
    if (p?.estadoPreparacion === 'cancelado')
      return 'El pedido está cancelado. Conservamos su información para consulta.';
    if (p?.estadoPreparacion === 'entregado')
      return 'La entrega de tu pedido quedó registrada. Puedes consultar aquí sus datos.';
    if (p?.estadoPreparacion === 'enviado')
      return 'Tu pedido fue despachado. Consulta el transportista y la referencia de seguimiento.';
    if (p?.estadoPreparacion === 'en-preparacion')
      return 'Estamos preparando tus zapatillas para el despacho.';
    if (p?.estadoPago === 'aprobado')
      return 'SOHO verificó el ingreso. Consulta aquí el avance de tu pedido.';
    if (p?.estadoPago === 'observado')
      return 'Revisa la observación y adjunta un comprobante corregido en este mismo pedido.';
    if (p?.estadoPago === 'rechazado')
      return 'El pago fue rechazado. Revisa el motivo indicado por SOHO.';
    return 'Recibimos tu pedido y su comprobante. SOHO revisará el abono antes de confirmar la compra.';
  });
  protected readonly tituloConfirmacion = computed(() => {
    const p = this.pedido();
    return p?.estadoPreparacion === 'entregado'
      ? 'Pedido entregado'
      : p?.estadoPreparacion === 'enviado'
        ? 'Pedido enviado'
        : p?.estadoPreparacion === 'en-preparacion'
          ? 'Pedido en preparación'
          : p?.estadoPreparacion === 'cancelado'
            ? 'Pedido cancelado'
            : p?.estadoPago === 'aprobado'
              ? '¡Pedido confirmado!'
              : p?.estadoPago === 'observado'
                ? 'Revisa tu comprobante'
                : p?.estadoPago === 'rechazado'
                  ? 'Pago rechazado'
                  : '¡Pedido registrado!';
  });
  private readonly formatoEnvio = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  });
  protected fechaEnvio(v: string) {
    return this.formatoEnvio.format(new Date(v));
  }
  private revision = 0;
  private revisionImagen = 0;
  constructor() {
    effect((onCleanup) => {
      const codigo = this.codigo();
      this.identidadUsuario();
      untracked(() => {
        this.revision++;
        this.revisionImagen++;
        this.cargando.set(false);
        this.cargandoImagen.set(false);
        this.estadoAbierto.set(false);
        this.comprobanteAbierto.set(false);
        this.error.set('');
        if (codigo) void this.actualizar();
      });
      onCleanup(() => {
        this.revision++;
        this.pedidos.liberarComprobante(codigo);
      });
    });
  }
  protected async actualizar() {
    const revision = ++this.revision,
      codigo = this.codigo();
    this.cargando.set(true);
    this.error.set('');
    const r = await this.pedidos.cargar(codigo);
    if (revision !== this.revision || codigo !== this.codigo()) return;
    this.cargando.set(false);
    if (!r.correcto) this.error.set(r.mensaje);
  }
  protected async abrirComprobante() {
    if (this.cargandoImagen()) return;
    const codigo = this.codigo(),
      revision = this.revision,
      revisionImagen = ++this.revisionImagen;
    this.comprobanteAbierto.set(true);
    this.cargandoImagen.set(true);
    this.errorImagen.set('');
    const r = await this.pedidos.cargarComprobante(codigo);
    if (
      codigo !== this.codigo() ||
      revision !== this.revision ||
      revisionImagen !== this.revisionImagen
    )
      return;
    this.cargandoImagen.set(false);
    if (!r.correcto) this.errorImagen.set(r.mensaje);
  }
  protected cerrarComprobante() {
    this.revisionImagen++;
    this.comprobanteAbierto.set(false);
    this.cargandoImagen.set(false);
    this.pedidos.liberarComprobante(this.codigo());
  }
  protected readonly etapasEstado = computed(() => {
    const pedido = this.pedido();
    const preparacion = pedido?.estadoPreparacion;
    const pago = pedido?.estadoPago;
    const actual =
      preparacion === 'entregado'
        ? 5
        : preparacion === 'enviado'
          ? 4
          : preparacion === 'en-preparacion'
            ? 3
            : preparacion === 'confirmado'
              ? 2
              : pago === 'aprobado'
                ? 1
                : 0;
    return [
      ['Comprobante recibido', 'Registramos los datos y el comprobante de tu pedido.'],
      ['Pago verificado', 'El equipo de SOHO confirmará que el abono llegó.'],
      ['Pedido confirmado', 'La compra quedará confirmada al validar el pago.'],
      ['Pedido en preparación', 'Estamos preparando tus zapatillas para el despacho.'],
      ['Pedido enviado', 'Tu pedido está en camino.'],
      ['Pedido entregado', 'La entrega ha finalizado.'],
    ].map(([nombre, descripcion], indice) => ({
      nombre,
      descripcion,
      fecha:
        indice === 3
          ? pedido?.envio?.preparacionIniciadaEn
          : indice === 4
            ? pedido?.envio?.despachadoEn
            : indice === 5
              ? pedido?.envio?.entregadoEn
              : null,
      completado: indice <= actual,
      activo:
        indice === actual + 1 &&
        !['cancelado', 'incidencia'].includes(preparacion ?? '') &&
        !['observado', 'rechazado', 'anulado'].includes(pago ?? ''),
      estado:
        indice <= actual
          ? 'Completado'
          : indice === 1 && (pago === 'rechazado' || pago === 'observado')
            ? 'Necesita revisión'
            : 'Pendiente',
    }));
  });
  protected readonly fecha = computed(() => {
    const fecha = this.pedido()?.fecha;
    return fecha
      ? new Intl.DateTimeFormat('es-PE', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'America/Lima',
        }).format(new Date(fecha))
      : '';
  });
  protected async copiarCodigo() {
    try {
      await navigator.clipboard.writeText(this.codigo());
      this.copiado.set(true);
      this.errorCopia.set('');
    } catch {
      this.errorCopia.set('No se pudo copiar. Selecciona el código y cópialo.');
    }
  }
  protected buscar(evento: Event, campo: HTMLInputElement) {
    evento.preventDefault();
    const codigo = campo.value.trim().toUpperCase();
    if (!codigo) {
      campo.focus();
      return;
    }
    void this.router.navigate(['/pedido', codigo]);
    this.estadoAbierto.set(false);
    this.copiado.set(false);
  }
}
