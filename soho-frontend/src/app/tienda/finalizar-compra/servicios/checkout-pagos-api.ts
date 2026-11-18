import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../cuenta/servicios/estado-autenticacion';
import { GESTIONAR_401_LOCALMENTE } from '../../cuenta/servicios/autenticacion-interceptor';
import { Carrito } from '../../carrito/servicios/carrito';
import { AccesoPedidos } from '../../pedidos/servicios/acceso-pedidos';
import { adaptarPedido, registro } from '../../pedidos/modelos/contrato-pedidos';
import { ComprobantePago, MAXIMO_COMPROBANTE } from '../../pedidos/modelos/comprobante-pago';
import {
  AccesoCompras,
  ArchivoCompra,
  IntentoCompra,
  huellaCompra,
  nuevaClaveCompra,
} from './acceso-compras';
import {
  ConsultaRecepcion,
  InstruccionCompra,
  MetodosCheckout,
  MetodoCheckout,
  PreparacionCompra,
  adaptarInstruccionCompra,
  adaptarMetodosCompra,
  adaptarOperacionCompra,
  adaptarRecepcionCompra,
  idCompra,
} from '../modelos/contrato-checkout';

type Identidad = { dueno: string | null; revision: number };
const contexto = () => new HttpContext().set(GESTIONAR_401_LOCALMENTE, true);
const BASE = '/api/pagos/recepciones';
const mismaCesta = (
  a: readonly { sku: string; cantidad: number }[],
  b: readonly { sku: string; cantidad: number }[],
) =>
  JSON.stringify(a.map((l) => [l.sku, l.cantidad]).sort()) ===
  JSON.stringify(b.map((l) => [l.sku, l.cantidad]).sort());

