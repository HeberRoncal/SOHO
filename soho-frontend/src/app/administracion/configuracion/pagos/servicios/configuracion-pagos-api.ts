import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';
import { Cuenta } from '../../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../../tienda/cuenta/servicios/estado-autenticacion';
import {
  ArchivoQrPago,
  BilleteraPago,
  BorradorMetodoPago,
  CapacidadesPagos,
  ConfiguracionPagos,
  DatosCargaQr,
  PublicarPagos,
  borradorPagos,
  consultaPagos,
  crearPublicacionPagos,
  datosCargaQrGuardada,
  describirArchivoQr,
  erroresPagos,
  publicacionPagosGuardada,
  registroPagos,
  respuestaCargaQr,
  respuestaPublicacionPagos,
} from '../modelos/configuracion-pagos';

type Fase = 'enviando' | 'incierta' | 'confirmada' | 'rechazada';
export interface PublicacionPagosLocal {
  cuerpo: PublicarPagos;
  fase: Fase;
  mensaje: string;
  resultado: ConfiguracionPagos | null;
  consultarDesde: number;
}
export interface CargaQrLocal {
  datos: Readonly<DatosCargaQr>;
  fase: Fase;
  mensaje: string;
  archivo: ArchivoQrPago | null;
  consultarDesde: number;
}
const ruta = '/api/admin/configuracion/pagos';
@Injectable({ providedIn: 'root' })
export class ConfiguracionPagosApi {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  private propietario = '';
  private epoca = 0;
  private turno = 0;
  private abierta = false;
  private readonly cancelar = new Subject<void>();
  private readonly bloqueado = signal(false);
  private readonly vigente = signal<ConfiguracionPagos | null>(null);
  private readonly capacidad = signal<CapacidadesPagos | null>(null);
  private readonly datos = signal<BorradorMetodoPago[]>([]);
  private readonly versionBase = signal<number | null>(null);
  private readonly operacion = signal<PublicacionPagosLocal | null>(null);
  private readonly archivos = signal<ReadonlyMap<BilleteraPago, CargaQrLocal>>(new Map());
  private readonly preparando = signal<ReadonlySet<BilleteraPago>>(new Set());
  private readonly enCurso = new Set<string>();
  private readonly errorGuardado = signal('');
  readonly estado = signal<'inicial' | 'cargando' | 'lista' | 'error' | 'sin-permiso'>('inicial');
  readonly mensaje = signal('');
  readonly intentado = signal(false);
  readonly actual = computed(() => (this.autorizado() ? this.vigente() : null));
  readonly capacidades = computed(() => (this.autorizado() ? this.capacidad() : null));
  readonly borrador = computed(() => (this.autorizado() ? this.datos() : []));
  readonly publicacion = computed(() => (this.autorizado() ? this.operacion() : null));
  readonly errorRecuperacion = computed(() => (this.autorizado() ? this.errorGuardado() : ''));
  readonly versionBorrador = computed(() => (this.autorizado() ? this.versionBase() : null));
  readonly cambios = computed(
    () =>
      !!this.actual() &&
      JSON.stringify(this.datos()) !== JSON.stringify(borradorPagos(this.actual()!)),
  );
  readonly desactualizado = computed(
    () => this.actual() !== null && this.versionBase() !== this.actual()!.version,
  );
  readonly errores = computed(() => erroresPagos(this.borrador()));
  readonly bloqueadoFormulario = computed(
    () =>
      !this.autorizado() ||
      this.estado() !== 'lista' ||
      !!this.publicacion() ||
      !!this.errorRecuperacion(),
  );
  readonly cargasPendientes = computed(
    () =>
      this.autorizado() &&
      ([...this.archivos().values()].some((c) => !['confirmada', 'rechazada'].includes(c.fase)) ||
        this.preparando().size > 0),
  );
  readonly puedePublicar = computed(
    () =>
      !this.bloqueadoFormulario() &&
      !this.desactualizado() &&
      this.cambios() &&
      !this.cargasPendientes(),
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
  private esVigente(i: string, epoca: number) {
    return this.autorizado() && this.identidad() === i && this.epoca === epoca;
  }
  private almacenamiento() {
    return 'soho:configuracion-pagos:operaciones:' + this.cuenta.perfil()!.id;
  }
  private sincronizar() {
    const i = this.identidad();
    if (i !== this.propietario) {
      this.limpiar();
      this.propietario = i;
      this.bloqueado.set(false);
      if (this.autorizado()) this.restaurar();
    }
  }
  private limpiar() {
    this.epoca++;
    this.turno++;
    this.cancelar.next();
    this.enCurso.clear();
    this.vigente.set(null);
    this.capacidad.set(null);
    this.datos.set([]);
    this.versionBase.set(null);
    this.operacion.set(null);
    this.archivos.set(new Map());
    this.preparando.set(new Set());
    this.estado.set('inicial');
    this.mensaje.set('');
    this.errorGuardado.set('');
    this.intentado.set(false);
  }
  private restaurar() {
    try {
      const guardada = sessionStorage.getItem(this.almacenamiento());
      if (guardada === null) return;
      const d = registroPagos(JSON.parse(guardada));
      if (
        d['version'] !== 1 ||
        d['responsable'] !== this.cuenta.perfil()!.id ||
        !Array.isArray(d['cargas']) ||
        d['cargas'].length > 2
      )
        throw Error();
      const cargas = new Map<BilleteraPago, CargaQrLocal>();
      for (const v of d['cargas']) {
        const datos = datosCargaQrGuardada(v);
        if (cargas.has(datos.metodo)) throw Error();
        cargas.set(datos.metodo, {
          datos,
          fase: 'incierta',
          archivo: null,
          mensaje: 'Consulta la carga recuperada antes de seleccionar otra imagen.',
          consultarDesde: 0,
        });
      }
      const publicacion =
        d['publicacion'] === null ? null : publicacionPagosGuardada(d['publicacion']);
      this.archivos.set(cargas);
      if (publicacion)
        this.operacion.set({
          cuerpo: publicacion,
          fase: 'incierta',
          resultado: null,
          mensaje:
            'Se recuperó un guardado pendiente. Consulta su resultado antes de hacer otro cambio.',
          consultarDesde: 0,
        });
    } catch {
      this.errorGuardado.set(
        'No pudimos leer la recuperación de Pagos de esta pestaña. Conservamos los datos y bloqueamos nuevas escrituras para evitar duplicados.',
      );
    }
  }
  private conservar(publicacion = this.operacion(), cargas = this.archivos()) {
    try {
      sessionStorage.setItem(
        this.almacenamiento(),
        JSON.stringify({
          version: 1,
          responsable: this.cuenta.perfil()!.id,
          publicacion: publicacion?.cuerpo ?? null,
          cargas: [...cargas.values()].map((c) => c.datos),
        }),
      );
    } catch {
      throw Error(
        'Habilita el almacenamiento de esta pestaña para conservar la solicitud antes de enviarla.',
      );
    }
  }
  private fallo(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if ([401, 403].includes(e.status)) {
        this.limpiar();
        this.bloqueado.set(true);
        this.estado.set('sin-permiso');
        return 'Tu sesión ya no permite gestionar Pagos. Inicia sesión nuevamente.';
      }
      if (e.status === 409)
        return 'La configuración cambió. Tus campos se conservan; consulta los datos actuales antes de guardar otra vez.';
      if (e.status === 422)
        return 'Uno de los QR ya no se puede publicar. Actualiza y selecciona un QR disponible de la billetera correspondiente.';
      if (e.status === 404)
        return 'No encontramos una operación propia confirmada con esa clave. Conserva el intento original.';
      if ([400, 413, 415].includes(e.status))
        return 'Revisa los datos o la imagen: PNG, JPG o WebP estático, hasta 2 MB y 4096 píxeles por lado.';
      if (e.status === 429)
        return 'Hay demasiadas solicitudes. Espera un momento antes de volver a consultar.';
    }
    return 'No pudimos completar la consulta. Puedes reintentar.';
  }
  abrir() {
    this.abierta = true;
    return this.cargar();
  }
  salir() {
    this.abierta = false;
    this.turno++;
    this.cancelar.next();
  }
  async cargar() {
    this.sincronizar();
    const i = this.propietario,
      epoca = this.epoca,
      turno = ++this.turno;
    this.cancelar.next();
    if (!this.autorizado()) {
      this.estado.set('sin-permiso');
      this.mensaje.set('Inicia sesión como administrador.');
      return;
    }
    this.estado.set('cargando');
    this.mensaje.set('');
    try {
      const r = consultaPagos(
        await firstValueFrom(
          this.http.get<unknown>(ruta).pipe(timeout(15000), takeUntil(this.cancelar)),
        ),
      );
      if (!this.esVigente(i, epoca) || turno !== this.turno) return;
      this.vigente.set(r.configuracion);
      this.capacidad.set(r.capacidades);
      if (this.versionBase() === null) {
        this.datos.set(borradorPagos(r.configuracion));
        this.versionBase.set(r.configuracion.version);
      }
      this.estado.set('lista');
    } catch (e) {
      if (!this.esVigente(i, epoca) || turno !== this.turno) return;
      const m = this.fallo(e);
      this.mensaje.set(m);
      if (this.autorizado()) this.estado.set('error');
    }
  }
  campo(metodo: BilleteraPago, campo: 'activo' | 'celular' | 'titular', valor: string | boolean) {
    if (
      this.bloqueadoFormulario() ||
      (campo !== 'activo' && !this.editable(metodo)) ||
      (campo === 'activo' ? typeof valor !== 'boolean' : typeof valor !== 'string')
    )
      return;
    this.datos.update((lista) =>
      lista.map((m) => (m.metodo === metodo ? { ...m, [campo]: valor } : m)),
    );
    this.mensaje.set('');
  }
  editable(m: BilleteraPago) {
    return (
      !this.bloqueadoFormulario() &&
      !this.desactualizado() &&
      this.actual()?.metodos.find((v) => v.metodo === m)?.activo === false
    );
  }
  async guardarDirecto(metodo?: BilleteraPago, activo?: boolean) {
    this.sincronizar();
    this.intentado.set(true);
    const actual = this.actual();
    if (!actual || this.bloqueadoFormulario() || this.desactualizado() || this.cargasPendientes())
      return;
    const anteriores = this.borrador();
    const lista = metodo
      ? borradorPagos(actual).map((m) => {
          if (m.metodo !== metodo) return m;
          // Desactivar conserva exactamente los datos que estaban en uso.
          return activo === false
            ? { ...m, activo: false }
            : {
                ...anteriores.find((v) => v.metodo === metodo)!,
                ...(activo === undefined ? {} : { activo }),
              };
        })
      : anteriores;
    const cuerpo = crearPublicacionPagos(lista, actual.version);
    if (
      JSON.stringify(cuerpo.metodos) ===
      JSON.stringify(crearPublicacionPagos(borradorPagos(actual), actual.version).metodos)
    )
      return;
    await this.iniciarGuardado(cuerpo);
    const op = this.publicacion();
    if (
      op?.fase === 'confirmada' &&
      this.actual()?.version === op.resultado?.version &&
      this.estado() === 'lista'
    ) {
      this.cerrarPublicacion();
      if (metodo)
        this.datos.update((lista) =>
          lista.map((m) =>
            m.metodo === metodo ? m : anteriores.find((v) => v.metodo === m.metodo)!,
          ),
        );
      this.mensaje.set('Cambios guardados.');
      for (const m of ['YAPE', 'PLIN'] as const) {
        const c = this.carga(m);
        if (
          c?.fase === 'confirmada' &&
          this.actual()?.metodos.find((v) => v.metodo === m)?.qr?.id === c.archivo?.id
        )
          this.cerrarCarga(m);
      }
    }
  }
  descartar() {
    if (this.bloqueadoFormulario() || !this.actual()) return;
    this.datos.set(borradorPagos(this.actual()!));
    this.versionBase.set(this.actual()!.version);
    this.intentado.set(false);
    this.mensaje.set('Datos actualizados.');
  }
  errorCampo(m: BilleteraPago, campo: 'celular' | 'titular' | 'qr') {
    return this.intentado() ? (this.errores()[m + '-' + campo] ?? '') : '';
  }
  async publicar(confirmado: boolean) {
    this.sincronizar();
    this.intentado.set(true);
    if (!this.puedePublicar() || !confirmado)
      throw Error(
        'Revisa los cambios, las cargas pendientes y confirma los receptores antes de publicar.',
      );
    const cuerpo = crearPublicacionPagos(this.borrador(), this.versionBase()!);
    await this.iniciarGuardado(cuerpo);
  }
  private async iniciarGuardado(cuerpo: PublicarPagos) {
    const op: PublicacionPagosLocal = {
      cuerpo,
      fase: 'incierta',
      mensaje: '',
      resultado: null,
      consultarDesde: 0,
    };
    this.conservar(op);
    this.operacion.set(op);
    await this.ejecutarPublicacion(op, false);
  }
  recuperarPublicacion() {
    const op = this.publicacion();
    return op ? this.ejecutarPublicacion(op, true) : Promise.resolve();
  }
  reenviarPublicacion() {
    const op = this.publicacion();
    return op ? this.ejecutarPublicacion(op, false) : Promise.resolve();
  }
  private async ejecutarPublicacion(op: PublicacionPagosLocal, consultar: boolean) {
    this.sincronizar();
    const i = this.propietario,
      epoca = this.epoca,
      llave = epoca + ':publicacion';
    if (
      !this.autorizado() ||
      this.publicacion() !== op ||
      this.enCurso.has(llave) ||
      ['confirmada', 'rechazada'].includes(op.fase) ||
      Date.now() < op.consultarDesde
    )
      return;
    this.enCurso.add(llave);
    this.operacion.set({ ...op, fase: 'enviando', mensaje: '' });
    try {
      const r = await firstValueFrom(
        (consultar
          ? this.http.get<unknown>(`${ruta}/operaciones/${op.cuerpo.claveSolicitud}`)
          : this.http.patch<unknown>(ruta, op.cuerpo)
        ).pipe(timeout(30000)),
      );
      if (!this.esVigente(i, epoca)) return;
      const resultado = respuestaPublicacionPagos(r, op.cuerpo);
      this.operacion.set({
        ...op,
        fase: 'confirmada',
        resultado,
        consultarDesde: 0,
        mensaje: `Cambios guardados. Los datos receptores quedaron actualizados.`,
      });
      if (this.abierta) await this.cargar();
    } catch (e) {
      if (!this.esVigente(i, epoca)) return;
      const mensaje = this.fallo(e);
      if (!this.esVigente(i, epoca)) {
        this.mensaje.set(mensaje);
        return;
      }
      const rechazada =
        !consultar &&
        e instanceof HttpErrorResponse &&
        [400, 409, 413, 415, 422].includes(e.status);
      this.operacion.set({
        ...op,
        fase: rechazada ? 'rechazada' : 'incierta',
        resultado: null,
        consultarDesde: this.esperaError(e),
        mensaje: rechazada
          ? mensaje
          : 'No se confirmó el guardado. Conservamos la solicitud: consulta su resultado o reenvía el mismo contenido con la misma clave.',
      });
      if (rechazada && this.abierta) await this.cargar();
    } finally {
      this.enCurso.delete(llave);
    }
  }
  cerrarPublicacion() {
    const op = this.publicacion(),
      actual = this.actual();
    if (
      !op ||
      !['confirmada', 'rechazada'].includes(op.fase) ||
      !actual ||
      this.estado() !== 'lista' ||
      (op.resultado && actual.version < op.resultado.version)
    )
      return;
    try {
      this.conservar(null);
      this.operacion.set(null);
      this.datos.set(borradorPagos(actual));
      this.versionBase.set(actual.version);
      this.intentado.set(false);
      this.mensaje.set('Se cargaron los datos actuales.');
    } catch {
      this.errorGuardado.set(
        'No pudimos cerrar la recuperación. Conserva la clave y habilita el almacenamiento de esta pestaña.',
      );
    }
  }
  carga(m: BilleteraPago) {
    return this.autorizado() ? this.archivos().get(m) : undefined;
  }
  preparandoQr(m: BilleteraPago) {
    return this.autorizado() && this.preparando().has(m);
  }
  private ponerCarga(carga: CargaQrLocal, persistir = false) {
    const n = new Map(this.archivos()).set(carga.datos.metodo, Object.freeze(carga));
    if (persistir) this.conservar(this.operacion(), n);
    this.archivos.set(n);
  }
  async cargarQr(m: BilleteraPago, archivo: File) {
    this.sincronizar();
    const i = this.propietario,
      epoca = this.epoca;
    if (!this.editable(m) || !this.capacidades()?.cargarQr || this.preparando().has(m)) return;
    const previa = this.carga(m);
    if (
      previa &&
      (['enviando', 'confirmada', 'rechazada'].includes(previa.fase) ||
        Date.now() < previa.consultarDesde)
    )
      throw Error('Resuelve o cierra el resultado de la carga anterior antes de elegir otro QR.');
    this.preparando.update((s) => new Set(s).add(m));
    try {
      const datos = await describirArchivoQr(archivo, m, previa?.datos.claveCarga);
      if (!this.esVigente(i, epoca)) return;
      if (
        previa &&
        (datos.sha256 !== previa.datos.sha256 ||
          datos.nombre !== previa.datos.nombre ||
          datos.tipo !== previa.datos.tipo ||
          datos.tamano !== previa.datos.tamano)
      )
        throw Error(
          'Selecciona exactamente el mismo archivo del intento pendiente. Su clave se conserva.',
        );
      const carga: CargaQrLocal = previa ?? {
        datos,
        fase: 'incierta',
        archivo: null,
        mensaje: '',
        consultarDesde: 0,
      };
      if (!previa) this.ponerCarga(carga, true);
      await this.ejecutarCarga(carga, archivo);
    } finally {
      if (this.esVigente(i, epoca))
        this.preparando.update((s) => {
          const n = new Set(s);
          n.delete(m);
          return n;
        });
    }
  }
  recuperarCarga(m: BilleteraPago) {
    const c = this.carga(m);
    return c ? this.ejecutarCarga(c) : Promise.resolve();
  }
  private async ejecutarCarga(carga: CargaQrLocal, archivo?: File) {
    this.sincronizar();
    const i = this.propietario,
      epoca = this.epoca,
      m = carga.datos.metodo,
      llave = epoca + ':qr:' + m;
    if (
      !this.autorizado() ||
      this.carga(m) !== carga ||
      this.enCurso.has(llave) ||
      ['confirmada', 'rechazada'].includes(carga.fase) ||
      Date.now() < carga.consultarDesde
    )
      return;
    this.enCurso.add(llave);
    this.ponerCarga({ ...carga, fase: 'enviando', mensaje: '' });
    try {
      let r: unknown;
      if (archivo) {
        const cuerpo = new FormData();
        cuerpo.append('datos', JSON.stringify({ claveCarga: carga.datos.claveCarga, metodo: m }));
        cuerpo.append('archivo', archivo, carga.datos.nombre);
        const res = await firstValueFrom(
          this.http
            .post<unknown>(ruta + '/qr', cuerpo, { observe: 'response' })
            .pipe(timeout(60000)),
        );
        if (![201, 202].includes(res.status)) throw Error('Respuesta de carga inválida.');
        r = res.body;
      } else
        r = await firstValueFrom(
          this.http
            .get<unknown>(`${ruta}/qr/cargas/${carga.datos.claveCarga}`)
            .pipe(timeout(30000)),
        );
      if (!this.esVigente(i, epoca)) return;
      const a = respuestaCargaQr(r, carga.datos),
        pendiente = ['PENDIENTE', 'CONCILIANDO'].includes(a.estado);
      const datos = datosCargaQrGuardada({ ...carga.datos, archivoId: a.id });
      const actualizada: CargaQrLocal = {
        datos,
        archivo: a,
        fase: a.estado === 'DISPONIBLE' ? 'confirmada' : pendiente ? 'incierta' : 'rechazada',
        consultarDesde: pendiente
          ? Math.max(Date.now() + 5000, a.revisionEn ? Date.parse(a.revisionEn) : 0)
          : 0,
        mensaje:
          a.estado === 'DISPONIBLE'
            ? 'QR cargado. Se puede guardar en este método de pago.'
            : pendiente
              ? 'La carga sigue pendiente. Espera a la próxima revisión y consulta su resultado.'
              : 'Este archivo ya no está disponible para publicar. Puedes cerrar este resultado y cargar otro QR.',
      };
      try {
        this.ponerCarga(actualizada, true);
      } catch {
        this.ponerCarga(actualizada);
        this.errorGuardado.set(
          'La carga respondió, pero no pudimos actualizar su recuperación local. Conserva la clave y habilita el almacenamiento.',
        );
      }
    } catch (e) {
      if (!this.esVigente(i, epoca)) return;
      const mensaje = this.fallo(e);
      if (!this.esVigente(i, epoca)) {
        this.mensaje.set(mensaje);
        return;
      }
      const rechazada =
        !!archivo && e instanceof HttpErrorResponse && [400, 409, 413, 415, 422].includes(e.status);
      this.ponerCarga({
        ...carga,
        fase: rechazada ? 'rechazada' : 'incierta',
        consultarDesde: this.esperaError(e),
        mensaje: rechazada
          ? mensaje
          : 'No se confirmó la carga. Conservamos su clave: consulta el resultado o vuelve a seleccionar exactamente el mismo archivo.',
        archivo: null,
      });
    } finally {
      this.enCurso.delete(llave);
    }
  }
  usarQr(m: BilleteraPago) {
    const a = this.carga(m)?.archivo;
    if (!this.editable(m) || !a || a.estado !== 'DISPONIBLE' || a.metodo !== m) return;
    this.datos.update((lista) => lista.map((v) => (v.metodo === m ? { ...v, qr: a } : v)));
    this.mensaje.set('QR seleccionado.');
  }
  quitarQr(m: BilleteraPago) {
    if (
      this.bloqueadoFormulario() ||
      !this.editable(m) ||
      this.preparando().has(m) ||
      this.carga(m)?.fase === 'enviando'
    )
      return;
    this.datos.update((lista) => lista.map((v) => (v.metodo === m ? { ...v, qr: null } : v)));
  }
  cerrarCarga(m: BilleteraPago) {
    const c = this.carga(m);
    if (
      !this.autorizado() ||
      this.publicacion() ||
      !c ||
      !['confirmada', 'rechazada'].includes(c.fase)
    )
      return;
    const n = new Map(this.archivos());
    n.delete(m);
    try {
      this.conservar(this.operacion(), n);
      this.archivos.set(n);
    } catch {
      this.errorGuardado.set('No pudimos cerrar la recuperación de esta carga. Conserva su clave.');
    }
  }
  private esperaError(e: unknown) {
    return e instanceof HttpErrorResponse && e.status === 429
      ? Date.now() + Math.max(5, Math.min(300, Number(e.headers.get('Retry-After')) || 5)) * 1000
      : 0;
  }
}
