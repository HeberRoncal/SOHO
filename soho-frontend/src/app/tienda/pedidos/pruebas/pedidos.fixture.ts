import { Injectable, computed, inject, signal } from '@angular/core';
import { Carrito } from '../../carrito/servicios/carrito';
import { CoberturaEntrega } from '../../finalizar-compra/servicios/cobertura-entrega';
import { DatosEntrega } from '../../finalizar-compra/modelos/datos-entrega';
import { ValidacionEntrega } from '../../finalizar-compra/modelos/validacion-entrega';
import { ArticuloPedido } from '../modelos/articulo-pedido';
import {
  ComprobantePago,
  FORMATOS_COMPROBANTE,
  MAXIMO_COMPROBANTE,
  MetodoPago,
} from '../modelos/comprobante-pago';
import { GestorPedidos } from '../modelos/gestor-pedidos';
import { Pedido } from '../modelos/pedido';
import { ResultadoPedido } from '../modelos/resultado-pedido';
import { descuentoPrueba } from './descuento.fixture';
import { Cuenta } from '../../cuenta/servicios/cuenta';

// Fuente local en memoria: no envía comprobantes ni crea compras o reservas reales.
// Los datos de contacto y domicilio no se escriben en almacenamiento del navegador.
@Injectable({ providedIn: 'root' })
export class PedidosPrueba implements GestorPedidos {
  readonly remoto = false;
  readonly envioPendiente = signal(false);
  readonly requiereSesion = signal(false);
  readonly accesoPersistente = signal(false);
  readonly estadoListado = signal<'inicial' | 'cargando' | 'lista' | 'error'>('lista');
  readonly mensajeListado = signal('');
  readonly paginacion = signal({ pagina: 1, limite: 20, total: 0, paginas: 0 });
  async cargar(codigo: string) {
    return { correcto: !!this.obtener(codigo), mensaje: '' };
  }
  async cargarMios(_pagina = 1) {
    return { correcto: true, mensaje: '' };
  }
  async cargarComprobante(codigo: string) {
    return { correcto: !!this.obtenerVistaPrevia(codigo), mensaje: '' };
  }
  liberarComprobante(_codigo: string) {}
  async corregir() {
    return { correcto: false, mensaje: 'Operación no preparada en esta prueba.' };
  }
  async recuperarPendiente() {
    return undefined;
  }
  async reintentarPendiente(): Promise<ResultadoPedido> {
    return { correcto: false, mensaje: 'Completa los datos de prueba.' };
  }
  continuarConDatos() {}
  private readonly cuenta = inject(Cuenta);
  private readonly carrito = inject(Carrito);
  private readonly cobertura = inject(CoberturaEntrega);
  private readonly pedidos = signal<ReadonlyMap<string, Pedido>>(new Map());
  private secuencia = 0;
  private readonly vistasPrevias = new Map<string, string>();
  readonly articulos = computed<readonly ArticuloPedido[]>(() =>
    this.carrito.lineas().flatMap((linea) =>
      linea.producto && linea.variante && linea.importe !== null
        ? [
            {
              sku: linea.sku,
              nombre: linea.producto.nombre,
              color: linea.color?.nombre ?? '',
              talla: linea.variante.talla,
              imagen: linea.color?.imagenes[0] ?? linea.producto.imagenes[0],
              cantidad: linea.cantidad,
              precioUnitario: linea.producto.precio,
              importe: linea.importe,
            },
          ]
        : [],
    ),
  );

  registrar(
    datos: DatosEntrega,
    metodo: MetodoPago,
    comprobante: ComprobantePago,
    cupon?: string,
  ): ResultadoPedido {
    if (!this.carrito.puedeContinuar())
      return { correcto: false, mensaje: 'Revisa los productos y las cantidades de tu carrito.' };
    if (Object.keys(ValidacionEntrega.errores(datos)).length)
      return { correcto: false, mensaje: 'Revisa los datos de contacto y entrega.' };
    const entrega = this.cobertura.cotizar(datos.distrito);
    if (!entrega)
      return { correcto: false, mensaje: 'El distrito seleccionado está fuera de cobertura.' };
    if (metodo !== 'Yape' && metodo !== 'Plin')
      return { correcto: false, mensaje: 'Selecciona Yape o Plin.' };
    if (
      !FORMATOS_COMPROBANTE.some((tipo) => tipo === comprobante.tipoArchivo) ||
      !Number.isSafeInteger(comprobante.tamanoBytes) ||
      comprobante.tamanoBytes <= 0 ||
      comprobante.tamanoBytes > MAXIMO_COMPROBANTE ||
      !comprobante.nombreArchivo.trim() ||
      !/^data:image\/(png|jpeg|webp);base64,/.test(comprobante.vistaPrevia)
    )
      return {
        correcto: false,
        mensaje: 'Adjunta una imagen válida del comprobante, de hasta 5 MB.',
      };
    const subtotal = this.carrito.subtotal();
    if (cupon && cupon !== 'DEMO10') return { correcto: false, mensaje: 'El cupón no es válido.' };
    if (comprobante.numeroOperacion && !/^\d{1,12}$/.test(comprobante.numeroOperacion))
      return { correcto: false, mensaje: 'Revisa el número de operación.' };
    const descuento = descuentoPrueba(subtotal, cupon);
    const normalizados = ValidacionEntrega.normalizar(datos);
    const pedido: Pedido = Object.freeze({
      ...(this.cuenta.perfil() ? { clienteId: this.cuenta.perfil()!.id } : {}),
      codigo: 'DEM-' + String(++this.secuencia).padStart(5, '0'),
      fecha: new Date().toISOString(),
      datos: Object.freeze({
        ...normalizados,
        ...(normalizados.facturacion
          ? { facturacion: Object.freeze(normalizados.facturacion) }
          : {}),
      }),
      entrega: Object.freeze({ ...entrega }),
      articulos: Object.freeze(this.articulos().map((articulo) => Object.freeze({ ...articulo }))),
      subtotal,
      total:
        (Math.round(subtotal * 100) -
          Math.round(descuento * 100) +
          Math.round(entrega.costo * 100)) /
        100,
      ...(cupon ? { cupon, descuento } : {}),
      metodoPago: metodo,
      comprobante: Object.freeze({
        nombreArchivo: comprobante.nombreArchivo,
        tipoArchivo: comprobante.tipoArchivo,
        tamanoBytes: comprobante.tamanoBytes,
        ...(comprobante.numeroOperacion ? { numeroOperacion: comprobante.numeroOperacion } : {}),
      }),
      estadoPago: 'pendiente',
      estadoPreparacion: 'pendiente',
    });
    this.pedidos.update((actuales) => new Map(actuales).set(pedido.codigo, pedido));
    this.vistasPrevias.set(pedido.codigo, comprobante.vistaPrevia);
    return { correcto: true, pedido };
  }
  obtener(codigo: string) {
    const pedido = this.pedidos().get(codigo);
    return pedido?.clienteId && pedido.clienteId !== this.cuenta.perfil()?.id ? undefined : pedido;
  }
  obtenerVistaPrevia(codigo: string) {
    return this.obtener(codigo) ? this.vistasPrevias.get(codigo) : undefined;
  }
  listarMios(): readonly Pedido[] {
    const cliente = this.cuenta.perfil()?.id;
    return cliente
      ? [...this.pedidos().values()].filter((pedido) => pedido.clienteId === cliente).reverse()
      : [];
  }
}
