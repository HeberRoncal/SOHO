import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import {
  AccionRecepcion,
  DecisionRecepcion,
  DetalleRecepcion,
  FilaRecepcion,
  PAGINA_RECEPCIONES,
  ResultadoRecepcion,
  decisionRecepcionGuardada,
  objetoRecepcion,
  detalleRecepcion,
  listadoRecepciones,
  resultadoRecepcion,
  uuidRecepcion,
} from '../modelos/recepcion-admin';

export interface IntentoRecepcion {
  readonly id: string;
  readonly accion: AccionRecepcion;
  readonly cuerpo: Readonly<DecisionRecepcion>;
  readonly estado: 'enviando' | 'incierta' | 'pendiente' | 'confirmada' | 'rechazada';
  readonly mensaje: string;
  readonly resultado: ResultadoRecepcion | null;
  readonly reintentarDesde: number;
}
type EstadoConsulta = 'inicial' | 'cargando' | 'lista' | 'error' | 'ausente' | 'sin-permiso';
const base = '/api/admin/recepciones';
@Injectable({ providedIn: 'root' })
export class RecepcionesAdministracionApi {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  private propietario = '';
  private readonly bloqueado = signal(false);
  private readonly filas = signal<FilaRecepcion[]>([]);
  private readonly ficha = signal<DetalleRecepcion | null>(null);
  private readonly conteos = signal<ReturnType<typeof listadoRecepciones>['resumen'] | null>(null);
  private readonly pagina = signal({ ...PAGINA_RECEPCIONES });
  private readonly intentos = signal<ReadonlyMap<string, IntentoRecepcion>>(new Map());
  private readonly ocupadas = new Set<string>();
  private readonly cancelacion = {
    listado: new Subject<void>(),
    detalle: new Subject<void>(),
    imagen: new Subject<void>(),
  };
  private readonly turnos = { listado: 0, detalle: 0, imagen: 0 };
  readonly estadoListado = signal<EstadoConsulta>('inicial');
  readonly estadoDetalle = signal<EstadoConsulta>('inicial');
  readonly mensajeListado = signal('');
  readonly mensajeDetalle = signal('');
  private readonly errorGuardado = signal('');
  readonly errorRecuperacion = computed(() => (this.autorizado() ? this.errorGuardado() : ''));
  readonly recepciones = computed(() => (this.autorizado() ? this.filas() : []));
  readonly detalle = computed(() => (this.autorizado() ? this.ficha() : null));
  readonly resumen = computed(() => (this.autorizado() ? this.conteos() : null));
  readonly paginacion = computed(() => (this.autorizado() ? this.pagina() : PAGINA_RECEPCIONES));
  readonly pendientes = computed(() =>
    this.autorizado()
      ? [...this.intentos().values()].filter((i) => !['confirmada', 'rechazada'].includes(i.estado))
      : [],
  );
  constructor() {
    effect(() => {
      this.cuenta.perfil();
      this.cuenta.estadoSesion();
      untracked(() => this.sincronizar());
    });
    inject(DestroyRef).onDestroy(() => this.limpiar());
  }
  private identidad() {
    return `${this.cuenta.perfil()?.id ?? ''}:${this.cuenta.perfil()?.rol ?? ''}:${this.cuenta.estadoSesion()}:${this.auth.revision}`;
  }
  private autorizado() {
    return (
      !this.bloqueado() &&
      this.cuenta.perfil()?.rol === 'ADMIN' &&
      this.cuenta.estadoSesion() === 'autenticado' &&
      this.propietario === this.identidad()
    );
  }
  private vigente(id: string) {
    return id === this.identidad() && this.autorizado();
  }
  private sincronizar() {
    const id = this.identidad();
    if (id !== this.propietario) {
      this.limpiar();
      this.propietario = id;
      this.bloqueado.set(false);
      if (this.autorizado()) this.restaurar();
    }
  }
  private almacenamiento() {
    return 'soho:recepciones:decisiones:' + this.cuenta.perfil()!.id;
  }
  private restaurar() {
    try {
      const texto = sessionStorage.getItem(this.almacenamiento());
      if (texto === null) return;
      const d = objetoRecepcion(JSON.parse(texto));
      if (
        d['version'] !== 1 ||
        d['responsable'] !== this.cuenta.perfil()!.id ||
        !Array.isArray(d['intentos']) ||
        d['intentos'].length > 100
      )
        throw Error();
      const guardados = new Map<string, IntentoRecepcion>();
      for (const valor of d['intentos']) {
        const g = objetoRecepcion(valor),
          id = uuidRecepcion(g['id']);
        if (
          !['REGISTRAR_PEDIDO', 'SOLICITAR_CORRECCION'].includes(g['accion'] as string) ||
          guardados.has(id)
        )
          throw Error();
        const accion = g['accion'] as AccionRecepcion;
        guardados.set(
          id,
          Object.freeze({
            id,
            accion,
            cuerpo: decisionRecepcionGuardada(g['cuerpo'], accion),
            estado: 'incierta',
            resultado: null,
            reintentarDesde: 0,
            mensaje:
              'Se recuperó el intento de esta pestaña. Consulta su resultado antes de tomar otra decisión.',
          }),
        );
      }
      this.intentos.set(guardados);
    } catch {
      this.errorGuardado.set(
        'No pudimos leer las decisiones guardadas de esta pestaña. Conservamos sus datos y bloqueamos nuevas decisiones para evitar duplicados.',
      );
    }
  }
  private conservar(m: ReadonlyMap<string, IntentoRecepcion>) {
    try {
      sessionStorage.setItem(
        this.almacenamiento(),
        JSON.stringify({
          version: 1,
          responsable: this.cuenta.perfil()!.id,
          intentos: [...m.values()].map((i) => ({ id: i.id, accion: i.accion, cuerpo: i.cuerpo })),
        }),
      );
    } catch {
      throw Error(
        'Habilita el almacenamiento de esta pestaña para guardar la decisión con recuperación. No se envió un intento nuevo.',
      );
    }
  }
  private detener(canal: keyof typeof this.turnos) {
    this.turnos[canal]++;
    this.cancelacion[canal].next();
  }
  private limpiar() {
    for (const c of ['listado', 'detalle', 'imagen'] as const) this.detener(c);
    this.filas.set([]);
    this.ficha.set(null);
    this.conteos.set(null);
    this.pagina.set({ ...PAGINA_RECEPCIONES });
    this.intentos.set(new Map());
    this.ocupadas.clear();
    this.estadoListado.set('inicial');
    this.estadoDetalle.set('inicial');
    this.mensajeListado.set('');
    this.mensajeDetalle.set('');
    this.errorGuardado.set('');
  }
  private error(e: unknown) {
    if (e instanceof HttpErrorResponse) {
      if ([401, 403].includes(e.status)) {
        this.limpiar();
        this.bloqueado.set(true);
        this.estadoListado.set('sin-permiso');
        this.estadoDetalle.set('sin-permiso');
        this.mensajeListado.set('Vuelve a iniciar sesión como administrador.');
        this.mensajeDetalle.set('Vuelve a iniciar sesión como administrador.');
        return 'Tu sesión ya no permite acceder a Recepciones. Inicia sesión nuevamente.';
      }
      if (e.status === 404)
        return 'No encontramos la recepción o la operación. Conserva su referencia y su clave.';
      if (e.status === 409)
        return 'La recepción cambió. Actualiza sus datos y revisa el comprobante vigente antes de tomar otra decisión.';
      if (e.status === 429)
        return 'Hay demasiadas solicitudes. Espera un momento antes de reintentar.';
      if (e.status === 400) return 'Revisa el motivo, el mensaje y las confirmaciones.';
    }
    return 'No pudimos completar la consulta. Inténtalo nuevamente.';
  }
  salirListado() {
    this.detener('listado');
    this.filas.set([]);
    this.conteos.set(null);
  }
  salirDetalle() {
    this.detener('detalle');
    this.detener('imagen');
    this.ficha.set(null);
    this.estadoDetalle.set('inicial');
  }
  private async consulta(
    canal: 'listado' | 'detalle',
    ruta: string,
    params: Record<string, string>,
    recibir: (v: unknown) => void,
  ) {
    this.sincronizar();
    this.detener(canal);
    const turno = this.turnos[canal],
      dueno = this.propietario;
    const estado = canal === 'listado' ? this.estadoListado : this.estadoDetalle,
      mensaje = canal === 'listado' ? this.mensajeListado : this.mensajeDetalle;
    if (!this.autorizado()) {
      estado.set('sin-permiso');
      mensaje.set('Inicia sesión como administrador.');
      return;
    }
    estado.set('cargando');
    mensaje.set('');
    try {
      const r = await firstValueFrom(
        this.http
          .get<unknown>(ruta, {
            params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
          })
          .pipe(timeout(15000), takeUntil(this.cancelacion[canal])),
      );
      if (!this.vigente(dueno) || turno !== this.turnos[canal]) return;
      recibir(r);
      estado.set('lista');
    } catch (e) {
      if (!this.vigente(dueno) || turno !== this.turnos[canal]) return;
      const m = this.error(e);
      mensaje.set(m);
      if (!this.autorizado()) return;
      estado.set(e instanceof HttpErrorResponse && e.status === 404 ? 'ausente' : 'error');
    }
  }
  cargarListado(filtros: Record<string, string> = {}) {
    this.filas.set([]);
    this.conteos.set(null);
    return this.consulta('listado', base, filtros, (v) => {
      const r = listadoRecepciones(v);
      this.filas.set(r.filas);
      this.conteos.set(r.resumen);
      this.pagina.set(r.paginacion);
    });
  }
  cargarDetalle(id: string) {
    this.ficha.set(null);
    try {
      id = uuidRecepcion(id);
    } catch {
      this.salirDetalle();
      this.estadoDetalle.set('ausente');
      this.mensajeDetalle.set('La referencia no es válida.');
      return Promise.resolve();
    }
    return this.consulta('detalle', `${base}/${id}`, {}, (v) => {
      const d = detalleRecepcion(v);
      if (d.recepcion.id !== id) throw Error();
      this.ficha.set(d);
    });
  }
  intento(id: string) {
    return this.autorizado() ? this.intentos().get(id) : undefined;
  }
  private guardar(i: IntentoRecepcion) {
    this.intentos.update((m) => new Map(m).set(i.id, Object.freeze(i)));
  }
  async decidir(
    id: string,
    accion: AccionRecepcion,
    motivo: string,
    mensaje: string,
    confirmado: boolean,
    aceptarOriginales: boolean,
  ) {
    this.sincronizar();
    if (!this.autorizado() || this.intento(id)) return;
    if (this.errorGuardado()) throw Error(this.errorGuardado());
    const d = this.detalle();
    const limpiar = (v: string, max: number) => {
      const t = v.normalize('NFC').trim();
      if ([...t].length < 3 || [...t].length > max || /[\p{Cc}\p{Cf}]/u.test(t))
        throw Error('Completa el texto sin saltos de línea, con la longitud indicada.');
      return t;
    };
    if (
      !d ||
      d.recepcion.id !== id ||
      this.estadoDetalle() !== 'lista' ||
      !confirmado ||
      d.recepcion.comprobante.estadoArchivo !== 'DISPONIBLE' ||
      !(accion === 'REGISTRAR_PEDIDO'
        ? d.capacidades.registrarPedido && aceptarOriginales
        : d.capacidades.solicitarCorreccion)
    )
      throw Error('Actualiza la recepción y completa las confirmaciones.');
    const cuerpo: DecisionRecepcion = Object.freeze({
      claveSolicitud: crypto.randomUUID(),
      versionEsperada: d.recepcion.version,
      comprobanteActualId: d.recepcion.comprobante.id,
      motivo: limpiar(motivo, 300),
      confirmado: true,
      ...(accion === 'REGISTRAR_PEDIDO'
        ? { aceptarCondicionesOriginales: true as const }
        : { mensaje: limpiar(mensaje, 500) }),
    });
    const intento: IntentoRecepcion = {
      id,
      accion,
      cuerpo,
      estado: 'incierta',
      mensaje: '',
      resultado: null,
      reintentarDesde: 0,
    };
    if (this.intentos().size >= 100)
      throw Error('Resuelve las decisiones guardadas antes de iniciar otra.');
    this.conservar(new Map(this.intentos()).set(id, intento));
    this.guardar(intento);
    await this.ejecutar(intento, false);
  }
  recuperar(id: string) {
    const i = this.intento(id);
    return i ? this.ejecutar(i, true) : Promise.resolve();
  }
  reenviar(id: string) {
    const i = this.intento(id);
    return i ? this.ejecutar(i, false) : Promise.resolve();
  }
  private async ejecutar(i: IntentoRecepcion, consulta: boolean) {
    this.sincronizar();
    const dueno = this.propietario,
      llave = dueno + ':' + i.id;
    if (
      !this.autorizado() ||
      this.intento(i.id) !== i ||
      this.ocupadas.has(llave) ||
      ['confirmada', 'rechazada'].includes(i.estado) ||
      Date.now() < i.reintentarDesde
    )
      return;
    this.ocupadas.add(llave);
    this.guardar({ ...i, estado: 'enviando', mensaje: '' });
    try {
      const r: HttpResponse<unknown> = await firstValueFrom(
        (consulta
          ? this.http.get<unknown>(`${base}/${i.id}/operaciones/${i.cuerpo.claveSolicitud}`, {
              observe: 'response',
            })
          : this.http.post<unknown>(
              `${base}/${i.id}/${i.accion === 'REGISTRAR_PEDIDO' ? 'registro-pedido' : 'solicitud-correccion'}`,
              i.cuerpo,
              { observe: 'response' },
            )
        ).pipe(timeout(30000)),
      );
      if (!this.vigente(dueno)) return;
      if (![200, 202].includes(r.status)) throw Error('Código inesperado.');
      const resultado = resultadoRecepcion(
        r.body,
        i.id,
        i.cuerpo.claveSolicitud,
        i.accion,
        r.status === 202,
      );
      if (!resultado.pendiente && resultado.recepcion.version <= i.cuerpo.versionEsperada)
        throw Error('Versión de resultado inválida.');
      const espera = Number(r.headers.get('Retry-After'));
      this.guardar({
        ...i,
        estado: resultado.pendiente ? 'pendiente' : 'confirmada',
        resultado,
        reintentarDesde: resultado.pendiente
          ? Date.now() + (Number.isFinite(espera) && espera >= 1 ? Math.min(espera, 300) : 5) * 1000
          : 0,
        mensaje: resultado.pendiente
          ? 'La operación sigue pendiente. Espera unos segundos y consulta su resultado.'
          : resultado.resultado === 'PEDIDO_CREADO'
            ? 'Pedido registrado. El pago sigue pendiente de revisión.'
            : resultado.resultado === 'SOLICITAR_CORRECCION'
              ? 'Solicitud guardada. El comprador podrá adjuntar otra imagen de la misma transferencia.'
              : 'El registro requiere atención. No se creó un pedido ni se reservaron unidades.',
      });
      // La respuesta recuperada es histórica. La pantalla vigente se obtiene con una lectura nueva.
      if (!resultado.pendiente && this.ficha()?.recepcion.id === i.id)
        await this.cargarDetalle(i.id);
    } catch (e) {
      if (!this.vigente(dueno)) return;
      const mensaje = this.error(e);
      if (!this.vigente(dueno)) return;
      const rechazada =
        !consulta && e instanceof HttpErrorResponse && [400, 404, 409, 413, 422].includes(e.status);
      const espera =
        e instanceof HttpErrorResponse && e.status === 429
          ? Math.max(5, Math.min(300, Number(e.headers.get('Retry-After')) || 5)) * 1000
          : 0;
      this.guardar({
        ...i,
        estado: rechazada ? 'rechazada' : 'incierta',
        reintentarDesde: Date.now() + espera,
        mensaje: rechazada
          ? mensaje
          : 'No se confirmó el resultado. Conservamos este intento. Consulta su estado o reenvía el mismo contenido con la misma clave.',
        resultado: null,
      });
      if (rechazada && this.ficha()?.recepcion.id === i.id) await this.cargarDetalle(i.id);
    } finally {
      this.ocupadas.delete(llave);
    }
  }
  cerrarIntento(id: string) {
    const i = this.intento(id),
      d = this.detalle();
    if (
      !i ||
      !['confirmada', 'rechazada'].includes(i.estado) ||
      !d ||
      d.recepcion.id !== id ||
      this.estadoDetalle() !== 'lista' ||
      (i.resultado && d.recepcion.version < i.resultado.recepcion.version)
    )
      return;
    const n = new Map(this.intentos());
    n.delete(id);
    try {
      this.conservar(n);
      this.intentos.set(n);
    } catch {
      this.errorGuardado.set(
        'No pudimos actualizar la recuperación de esta pestaña. Conserva la clave y habilita el almacenamiento.',
      );
    }
  }
  async comprobante(id: string, comprobanteId: string) {
    this.sincronizar();
    this.detener('imagen');
    const dueno = this.propietario,
      turno = this.turnos.imagen;
    if (!this.autorizado()) throw Error('Sin autorización.');
    try {
      const b = await firstValueFrom(
        this.http
          .get(`${base}/${uuidRecepcion(id)}/comprobantes/${uuidRecepcion(comprobanteId)}`, {
            responseType: 'blob',
          })
          .pipe(timeout(15000), takeUntil(this.cancelacion.imagen)),
      );
      if (
        !this.vigente(dueno) ||
        turno !== this.turnos.imagen ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(b.type) ||
        b.size < 1 ||
        b.size > 5 * 1024 * 1024
      )
        throw Error('Comprobante inválido.');
      return b;
    } catch (e) {
      if (this.vigente(dueno) && turno === this.turnos.imagen) this.error(e);
      throw Error('No pudimos abrir el comprobante privado.');
    }
  }
}
