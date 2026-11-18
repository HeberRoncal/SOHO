import {
  DestroyRef,
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../cuenta/servicios/estado-autenticacion';
import { GESTIONAR_401_LOCALMENTE } from '../../cuenta/servicios/autenticacion-interceptor';
import { Carrito } from '../../carrito/servicios/carrito';
import { FUENTE_CATALOGO } from '../../catalogo/modelos/fuente-catalogo';
import { CoberturaEntrega } from '../../finalizar-compra/servicios/cobertura-entrega';
import { DatosEntrega } from '../../finalizar-compra/modelos/datos-entrega';
import { ValidacionEntrega } from '../../finalizar-compra/modelos/validacion-entrega';
import { ComprobantePago, MetodoPago, MAXIMO_COMPROBANTE } from '../modelos/comprobante-pago';
import { ArticuloPedido } from '../modelos/articulo-pedido';
import { GestorPedidos } from '../modelos/gestor-pedidos';
import { Pedido } from '../modelos/pedido';
import { ResultadoPedido } from '../modelos/resultado-pedido';
import {
  CODIGO_PEDIDO,
  PAGINACION_PEDIDOS,
  SolicitudPedido,
  adaptarPaginacion,
  adaptarPedido,
  registro,
  ResultadoConsulta,
} from '../modelos/contrato-pedidos';
import { AccesoPedidos, ReferenciaPedido } from './acceso-pedidos';

type Identidad = { dueno: string | null; revision: number };
const cambiado = (): Extract<ResultadoPedido, { correcto: false }> => ({
  correcto: false,
  mensaje: 'La sesión cambió. Revisa tus pedidos antes de volver a comprar.',
});
const contexto = () => new HttpContext().set(GESTIONAR_401_LOCALMENTE, true);

@Injectable({ providedIn: 'root' })
export class PedidosApi implements GestorPedidos {
  private readonly injector = inject(Injector);
  private readonly cuenta = inject(Cuenta);
  private readonly estado = inject(EstadoAutenticacion);
  private readonly carrito = inject(Carrito);
  private readonly catalogo = inject(FUENTE_CATALOGO);
  private readonly cobertura = inject(CoberturaEntrega);
  private readonly accesos = inject(AccesoPedidos);
  private get http() {
    return this.injector.get(HttpClient);
  }
  readonly remoto = true;
  readonly accesoPersistente = this.accesos.persistente.asReadonly();
  readonly envioPendiente = signal(false);
  readonly requiereSesion = signal(false);
  readonly estadoListado = signal<'inicial' | 'cargando' | 'lista' | 'error'>('inicial');
  readonly mensajeListado = signal('');
  readonly paginacion = signal({ ...PAGINACION_PEDIDOS });
  private readonly cache = signal<ReadonlyMap<string, Pedido>>(new Map());
  private readonly listado = signal<readonly Pedido[]>([]);
  private readonly imagenes = signal<ReadonlyMap<string, string>>(new Map());
  private readonly revisionesImagen = new Map<string, number>();
  private duenoCache: string | null | undefined;
  private revisionCache = -1;
  private secuenciaListado = 0;
  private consultaListado?: { pagina: number; promesa: Promise<ResultadoConsulta> };
  private envio?: Promise<ResultadoPedido>;
  private memoria?: { clave: string; cuerpo: SolicitudPedido };
  readonly articulos = computed<readonly ArticuloPedido[]>(() =>
    this.carrito.lineas().flatMap((l) =>
      l.producto && l.variante && l.importe !== null
        ? [
            {
              sku: l.sku,
              nombre: l.producto.nombre,
              color: l.color?.nombre ?? '',
              talla: l.variante.talla,
              imagen: l.color?.imagenes[0] ?? l.producto.imagenes[0],
              cantidad: l.cantidad,
              precioUnitario: l.producto.precio,
              importe: l.importe,
            },
          ]
        : [],
    ),
  );

  constructor() {
    effect(() => {
      const sesion = this.cuenta.estadoSesion();
      this.cuenta.perfil();
      if (sesion === 'inicial' || sesion === 'cargando') return;
      untracked(() => this.sincronizar());
    });
    inject(DestroyRef).onDestroy(() => this.liberarImagenes());
  }
  private sincronizar() {
    const dueno = this.cuenta.perfil()?.id ?? null,
      revision = this.estado.revision;
    if (dueno === this.duenoCache && revision === this.revisionCache) return;
    if (this.duenoCache !== undefined && dueno !== this.duenoCache) this.memoria = undefined;
    this.duenoCache = dueno;
    this.revisionCache = revision;
    this.accesos.sincronizar(dueno);
    this.cache.set(new Map());
    this.listado.set([]);
    this.liberarImagenes();
    this.estadoListado.set('inicial');
    this.mensajeListado.set('');
    this.paginacion.set({ ...PAGINACION_PEDIDOS });
    this.consultaListado = undefined;
    this.secuenciaListado++;
    this.envio = undefined;
    this.requiereSesion.set(false);
    this.envioPendiente.set(this.accesos.referencia() !== null);
  }
  private async identificar(): Promise<Identidad> {
    const previo = this.cuenta.perfil()?.id;
    await this.cuenta.comprobarSesion();
    if (this.cuenta.estadoSesion() === 'error') throw Error('Sesión no disponible');
    if (previo && previo !== this.cuenta.perfil()?.id) throw Error('Sesión cambió');
    this.sincronizar();
    if (this.requiereSesion()) throw new HttpErrorResponse({ status: 401 });
    return { dueno: this.cuenta.perfil()?.id ?? null, revision: this.estado.revision };
  }
  private vigente(i: Identidad) {
    return (this.cuenta.perfil()?.id ?? null) === i.dueno && this.estado.revision === i.revision;
  }
  private headers(acceso?: string): Record<string, string> {
    return acceso ? { 'X-Pedido-Acceso': acceso } : {};
  }
  private guardar(p: Pedido) {
    if ((this.cache().get(p.codigo)?.version ?? 0) > (p.version ?? 0)) return;
    this.cache.update((m) => new Map(m).set(p.codigo, p));
  }
  obtener(codigo: string): Pedido | undefined {
    const cache = this.cache();
    return (this.cuenta.perfil()?.id ?? null) === this.duenoCache &&
      this.estado.revision === this.revisionCache
      ? cache.get(codigo)
      : undefined;
  }
  listarMios(): readonly Pedido[] {
    const listado = this.listado();
    return this.cuenta.perfil()?.id &&
      this.cuenta.perfil()?.id === this.duenoCache &&
      this.estado.revision === this.revisionCache
      ? listado
      : [];
  }
  obtenerVistaPrevia(codigo: string) {
    return this.obtener(codigo) ? this.imagenes().get(codigo) : undefined;
  }

  registrar(
    datos: DatosEntrega,
    metodo: MetodoPago,
    comprobante: ComprobantePago,
    cupon?: string,
  ): Promise<ResultadoPedido> {
    if (!['inicial', 'cargando'].includes(this.cuenta.estadoSesion())) this.sincronizar();
    if (this.envio) return this.envio;
    const envio = this.crear(datos, metodo, comprobante, cupon).finally(() => {
      if (this.envio === envio) this.envio = undefined;
    });
    this.envio = envio;
    return envio;
  }
  private async crear(
    datos: DatosEntrega,
    metodo: MetodoPago,
    comprobante: ComprobantePago,
    cupon?: string,
  ): Promise<ResultadoPedido> {
    let identidad: Identidad | undefined;
    try {
      identidad = await this.identificar();
      const anterior = this.accesos.referencia();
      if (anterior) {
        const p = await this.buscarCreacion(anterior, identidad);
        if (!this.vigente(identidad)) return cambiado();
        if (p) return this.aceptar(p, identidad);
      }
      let r = anterior,
        cuerpo: SolicitudPedido;
      if (r && this.memoria?.clave === r.clave) cuerpo = this.memoria.cuerpo;
      else {
        if (!this.carrito.puedeContinuar() || Object.keys(ValidacionEntrega.errores(datos)).length)
          return { correcto: false, mensaje: 'Revisa los datos y las cantidades de tu carrito.' };
        if (cupon)
          return {
            correcto: false,
            mensaje: 'Los cupones no están disponibles para esta compra.',
          };
        const entrega = this.cobertura.cotizar(datos.distrito);
        if (!entrega)
          return { correcto: false, mensaje: 'Confirma una tarifa de envío disponible.' };
        if (
          this.articulos().length > 50 ||
          this.articulos().reduce((s, a) => s + a.cantidad, 0) > 100
        )
          return {
            correcto: false,
            mensaje: 'El pedido admite hasta cincuenta variantes y cien pares.',
          };
        if (
          !['Yape', 'Plin'].includes(metodo) ||
          comprobante.tamanoBytes <= 0 ||
          comprobante.tamanoBytes > MAXIMO_COMPROBANTE ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(comprobante.tipoArchivo) ||
          !comprobante.vistaPrevia.startsWith(`data:${comprobante.tipoArchivo};base64,`)
        )
          return {
            correcto: false,
            mensaje: 'Adjunta una imagen válida del comprobante, de hasta 5 MB.',
          };
        const d = ValidacionEntrega.normalizar(datos),
          f = d.facturacion;
        r = this.accesos.preparar(identidad.dueno);
        cuerpo = {
          claveCreacion: r.clave,
          contacto: { nombres: d.nombres, apellidos: d.apellidos, correo: d.correo.toLowerCase() },
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
          articulos: this.articulos().map((a) => ({
            sku: a.sku,
            cantidad: a.cantidad,
            precioUnitarioEsperado: a.precioUnitario.toFixed(2),
          })),
          cotizacion: {
            costoEnvio: entrega.costo.toFixed(2),
            plazoEntrega: entrega.plazo ?? null,
            total: (
              (Math.round(this.carrito.subtotal() * 100) + Math.round(entrega.costo * 100)) /
              100
            ).toFixed(2),
          },
          metodoPago: metodo === 'Yape' ? 'YAPE' : 'PLIN',
          comprobante: {
            nombreArchivo: comprobante.nombreArchivo,
            tipoArchivo: comprobante.tipoArchivo,
            contenidoBase64: comprobante.vistaPrevia.slice(
              comprobante.vistaPrevia.indexOf(',') + 1,
            ),
            ...(comprobante.numeroOperacion
              ? { numeroOperacion: comprobante.numeroOperacion }
              : {}),
          },
        };
        this.memoria = { clave: r.clave, cuerpo };
      }
      return await this.enviar(cuerpo, r!, identidad);
    } catch (error) {
      if (identidad && !this.vigente(identidad)) return cambiado();
      return this.error(error);
    }
  }
  private async enviar(
    cuerpo: SolicitudPedido,
    r: ReferenciaPedido,
    identidad: Identidad,
  ): Promise<ResultadoPedido> {
    if (!this.vigente(identidad) || r.dueno !== identidad.dueno) return cambiado();
    try {
      const respuesta = await firstValueFrom(
        this.http.post<unknown>('/api/pedidos', cuerpo, {
          headers: this.headers(r.acceso),
          context: contexto(),
          timeout: 45000,
          withCredentials: true,
        }),
      );
      if (!this.vigente(identidad)) return cambiado();
      return this.aceptar(adaptarPedido(registro(respuesta)['pedido']), identidad);
    } catch (error) {
      if (!this.vigente(identidad)) return cambiado();
      if (
        error instanceof HttpErrorResponse &&
        error.status === 409 &&
        error.error?.codigo === 'CLAVE_CREACION_EN_USO'
      ) {
        try {
          const p = await this.buscarCreacion(r, identidad);
          if (p) return this.aceptar(p, identidad);
        } catch {
          /* Conserva la referencia para comprobarla después. */
        }
      }
      const incierto =
        !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
      this.envioPendiente.set(incierto);
      if (!incierto) this.memoria = undefined;
      const resultado = this.error(error);
      if (
        resultado.codigo &&
        ['PRECIO_CAMBIADO', 'STOCK_INSUFICIENTE', 'ARTICULO_NO_DISPONIBLE'].includes(
          resultado.codigo,
        )
      )
        this.catalogo.cargarSkus?.(cuerpo.articulos.map((a) => a.sku));
      return resultado;
    }
  }
  private async buscarCreacion(r: ReferenciaPedido, i: Identidad): Promise<Pedido | undefined> {
    try {
      const respuesta = await firstValueFrom(
        this.http.get<unknown>(`/api/pedidos/creacion/${r.clave}`, {
          headers: this.headers(r.acceso),
          context: contexto(),
          timeout: 15000,
          withCredentials: true,
        }),
      );
      if (!this.vigente(i)) throw Error('Sesión cambió');
      return adaptarPedido(registro(respuesta)['pedido']);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return undefined;
      throw error;
    }
  }
  private aceptar(p: Pedido, i: Identidad): ResultadoPedido {
    if (!this.vigente(i)) return cambiado();
    this.guardar(p);
    this.accesos.confirmar(p.codigo);
    this.memoria = undefined;
    this.envioPendiente.set(false);
    const huella = (a: readonly { sku: string; cantidad: number }[]) =>
      JSON.stringify(
        a.map((v) => [v.sku, v.cantidad]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      );
    if (huella(this.carrito.lineas()) === huella(p.articulos)) this.carrito.vaciar();
    this.catalogo.cargarSkus?.(p.articulos.map((a) => a.sku));
    this.estadoListado.set('inicial');
    return { correcto: true, pedido: p };
  }
  async recuperarPendiente(): Promise<ResultadoPedido | undefined> {
    let identidad: Identidad | undefined;
    try {
      identidad = await this.identificar();
      const r = this.accesos.referencia();
      if (!r) return undefined;
      const p = await this.buscarCreacion(r, identidad);
      if (!this.vigente(identidad)) return cambiado();
      if (p) return this.aceptar(p, identidad);
      this.envioPendiente.set(true);
      return {
        correcto: false,
        mensaje:
          'Aún no encontramos el pedido. Puedes comprobarlo nuevamente o volver a completar los datos y adjuntar el comprobante.',
      };
    } catch (error) {
      if (identidad && !this.vigente(identidad)) return cambiado();
      return this.error(error);
    }
  }
  async reintentarPendiente(): Promise<ResultadoPedido> {
    const inicial = { dueno: this.cuenta.perfil()?.id ?? null, revision: this.estado.revision };
    const recuperado = await this.recuperarPendiente();
    if (!this.vigente(inicial)) return cambiado();
    if (recuperado?.correcto) return recuperado;
    const r = this.accesos.referencia();
    if (r && this.memoria?.clave === r.clave) {
      try {
        return await this.enviar(this.memoria.cuerpo, r, await this.identificar());
      } catch (error) {
        return this.error(error);
      }
    }
    return recuperado ?? { correcto: false, mensaje: 'Completa los datos del pedido.' };
  }
  continuarConDatos() {
    this.memoria = undefined;
    this.envioPendiente.set(false);
  }

  async cargar(codigo: string): Promise<ResultadoConsulta> {
    let identidad: Identidad | undefined;
    if (!CODIGO_PEDIDO.test(codigo))
      return { correcto: false, mensaje: 'Revisa el código de tu pedido.' };
    try {
      identidad = await this.identificar();
      const i = identidad,
        acceso = i.dueno ? undefined : this.accesos.acceso(codigo);
      if (!i.dueno && !acceso)
        return {
          correcto: false,
          mensaje:
            'Si compraste con tu cuenta, inicia sesión. Si compraste como invitado, abre el pedido en la misma pestaña donde lo registraste.',
        };
      const respuesta = await firstValueFrom(
        this.http.get<unknown>(`/api/pedidos/${codigo}`, {
          headers: this.headers(acceso),
          context: contexto(),
          timeout: 15000,
          withCredentials: true,
        }),
      );
      if (!this.vigente(i)) return cambiado();
      const p = adaptarPedido(registro(respuesta)['pedido']);
      if (p.codigo !== codigo) throw Error('Pedido incoherente');
      this.guardar(p);
      return { correcto: true, mensaje: '' };
    } catch (error) {
      if (identidad && !this.vigente(identidad)) return cambiado();
      return this.error(error, true);
    }
  }
  cargarMios(pagina = 1): Promise<ResultadoConsulta> {
    this.sincronizar();
    if (this.consultaListado?.pagina === pagina) return this.consultaListado.promesa;
    const consulta = this.leerMios(pagina).finally(() => {
      if (this.consultaListado?.promesa === consulta) this.consultaListado = undefined;
    });
    this.consultaListado = { pagina, promesa: consulta };
    return consulta;
  }
  private async leerMios(pagina: number): Promise<ResultadoConsulta> {
    let identidad: Identidad | undefined;
    const secuencia = ++this.secuenciaListado;
    this.estadoListado.set('cargando');
    this.mensajeListado.set('');
    try {
      const i = (identidad = await this.identificar());
      if (!i.dueno) throw new HttpErrorResponse({ status: 401 });
      const r = registro(
        await firstValueFrom(
          this.http.get<unknown>('/api/pedidos/mios', {
            params: { pagina, limite: 20 },
            context: contexto(),
            timeout: 15000,
            withCredentials: true,
          }),
        ),
      );
      if (!this.vigente(i) || secuencia !== this.secuenciaListado) return cambiado();
      if (!Array.isArray(r['pedidos']) || r['pedidos'].length > 20) throw Error('Listado inválido');
      const lista = r['pedidos'].map(adaptarPedido),
        paginacion = adaptarPaginacion(r['paginacion']);
      if (paginacion.pagina !== pagina || paginacion.limite !== 20) throw Error('Página inválida');
      lista.forEach((p) => this.guardar(p));
      this.listado.set(Object.freeze(lista));
      this.paginacion.set(paginacion);
      this.estadoListado.set('lista');
      return { correcto: true, mensaje: '' };
    } catch (error) {
      if ((identidad && !this.vigente(identidad)) || secuencia !== this.secuenciaListado)
        return cambiado();
      const resultado = this.error(error, true);
      if (secuencia === this.secuenciaListado) {
        this.estadoListado.set('error');
        this.mensajeListado.set(resultado.mensaje);
      }
      return resultado;
    }
  }
  async cargarComprobante(codigo: string): Promise<ResultadoConsulta> {
    let identidad: Identidad | undefined;
    try {
      identidad = await this.identificar();
      const i = identidad,
        p = this.obtener(codigo),
        id = p?.comprobante.id;
      if (!p || !id)
        return { correcto: false, mensaje: 'Actualiza el pedido antes de abrir su comprobante.' };
      const revision = (this.revisionesImagen.get(codigo) ?? 0) + 1;
      this.revisionesImagen.set(codigo, revision);
      const blob = await firstValueFrom(
        this.http.get(`/api/pedidos/${codigo}/comprobantes/${id}`, {
          responseType: 'blob',
          headers: this.headers(i.dueno ? undefined : this.accesos.acceso(codigo)),
          context: contexto(),
          timeout: 15000,
          withCredentials: true,
        }),
      );
      if (!this.vigente(i) || this.revisionesImagen.get(codigo) !== revision) return cambiado();
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
        !blob.size ||
        blob.size > MAXIMO_COMPROBANTE
      )
        throw Error('Archivo inválido');
      const previo = this.imagenes().get(codigo);
      if (previo) URL.revokeObjectURL(previo);
      this.imagenes.update((m) => new Map(m).set(codigo, URL.createObjectURL(blob)));
      return { correcto: true, mensaje: '' };
    } catch (error) {
      if (identidad && !this.vigente(identidad)) return cambiado();
      if (error instanceof HttpErrorResponse && error.status === 401)
        return this.error(error, true);
      return {
        correcto: false,
        mensaje: 'No pudimos abrir el comprobante. Reintenta o actualiza el pedido.',
      };
    }
  }
  liberarComprobante(codigo: string) {
    this.revisionesImagen.set(codigo, (this.revisionesImagen.get(codigo) ?? 0) + 1);
    const url = this.imagenes().get(codigo);
    if (url) URL.revokeObjectURL(url);
    this.imagenes.update((m) => {
      const siguiente = new Map(m);
      siguiente.delete(codigo);
      return siguiente;
    });
  }
  private readonly correcciones = new Set<string>();
  async corregir(
    codigo: string,
    comprobante: ComprobantePago,
    esperado: { versionPedido: number; versionPago: number; comprobanteId: string },
  ): Promise<ResultadoConsulta> {
    if (this.correcciones.has(codigo))
      return { correcto: false, mensaje: 'Espera a que termine el envío.' };
    this.correcciones.add(codigo);
    let identidad: Identidad | undefined;
    try {
      identidad = await this.identificar();
      if (!this.vigente(identidad)) return cambiado();
      if (
        !comprobante.vistaPrevia.startsWith(`data:${comprobante.tipoArchivo};base64,`) ||
        comprobante.tamanoBytes < 1 ||
        comprobante.tamanoBytes > MAXIMO_COMPROBANTE
      )
        return { correcto: false, mensaje: 'Adjunta una imagen válida de hasta 5 MB.' };
      const r = registro(
        await firstValueFrom(
          this.http.post<unknown>(
            `/api/pedidos/${codigo}/comprobantes`,
            {
              ...esperado,
              comprobante: {
                nombreArchivo: comprobante.nombreArchivo,
                tipoArchivo: comprobante.tipoArchivo,
                contenidoBase64: comprobante.vistaPrevia.split(',')[1],
                ...(comprobante.numeroOperacion
                  ? { numeroOperacion: comprobante.numeroOperacion }
                  : {}),
              },
            },
            {
              headers: this.headers(identidad.dueno ? undefined : this.accesos.acceso(codigo)),
              context: contexto(),
              timeout: 45000,
              withCredentials: true,
            },
          ),
        ),
      );
      if (!this.vigente(identidad)) return cambiado();
      const p = adaptarPedido(r['pedido']);
      this.liberarComprobante(codigo);
      this.guardar(p);
      this.listado.update((lista) => lista.map((v) => (v.codigo === codigo ? p : v)));
      return {
        correcto: true,
        mensaje: 'Comprobante corregido recibido. Está pendiente de revisión.',
      };
    } catch (error) {
      if (identidad && !this.vigente(identidad)) return cambiado();
      if (error instanceof HttpErrorResponse && error.status === 409)
        return {
          correcto: false,
          mensaje: 'El pedido cambió. Actualízalo antes de volver a enviar el comprobante.',
        };
      return this.error(error);
    } finally {
      this.correcciones.delete(codigo);
    }
  }
  private liberarImagenes() {
    for (const codigo of this.imagenes().keys()) this.liberarComprobante(codigo);
  }
  private error(
    error: unknown,
    lectura = false,
  ): { correcto: false; mensaje: string; codigo?: string } {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        this.requiereSesion.set(true);
        this.cache.set(new Map());
        this.listado.set([]);
        this.liberarImagenes();
        return {
          correcto: false,
          mensaje: 'Tu sesión no es válida. Inicia sesión nuevamente antes de continuar.',
        };
      }
      if (error.status === 403)
        return {
          correcto: false,
          mensaje:
            'Actualiza la protección de tu sesión y vuelve a intentarlo; tus datos se conservan.',
        };
      if (error.status === 404)
        return { correcto: false, mensaje: 'No encontramos el pedido o ya no tienes acceso a él.' };
      if (error.status === 400 || error.status === 413 || error.status === 415)
        return {
          correcto: false,
          mensaje: lectura
            ? 'Revisa el código o la página solicitada y vuelve a intentarlo.'
            : 'Revisa los datos y adjunta una imagen PNG, JPG o WebP válida de hasta 5 MB.',
        };
      if (error.status === 429)
        return {
          correcto: false,
          mensaje: 'Hay demasiados intentos. Espera un minuto antes de volver a intentarlo.',
        };
      const mensajes: Record<string, string> = {
        PRECIO_CAMBIADO: 'El precio cambió. Revisa el carrito antes de confirmar nuevamente.',
        STOCK_INSUFICIENTE: 'Ya no hay suficientes unidades. Revisa las cantidades del carrito.',
        ARTICULO_NO_DISPONIBLE: 'Un artículo ya no está disponible. Revisa tu carrito.',
        COTIZACION_CAMBIADA: 'La tarifa o el plazo cambió. Confirma el envío nuevamente.',
        TOTAL_CAMBIADO: 'El total cambió. Revisa el resumen y confirma nuevamente.',
        COBERTURA_DESHABILITADA: 'La entrega a ese distrito está deshabilitada. Elige otro.',
        COBERTURA_TARIFA_PENDIENTE: 'La tarifa de ese distrito está pendiente. Elige otro.',
        CLAVE_CREACION_EN_USO:
          'Hay un pedido pendiente de comprobar. Compruébalo antes de volver a enviar.',
      };
      const codigo: unknown = error.error?.codigo;
      if (typeof codigo === 'string' && Object.hasOwn(mensajes, codigo))
        return { correcto: false, mensaje: mensajes[codigo], codigo };
    }
    return {
      correcto: false,
      mensaje: lectura
        ? 'No pudimos consultar tus pedidos. Revisa tu conexión y vuelve a intentarlo.'
        : 'No pudimos confirmar el envío. Comprueba el pedido o reintenta el mismo envío; tus datos se conservan.',
    };
  }
}