/** Las claves se conservan antes del IO; una respuesta histórica siempre se sigue de GET vigente. */
@Injectable({ providedIn: 'root' })
export class CheckoutPagosApi {
  private readonly injector = inject(Injector);
  private readonly cuenta = inject(Cuenta);
  private readonly sesion = inject(EstadoAutenticacion);
  private readonly carrito = inject(Carrito);
  private readonly pedidos = inject(AccesoPedidos);
  readonly accesos = inject(AccesoCompras);
  private get http() {
    return this.injector.get(HttpClient);
  }
  readonly metodos = signal<MetodosCheckout | null>(null);
  readonly ocupado = signal(false);
  readonly mensaje = signal('');
  readonly requiereSesion = signal(false);
  private readonly instruccionActual = signal<InstruccionCompra | null>(null);
  private readonly consultaActual = signal<ConsultaRecepcion | null>(null);
  private readonly cache = signal<Identidad | undefined>(undefined);
  private anterior: string | null | undefined;
  private memoriaInstruccion?: { clave: string; cuerpo: unknown };
  private memoriaImagen?: { clave: string; cuerpo: unknown };
  private tarea?: Promise<boolean>;
  private registro?: Promise<string | null>;
  readonly instruccion = computed(() => (this.vigente() ? this.instruccionActual() : null));
  readonly consulta = computed(() => (this.vigente() ? this.consultaActual() : null));
  readonly intento = computed(() => {
    const r = this.accesos.actual();
    return r && r.dueno === (this.cuenta.perfil()?.id ?? null) && !this.requiereSesion() ? r : null;
  });
  readonly historial = computed(() =>
    this.accesos
      .intentos()
      .filter((r) => r.dueno === (this.cuenta.perfil()?.id ?? null) && !!r.recepcion?.id),
  );
  constructor() {
    effect(() => {
      const estado = this.cuenta.estadoSesion(),
        dueno = this.cuenta.perfil()?.id ?? null;
      if (estado === 'inicial' || estado === 'cargando') return;
      untracked(() => {
        if (this.anterior !== dueno || !this.vigente()) {
          if (this.anterior && !dueno) this.requiereSesion.set(true);
          if (dueno) this.requiereSesion.set(false);
          this.anterior = dueno;
          this.instruccionActual.set(null);
          this.consultaActual.set(null);
          this.memoriaImagen = undefined;
          this.memoriaInstruccion = undefined;
          this.cache.set({ dueno, revision: this.sesion.revision });
          this.accesos.sincronizar(dueno);
        }
      });
    });
  }
  private vigente(i = this.cache()): boolean {
    this.cuenta.estadoSesion();
    return (
      !!i &&
      i.dueno === (this.cuenta.perfil()?.id ?? null) &&
      i.revision === this.sesion.revision &&
      !this.requiereSesion()
    );
  }
  private async identificar(): Promise<Identidad> {
    const antes = this.cuenta.perfil()?.id;
    await this.cuenta.comprobarSesion();
    if (
      this.cuenta.estadoSesion() === 'error' ||
      ['inicial', 'cargando'].includes(this.cuenta.estadoSesion())
    )
      throw Error('No pudimos comprobar la sesión. Inténtalo nuevamente.');
    if (antes && !this.cuenta.perfil()) this.requiereSesion.set(true);
    if (this.requiereSesion() && !this.cuenta.perfil())
      throw new HttpErrorResponse({ status: 401 });
    const i = { dueno: this.cuenta.perfil()?.id ?? null, revision: this.sesion.revision };
    this.accesos.sincronizar(i.dueno);
    this.cache.set(i);
    return i;
  }
  private comprobar(i: Identidad) {
    if (!this.vigente(i)) throw Error('La sesión cambió. Retoma la compra con su cuenta original.');
  }
  private opciones(r: IntentoCompra): {
    context: HttpContext;
    headers: Record<string, string>;
    timeout: number;
  } {
    return {
      context: contexto(),
      headers: r.acceso ? { 'X-Pedido-Acceso': r.acceso } : {},
      timeout: 20000,
    };
  }
  private ejecutar(accion: (i: Identidad) => Promise<void>): Promise<boolean> {
    if (this.tarea) return this.tarea;
    this.ocupado.set(true);
    this.mensaje.set('');
    const tarea = (async () => {
      let i: Identidad | undefined;
      try {
        i = await this.identificar();
        await accion(i);
        this.comprobar(i);
        return true;
      } catch (e) {
        if (i && !this.vigente(i)) return false;
        if (e instanceof HttpErrorResponse && e.status === 401) {
          this.sesion.invalidar();
          this.requiereSesion.set(true);
          this.instruccionActual.set(null);
          this.consultaActual.set(null);
          this.mensaje.set(
            'Tu sesión venció. Inicia sesión con la misma cuenta para recuperar la compra.',
          );
        } else if (e instanceof HttpErrorResponse) {
          if (e.status === 403 || e.status === 404) {
            this.instruccionActual.set(null);
            this.consultaActual.set(null);
          }
          const codigo = e.error?.codigo;
          this.mensaje.set(
            e.status === 404
              ? 'Aún no se encontró el intento con este acceso. Conserva esta pestaña y comprueba o reintenta el mismo envío.'
              : codigo === 'CHECKOUT_PAGOS_NO_HABILITADO'
                ? 'Las compras nuevas están pausadas. Puedes recuperar un comprobante ya enviado.'
                : codigo === 'CONFIGURACION_PAGOS_CAMBIADA'
                  ? 'Los métodos de pago cambiaron. Actualízalos y revisa nuevamente antes de pagar.'
                  : [400, 413, 415, 422].includes(e.status)
                    ? 'Revisa los datos y la imagen. No se pudo confirmar este envío; comprueba su estado antes de cambiarlo.'
                    : e.status === 409
                      ? 'La compra cambió o este intento necesita revisión. Consulta su estado antes de continuar.'
                      : e.status === 403
                        ? 'No pudimos autorizar la solicitud. Comprueba tu sesión y vuelve a consultar.'
                        : 'No pudimos confirmar la respuesta. Conservamos el intento: compruébalo antes de volver a enviar o pagar.',
          );
        } else
          this.mensaje.set(
            e instanceof Error
              ? e.message
              : 'No pudimos consultar la compra. Inténtalo nuevamente.',
          );
        return false;
      } finally {
        this.ocupado.set(false);
        this.tarea = undefined;
      }
    })();
    this.tarea = tarea;
    return tarea;
  }
  async cargarMetodos() {
    try {
      this.metodos.set(
        adaptarMetodosCompra(
          await firstValueFrom(this.http.get('/api/configuracion/pagos', { timeout: 15000 })),
        ),
      );
    } catch {
      this.metodos.set(null);
      this.mensaje.set('No pudimos consultar los métodos de pago. Inténtalo nuevamente.');
    }
  }
  emitir(preparacion: PreparacionCompra, metodo: MetodoCheckout): Promise<boolean> {
    return this.ejecutar(async (i) => {
      const metodos = this.metodos();
      if (!metodos?.disponible || !metodos.metodos.some((m) => m.metodo === metodo))
        throw Error('Elige un método de pago disponible.');
      let r = this.accesos.preparar(i.dueno);
      if (r.recepcion)
        throw Error(
          'Esta compra ya tiene un comprobante en curso. Retómalo antes de pagar otra vez.',
        );
      const datos = { metodo, versionConfiguracionEsperada: metodos.version, preparacion };
      const hash = await huellaCompra(JSON.stringify(datos));
      this.comprobar(i);
      if (r.instruccion.hash && r.instruccion.hash !== hash)
        throw Error(
          'Ya hay una instrucción para esta compra. Recupérala o confirma que todavía no pagaste antes de cambiar los datos.',
        );
      r = { ...r, instruccion: { ...r.instruccion, hash } };
      this.accesos.guardar(r);
      const cuerpo = {
        claveSolicitud: r.instruccion.clave,
        claveCreacionPedido: r.clave,
        ...datos,
      };
      this.memoriaInstruccion = { clave: r.instruccion.clave, cuerpo };
      const d = await firstValueFrom(
        this.http.post('/api/pagos/instrucciones', cuerpo, this.opciones(r)),
      );
      this.comprobar(i);
      this.aceptarInstruccion(d, r, metodo);
    });
  }
  private aceptarInstruccion(d: unknown, r: IntentoCompra, metodo?: MetodoCheckout) {
    const instruccion = adaptarInstruccionCompra(d);
    if (
      instruccion.claveCreacionPedido !== r.clave ||
      (r.instruccion.id && r.instruccion.id !== instruccion.instruccionId) ||
      (metodo && instruccion.metodo !== metodo)
    )
      throw Error('La respuesta no corresponde a esta compra.');
    this.accesos.guardar({
      ...r,
      instruccion: { ...r.instruccion, id: instruccion.instruccionId },
    });
    this.instruccionActual.set(instruccion);
  }
  recuperar(): Promise<boolean> {
    return this.ejecutar(async (i) => {
      const r = this.accesos.actual();
      if (!r) return;
      // Preparar una clave sin huella ni UUID todavía no envía una instrucción.
      if (!r.recepcion && !r.instruccion.hash && !r.instruccion.id) return;
      if (r.recepcion?.rechazada || r.operacion?.rechazada) {
        await this.revisarRechazo(r, i);
        return;
      }
      if (r.recepcion) {
        if (r.operacion && r.recepcion.id) await this.consultarOperacion(r, i);
        await this.leerRecepcion(this.accesos.actual() ?? r, i);
      } else {
        const d = await firstValueFrom(
          this.http.get(
            `/api/pagos/instrucciones/operaciones/${r.instruccion.clave}`,
            this.opciones(r),
          ),
        );
        this.comprobar(i);
        this.aceptarInstruccion(d, r);
      }
    });
  }
  async recuperarCheckout(): Promise<boolean> {
    while (this.tarea) await this.tarea;
    const preparado = await this.ejecutar(async () => {
      this.accesos.retomar();
      this.limpiarCompra();
    });
    if (!preparado || !(await this.recuperar())) return false;
    // Tras vincular su acceso, el pedido tiene seguimiento propio y permite otra compra.
    if (
      this.consulta()?.recepcion.estado === 'PEDIDO_CREADO' &&
      this.intento()?.carritoAtendido &&
      !this.intento()?.operacion
    )
      return this.nuevaCompra();
    return true;
  }
  async abrir(id: string): Promise<boolean> {
    while (this.tarea) await this.tarea;
    return this.ejecutar(async (i) => {
      idCompra(id);
      let r = this.accesos.intentos().find((v) => v.recepcion?.id === id);
      if (r) this.accesos.seleccionar(r.clave);
      else if (!i.dueno)
        throw Error(
          'El acceso privado de invitado está en la pestaña donde compraste. Abre allí esta recepción.',
        );
      const d = await firstValueFrom(
        this.http.get(
          `${BASE}/${id}`,
          r ? this.opciones(r) : { context: contexto(), timeout: 15000 },
        ),
      );
      this.comprobar(i);
      const consulta = adaptarRecepcionCompra(d);
      if (consulta.recepcion.id !== id) throw Error('Recepción incorrecta.');
      r ??= {
        clave: consulta.recepcion.claveCreacionPedido,
        dueno: i.dueno,
        creadoEn: Date.parse(consulta.recepcion.creadoEn),
        instruccion: {
          clave: consulta.recepcion.instruccion.instruccionId,
          id: consulta.recepcion.instruccion.instruccionId,
        },
        recepcion: { clave: consulta.recepcion.claveSolicitud, id },
      };
      this.aceptarRecepcion(consulta, r);
      if (r.operacion?.rechazada) await this.revisarRechazo(r, i);
      else if (r.operacion) {
        await this.consultarOperacion(r, i);
        await this.leerRecepcion(this.accesos.actual() ?? r, i);
      }
    });
  }
  private async leerRecepcion(r: IntentoCompra, i: Identidad) {
    if (!r.recepcion) throw Error('No hay comprobante en curso.');
    const ruta = r.recepcion.id
      ? `${BASE}/${r.recepcion.id}`
      : `${BASE}/creacion/${r.recepcion.clave}`;
    const d = await firstValueFrom(this.http.get(ruta, this.opciones(r)));
    this.comprobar(i);
    this.aceptarRecepcion(adaptarRecepcionCompra(d), r);
  }
  private aceptarRecepcion(c: ConsultaRecepcion, r: IntentoCompra) {
    const d = c.recepcion;
    if (
      d.claveCreacionPedido !== r.clave ||
      (r.instruccion.id && r.instruccion.id !== d.instruccion.instruccionId) ||
      (r.recepcion?.id && r.recepcion.id !== d.id)
    )
      throw Error('La recepción no corresponde a esta compra.');
    this.accesos.guardar({
      ...r,
      instruccion: { ...r.instruccion, id: d.instruccion.instruccionId },
      recepcion: { ...r.recepcion, clave: d.claveSolicitud, id: d.id, rechazada: undefined },
      ...(d.pedido ? { codigo: d.pedido.codigo } : {}),
    });
    this.instruccionActual.set(d.instruccion);
    this.consultaActual.set(c);
  }
  private async imagen(c: ComprobantePago, numero = c.numeroOperacion ?? null) {
    const prefijo = `data:${c.tipoArchivo};base64,`;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(c.tipoArchivo) ||
      !c.vistaPrevia.startsWith(prefijo) ||
      c.tamanoBytes < 1 ||
      c.tamanoBytes > MAXIMO_COMPROBANTE ||
      (numero !== null && !/^\d{1,12}$/.test(numero))
    )
      throw Error('Elige un comprobante válido de hasta 5 MB.');
    const contenidoBase64 = c.vistaPrevia.slice(prefijo.length),
      bytes = Uint8Array.from(atob(contenidoBase64), (v) => v.charCodeAt(0));
    if (bytes.length !== c.tamanoBytes) throw Error('La imagen no se leyó completamente.');
    const archivo: ArchivoCompra = {
      hash: await huellaCompra(bytes),
      nombre: c.nombreArchivo.normalize('NFC'),
      tipo: c.tipoArchivo,
      numero,
    };
    return {
      archivo,
      comprobante: {
        nombreArchivo: archivo.nombre,
        tipoArchivo: archivo.tipo,
        contenidoBase64,
        ...(numero === null ? {} : { numeroOperacion: numero }),
      },
    };
  }
  recibir(c: ComprobantePago): Promise<boolean> {
    return this.ejecutar(async (i) => {
      let r = this.accesos.actual();
      if (!r?.instruccion.id) throw Error('Recupera primero las instrucciones verificadas.');
      if (r.recepcion?.id && this.consulta()?.recepcion.estado !== 'RECIBIENDO')
        throw Error('Tu comprobante ya fue recibido. Consulta la recepción.');
      const imagen = await this.imagen(c);
      this.comprobar(i);
      if (
        r.recepcion?.archivo &&
        JSON.stringify(r.recepcion.archivo) !== JSON.stringify(imagen.archivo)
      )
        throw Error(
          'Para recuperar este envío, selecciona la misma imagen original y el mismo número de operación.',
        );
      r = {
        ...r,
        recepcion: {
          ...r.recepcion,
          clave: r.recepcion?.clave ?? nuevaClaveCompra(),
          archivo: imagen.archivo,
        },
      };
      this.accesos.guardar(r);
      const cuerpo = {
        claveSolicitud: r.recepcion!.clave,
        instruccionPagoId: r.instruccion.id,
        comprobante: imagen.comprobante,
      };
      this.memoriaImagen = { clave: r.recepcion!.clave, cuerpo };
      const d = await this.enviarImagen(r, cuerpo, i, false);
      this.comprobar(i);
      this.aceptarRecepcion(adaptarRecepcionCompra(d), r);
      await this.leerRecepcion(this.accesos.actual()!, i);
    });
  }
  procesar(): Promise<boolean> {
    return this.ejecutar(async (i) => {
      let r = this.accesos.actual();
      const c = this.consulta();
      if (!r?.recepcion?.id || !c) throw Error('Consulta primero la recepción.');
      if (!r.operacion && (c.recepcion.estado !== 'RECIBIDA' || c.correccion?.pendiente))
        throw Error('Esta compra requiere atención antes de registrar el pedido.');
      if (r.operacion && r.operacion.tipo !== 'PROCESAR')
        throw Error('Recupera primero la corrección pendiente.');
      r = {
        ...r,
        operacion: r.operacion ?? {
          clave: nuevaClaveCompra(),
          tipo: 'PROCESAR',
          version: c.recepcion.version,
        },
      };
      this.accesos.guardar(r);
      const d = await firstValueFrom(
        this.http.post(
          `${BASE}/${r.recepcion!.id}/procesamiento`,
          { claveSolicitud: r.operacion!.clave, versionEsperada: r.operacion!.version },
          this.opciones(r),
        ),
      );
      this.comprobar(i);
      this.aceptarOperacion(d, r);
      await this.leerRecepcion(this.accesos.actual()!, i);
    });
  }
  /** Continúa una recepción confirmada; las operaciones inciertas se recuperan con su misma clave. */
  completarRegistro(): Promise<string | null> {
    if (this.registro) return this.registro;
    const identidad = this.cache(),
      clave = this.intento()?.clave,
      id = this.consulta()?.recepcion.id;
    if (!identidad || !clave || !id) return Promise.resolve(null);
    const vigente = () =>
      this.vigente(identidad) &&
      this.intento()?.clave === clave &&
      this.consulta()?.recepcion.id === id;
    const tarea = (async () => {
      // No confundir el resultado de otra operación concurrente con un registro completado.
      while (this.tarea) await this.tarea;
      if (!vigente() || this.intento()?.operacion) return null;
      if (this.consulta()?.recepcion.estado === 'RECIBIDA') {
        if (this.consulta()?.correccion?.pendiente) return null;
        if (!(await this.procesar()) || !vigente()) return null;
      }
      if (
        !vigente() ||
        this.intento()?.operacion ||
        this.consulta()?.recepcion.estado !== 'PEDIDO_CREADO'
      )
        return null;
      const codigo = await this.vincularPedido();
      return vigente() ? codigo : null;
    })();
    this.registro = tarea;
    void tarea.finally(() => {
      if (this.registro === tarea) this.registro = undefined;
    });
    return tarea;
  }
  corregir(c: ComprobantePago): Promise<boolean> {
    return this.ejecutar(async (i) => {
      let r = this.accesos.actual();
      const consulta = this.consulta();
      if (!r?.recepcion?.id || !consulta || (!r.operacion && !consulta.correccion?.pendiente))
        throw Error('No hay una solicitud de corrección vigente.');
      if (r.operacion && r.operacion.tipo !== 'CORREGIR')
        throw Error('Recupera primero el procesamiento pendiente.');
      const imagen = await this.imagen(c, consulta.recepcion.comprobante.numeroOperacion);
      this.comprobar(i);
      if (
        r.operacion?.archivo &&
        JSON.stringify(r.operacion.archivo) !== JSON.stringify(imagen.archivo)
      )
        throw Error('Selecciona la misma imagen original de la corrección pendiente.');
      r = {
        ...r,
        operacion: r.operacion ?? {
          clave: nuevaClaveCompra(),
          tipo: 'CORREGIR',
          version: consulta.correccion!.versionEsperada,
          archivo: imagen.archivo,
        },
      };
      this.accesos.guardar(r);
      const cuerpo = {
        claveSolicitud: r.operacion!.clave,
        versionEsperada: r.operacion!.version,
        comprobante: imagen.comprobante,
      };
      this.memoriaImagen = { clave: r.operacion!.clave, cuerpo };
      const d = await this.enviarImagen(r, cuerpo, i, true);
      this.comprobar(i);
      this.aceptarOperacion(d, r);
      await this.leerRecepcion(this.accesos.actual()!, i);
    });
  }
  private async consultarOperacion(r: IntentoCompra, i: Identidad) {
    try {
      const d = await firstValueFrom(
        this.http.get(
          `${BASE}/${r.recepcion!.id}/operaciones/${r.operacion!.clave}`,
          this.opciones(r),
        ),
      );
      this.comprobar(i);
      this.aceptarOperacion(d, r);
    } catch (e) {
      this.comprobar(i);
      if (!(e instanceof HttpErrorResponse) || e.status !== 404) throw e;
      this.mensaje.set(
        'La operación todavía no se encontró. Consulta la recepción y reintenta la misma operación o imagen original.',
      );
    }
  }
  private async enviarImagen(
    r: IntentoCompra,
    cuerpo: unknown,
    i: Identidad,
    correccion: boolean,
  ): Promise<unknown> {
    try {
      return await firstValueFrom(
        this.http.post(
          correccion ? `${BASE}/${r.recepcion!.id}/comprobantes` : BASE,
          cuerpo,
          this.opciones(r),
        ),
      );
    } catch (e) {
      this.comprobar(i);
      if (e instanceof HttpErrorResponse && [400, 413, 415, 422].includes(e.status)) {
        const marcado = correccion
          ? { ...r, operacion: { ...r.operacion!, rechazada: true } }
          : { ...r, recepcion: { ...r.recepcion!, rechazada: true } };
        this.accesos.guardar(marcado);
        try {
          await this.revisarRechazo(marcado, i);
        } catch {
          /* Conservar el rechazo y comprobarlo al recuperar. */
        }
      }
      throw e;
    }
  }
  /** Solo un rechazo de validación más GET 404 autoriza sustituir la imagen. Un 5xx nunca lo hace. */
  private async revisarRechazo(r: IntentoCompra, i: Identidad) {
    const correccion = !!r.operacion?.rechazada;
    const ruta = correccion
      ? `${BASE}/${r.recepcion!.id}/operaciones/${r.operacion!.clave}`
      : `${BASE}/creacion/${r.recepcion!.clave}`;
    let d: unknown;
    try {
      d = await firstValueFrom(this.http.get(ruta, this.opciones(r)));
    } catch (e) {
      this.comprobar(i);
      if (!(e instanceof HttpErrorResponse) || e.status !== 404) throw e;
      const limpio = correccion ? { ...r, operacion: undefined } : { ...r, recepcion: undefined };
      this.accesos.guardar(limpio);
      this.memoriaImagen = undefined;
      if (correccion) await this.leerRecepcion(limpio, i);
      else {
        const instruccion = await firstValueFrom(
          this.http.get(`/api/pagos/instrucciones/${r.instruccion.id}`, this.opciones(r)),
        );
        this.comprobar(i);
        this.aceptarInstruccion(instruccion, limpio);
      }
      return;
    }
    this.comprobar(i);
    if (correccion) {
      this.aceptarOperacion(d, r);
      await this.leerRecepcion(this.accesos.actual()!, i);
    } else this.aceptarRecepcion(adaptarRecepcionCompra(d), r);
  }
  private aceptarOperacion(d: unknown, r: IntentoCompra) {
    const op = adaptarOperacionCompra(d);
    if (
      op.recepcion.id !== r.recepcion?.id ||
      op.recepcion.claveCreacionPedido !== r.clave ||
      (op.operacion.claveSolicitud !== r.operacion?.clave && op.resultado !== 'PEDIDO_CREADO')
    )
      throw Error('Operación de otra compra.');
    // No usar su proyección histórica como estado actual de la recepción.
    if (op.operacion.estado === 'CONFIRMADA') {
      this.accesos.guardar({ ...r, operacion: undefined });
      this.memoriaImagen = undefined;
    }
  }
  reintentar(): Promise<boolean> {
    const r = this.intento();
    if (r?.operacion?.tipo === 'PROCESAR') return this.procesar();
    return this.ejecutar(async (i) => {
      const r = this.accesos.actual();
      if (!r) throw Error('No hay intento pendiente.');
      const m =
        r.operacion?.tipo === 'CORREGIR' || r.recepcion
          ? this.memoriaImagen
          : this.memoriaInstruccion;
      const clave = r.operacion?.clave ?? r.recepcion?.clave ?? r.instruccion.clave;
      if (!m || m.clave !== clave)
        throw Error(
          r.recepcion
            ? 'Vuelve a seleccionar la misma imagen original para reintentar este envío.'
            : 'Vuelve a completar los mismos datos y método para recuperar el intento.',
        );
      const ruta = r.operacion
        ? `${BASE}/${r.recepcion!.id}/comprobantes`
        : r.recepcion
          ? BASE
          : '/api/pagos/instrucciones';
      const d = r.recepcion
        ? await this.enviarImagen(r, m.cuerpo, i, !!r.operacion)
        : await firstValueFrom(this.http.post(ruta, m.cuerpo, this.opciones(r)));
      this.comprobar(i);
      if (r.operacion) this.aceptarOperacion(d, r);
      else if (r.recepcion) this.aceptarRecepcion(adaptarRecepcionCompra(d), r);
      else this.aceptarInstruccion(d, r);
      if (this.accesos.actual()?.recepcion) await this.leerRecepcion(this.accesos.actual()!, i);
    });
  }
  cambiarAntesDePagar(): Promise<boolean> {
    return this.ejecutar(async (i) => {
      const r = this.accesos.actual();
      if (!r || r.recepcion) throw Error('Retoma el comprobante de esta compra.');
      // La acción de interfaz declara expresamente que aún no se hizo la transferencia.
      this.comprobar(i);
      this.accesos.guardar({ ...r, instruccion: { clave: nuevaClaveCompra() } });
      this.instruccionActual.set(null);
      this.memoriaInstruccion = undefined;
    });
  }
  nuevaCompra(): Promise<boolean> {
    return this.ejecutar(async () => {
      const c = this.consulta();
      if (
        !c ||
        !['PEDIDO_CREADO', 'REQUIERE_ATENCION'].includes(c.recepcion.estado) ||
        this.intento()?.operacion
      )
        throw Error('Recupera primero el envío de esta compra.');
      const r = this.intento();
      if (r && c.recepcion.estado === 'PEDIDO_CREADO')
        this.accesos.guardar({ ...r, carritoAtendido: true });
      this.accesos.nueva();
      this.limpiarCompra();
    });
  }
  private limpiarCompra() {
    this.instruccionActual.set(null);
    this.consultaActual.set(null);
    this.memoriaImagen = undefined;
    this.memoriaInstruccion = undefined;
  }
  async comprobante(): Promise<string | null> {
    let url: string | null = null;
    await this.ejecutar(async (i) => {
      const r = this.accesos.actual(),
        c = this.consulta();
      if (!r?.recepcion?.id || !c || c.recepcion.comprobante.estadoArchivo !== 'DISPONIBLE')
        throw Error('El comprobante todavía no está disponible.');
      const blob = await firstValueFrom(
        this.http.get(`${BASE}/${r.recepcion.id}/comprobantes/${c.recepcion.comprobante.id}`, {
          ...this.opciones(r),
          responseType: 'blob',
        }),
      );
      this.comprobar(i);
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
        blob.size < 1 ||
        blob.size > MAXIMO_COMPROBANTE
      )
        throw Error('No pudimos validar la imagen privada.');
      url = URL.createObjectURL(blob);
    });
    return url;
  }
  async vincularPedido(): Promise<string | null> {
    let codigo: string | null = null;
    await this.ejecutar(async (i) => {
      const r = this.accesos.actual(),
        c = this.consulta()?.recepcion;
      if (!r || !c?.pedido) throw Error('Esta recepción aún no tiene pedido.');
      const d = await firstValueFrom(
        this.http.get(`/api/pedidos/${c.pedido.codigo}`, this.opciones(r)),
      );
      this.comprobar(i);
      const pedido = adaptarPedido(registro(d)['pedido']);
      if (pedido.codigo !== c.pedido.codigo) throw Error('El pedido no corresponde a esta compra.');
      if (r.acceso) {
        this.pedidos.sincronizar(null);
        this.pedidos.registrarInvitado(pedido.codigo, r.acceso, pedido.fecha);
      }
      const limpiar =
        this.accesos.enCurso()?.clave === r.clave &&
        !r.carritoAtendido &&
        mismaCesta(this.carrito.lineas(), pedido.articulos);
      // Persistir antes de limpiar: volver al historial nunca consume otra cesta igual.
      this.accesos.guardar({ ...r, carritoAtendido: true });
      if (limpiar) this.carrito.vaciar();
      if (!r.operacion) this.accesos.finalizar(r.clave);
      codigo = pedido.codigo;
    });
    return codigo;
  }
}
