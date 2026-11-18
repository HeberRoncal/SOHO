import type { FuentePagosAdministracion } from '../modelos/fuente-pagos-administracion';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import {
  adaptarPedido,
  adaptarPaginacion,
  registro,
  texto,
} from '../../../tienda/pedidos/modelos/contrato-pedidos';
import {
  ComprobanteAdmin,
  DecisionPagoAdmin,
  PagoAdmin,
  ResumenAdmin,
} from '../modelos/pago-admin';
import {
  PedidoAdmin,
  ESTADOS_ENTREGA_ADMIN,
  ESTADOS_PAGO_ADMIN,
} from '../../pedidos/modelos/pedido-admin';

export function adaptarPagoAdmin(valor: unknown): PagoAdmin {
  const p = registro(valor),
    pedido = adaptarPedido(p),
    pago = registro(p['pago']);
  const revisores = Array.isArray(p['revisores']) ? p['revisores'].map(registro) : [];
  const comprobantes = (pago['comprobantes'] as unknown[])
    .map(registro)
    .sort((a, b) => Number(b['version']) - Number(a['version']))
    .map((c) => {
      const estado = texto(c['estadoRevision']).toLowerCase();
      if (!['pendiente', 'observado', 'aprobado', 'rechazado'].includes(estado))
        throw Error('Revisión inválida.');
      return Object.freeze({
        id: texto(c['id']),
        nombre: texto(c['nombreArchivo']),
        fecha: texto(c['creadoEn']),
        estado: estado as ComprobanteAdmin['estado'],
        monto: c['montoInformado'] === null ? null : Number(c['montoInformado']),
        operacion: c['numeroOperacion'] === null ? undefined : texto(c['numeroOperacion']),
        corregido: Number(c['version']) > 1,
        motivo: c['motivo'] === null ? undefined : texto(c['motivo']).toLowerCase(),
        mensaje: c['mensaje'] === null ? undefined : texto(c['mensaje']),
        solicitud:
          c['solicitudCorreccion'] === null
            ? undefined
            : (texto(c['solicitudCorreccion']).toLowerCase() as 'legible' | 'corregido'),
        revisadoEn: c['revisadoEn'] === null ? undefined : texto(c['revisadoEn']),
        revisadoPor: revisores.find((r) => r['id'] === c['id'])?.['nombre'] as string | undefined,
      });
    });
  const tipo = p['tipoCliente'];
  if (!['registrado', 'invitado'].includes(tipo as string)) throw Error('Cliente inválido.');
  const responsables = p['responsablesEnvio'] == null ? null : registro(p['responsablesEnvio']);
  const responsable = (campo: string) => {
    const valor = responsables?.[campo];
    if (valor == null) return null;
    const r = registro(valor);
    return Object.freeze({ id: texto(r['id']), nombre: texto(r['nombre']) });
  };
  let cancelacion: PedidoAdmin['cancelacion'];
  if (pedido.cancelacion) {
    const c = registro(p['cancelacion']),
      u = registro(c['registradaPor']);
    const entrega = texto(c['estadoEntregaAnterior'])
      .toLowerCase()
      .replaceAll('_', '-') as PedidoAdmin['estadoEntrega'];
    const pagoAnterior = texto(c['estadoPagoAnterior']).toLowerCase() as PedidoAdmin['estadoPago'];
    const version = c['versionPedido'],
      decision = c['decisionReservasConsultadas'];
    if (
      !Object.hasOwn(ESTADOS_ENTREGA_ADMIN, entrega) ||
      !['pendiente', 'confirmado', 'en-preparacion', 'incidencia'].includes(entrega) ||
      !Object.hasOwn(ESTADOS_PAGO_ADMIN, pagoAnterior) ||
      !Number.isSafeInteger(version) ||
      (version as number) < 2 ||
      (version as number) > pedido.version! ||
      (decision !== null && decision !== 'LIBERAR' && decision !== 'CONSERVAR')
    )
      throw Error('Cancelación administrativa inválida.');
    cancelacion = Object.freeze({
      fecha: pedido.cancelacion.fecha,
      motivo: texto(c['motivo']),
      autor: texto(u['nombre']),
      responsableId: texto(u['id']),
      estadoEntregaAnterior: entrega,
      estadoPagoAnterior: pagoAnterior,
      versionPedido: version as number,
      decisionReservasConsultadas: decision,
    });
  }
  let reservasCancelacion: PedidoAdmin['reservasCancelacion'];
  if (p['reservasCancelacion'] != null) {
    const r = registro(p['reservasCancelacion']);
    const cantidad = (campo: string) => {
      const n = r[campo];
      if (
        !Number.isSafeInteger(n) ||
        (n as number) < 0 ||
        (n as number) > pedido.articulos.reduce((s, a) => s + a.cantidad, 0)
      )
        throw Error('Reservas inválidas.');
      return n as number;
    };
    const automaticas = cantidad('unidadesLiberacionAutomatica'),
      consultables = cantidad('unidadesConsultables'),
      retenidas = cantidad('unidadesRetenidas');
    if (
      typeof r['puedeLiberarRetenidas'] !== 'boolean' ||
      automaticas + consultables > pedido.articulos.reduce((s, a) => s + a.cantidad, 0) ||
      retenidas !== (pedido.estadoPreparacion === 'cancelado' ? automaticas + consultables : 0) ||
      (r['puedeLiberarRetenidas'] &&
        (!cancelacion ||
          cancelacion.decisionReservasConsultadas !== 'CONSERVAR' ||
          !retenidas ||
          automaticas ||
          pedido.envio?.despachadoEn))
    )
      throw Error('Reservas incoherentes.');
    reservasCancelacion = Object.freeze({
      unidadesLiberacionAutomatica: automaticas,
      unidadesConsultables: consultables,
      unidadesRetenidas: retenidas,
      puedeLiberarRetenidas: r['puedeLiberarRetenidas'],
    });
  }
  let vencimientoReservas: PedidoAdmin['vencimientoReservas'];
  if (p['vencimientoReservas'] != null) {
    const r = registro(p['vencimientoReservas']),
      liberadas = r['unidadesLiberadas'],
      conservadas = r['unidadesConservadas'],
      total = pedido.articulos.reduce((s, a) => s + a.cantidad, 0);
    if (
      !Number.isSafeInteger(liberadas) ||
      !Number.isSafeInteger(conservadas) ||
      (liberadas as number) < 0 ||
      (conservadas as number) < 0 ||
      (liberadas as number) + (conservadas as number) > total ||
      ((liberadas as number) + (conservadas as number) > 0 &&
        (!['pendiente', 'observado'].includes(pedido.estadoPago) ||
          !['pendiente', 'incidencia'].includes(pedido.estadoPreparacion) ||
          pedido.cancelacion ||
          pedido.envio))
    )
      throw Error('Vencimientos de reservas inválidos.');
    vencimientoReservas = Object.freeze({
      unidadesLiberadas: liberadas as number,
      unidadesConservadas: conservadas as number,
    });
  }
  let recuperacionReservas: PedidoAdmin['recuperacionReservas'];
  if (p['recuperacionReservas'] != null) {
    const r = registro(p['recuperacionReservas']);
    if (
      typeof r['puedeSolicitar'] !== 'boolean' ||
      (r['puedeSolicitar'] &&
        (pedido.estadoPreparacion !== 'incidencia' ||
          !['pendiente', 'observado'].includes(pedido.estadoPago) ||
          pedido.cancelacion ||
          pedido.envio ||
          !vencimientoReservas?.unidadesLiberadas))
    )
      throw Error('Recuperación de reservas inválida.');
    let ultima: NonNullable<PedidoAdmin['recuperacionReservas']>['ultima'] = null;
    if (r['ultima'] !== null) {
      const u = registro(r['ultima']),
        responsable = registro(u['responsable']);
      if (
        !Number.isSafeInteger(u['versionPedido']) ||
        (u['versionPedido'] as number) < 2 ||
        (u['versionPedido'] as number) > pedido.version! ||
        !Number.isFinite(Date.parse(texto(u['fecha']))) ||
        Array.from(texto(u['motivo'])).length < 10 ||
        Array.from(texto(u['motivo'])).length > 300
      )
        throw Error('Historial de recuperación inválido.');
      ultima = Object.freeze({
        versionPedido: u['versionPedido'] as number,
        fecha: texto(u['fecha']),
        motivo: texto(u['motivo']),
        responsable: Object.freeze({
          id: texto(responsable['id']),
          nombre: texto(responsable['nombre']),
        }),
      });
    }
    recuperacionReservas = Object.freeze({ puedeSolicitar: r['puedeSolicitar'], ultima });
  }
  const eventos = [
    ...(Array.isArray(p['eventos'])
      ? p['eventos'].map((v) => ({ ...registro(v), interna: false }))
      : []),
    ...(Array.isArray(p['eventosInternos'])
      ? p['eventosInternos'].map((v) => ({ ...registro(v), interna: true }))
      : []),
  ]
    .map(registro)
    .map((e) => ({
      interna: e['interna'] === true,
      fecha: texto(e['fecha']),
      titulo: texto(e['titulo']),
      descripcion: texto(e['descripcion']),
      responsable:
        e['interna'] === true && e['responsable'] != null
          ? Object.freeze({
              id: texto(registro(e['responsable'])['id']),
              nombre: texto(registro(e['responsable'])['nombre']),
            })
          : null,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const datos: PedidoAdmin = Object.freeze({
    remoto: true,
    cancelacion,
    reservasCancelacion,
    recuperacionReservas,
    vencimientoReservas,
    datosEnvio: pedido.envio,
    seguimiento:
      pedido.envio?.transportista && pedido.envio.referenciaSeguimiento
        ? Object.freeze({
            empresa: pedido.envio.transportista,
            codigo: pedido.envio.referenciaSeguimiento,
          })
        : undefined,
    responsablesEnvio: responsables
      ? Object.freeze({
          preparacion: responsable('preparacion'),
          despacho: responsable('despacho'),
          entrega: responsable('entrega'),
        })
      : null,
    version: pedido.version,
    versionPago: Number(pago['version']),
    codigo: pedido.codigo,
    fecha: pedido.fecha,
    cliente: {
      identificador: texto(p['clienteId']),
      nombre: `${pedido.datos.nombres} ${pedido.datos.apellidos}`,
      correo: pedido.datos.correo,
      celular: pedido.datos.celular,
      tipo: tipo as 'invitado' | 'registrado',
    },
    direccion: {
      linea: pedido.datos.direccion,
      distrito: pedido.entrega.nombreDistrito,
      referencia: pedido.datos.referencia,
    },
    articulos: pedido.articulos,
    subtotal: pedido.subtotal,
    envio: pedido.entrega.costo,
    descuento: pedido.descuento ?? 0,
    total: pedido.total,
    metodoPago: pedido.metodoPago,
    estadoPago: pedido.estadoPago,
    estadoEntrega: pedido.estadoPreparacion,
    operacion: comprobantes[0]?.operacion,
    comprobante: comprobantes[0]?.nombre,
    observacion: pedido.observacionPago ?? undefined,
    eventos,
  });
  return Object.freeze({ pedido: datos, comprobantes: Object.freeze(comprobantes) });
}

@Injectable({ providedIn: 'root' })
export class PagosAdministracionApi implements FuentePagosAdministracion {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  readonly remoto = true;
  readonly estadoListado = signal<'inicial' | 'cargando' | 'lista' | 'error'>('inicial');
  readonly mensajeListado = signal('');
  readonly paginacion = signal({ pagina: 1, limite: 20, total: 0, paginas: 0 });
  readonly conteos = signal<Record<string, number>>({});
  readonly resultados = signal<readonly PagoAdmin[]>([]);
  readonly resumenRemoto = signal<ResumenAdmin | null>(null);
  readonly estadoResumen = signal<'inicial' | 'cargando' | 'lista' | 'error'>('inicial');
  readonly mensajeResumen = signal('');
  private secuenciaResumen = 0;
  private readonly cache = signal<ReadonlyMap<string, PagoAdmin>>(new Map());
  private dueno = '';
  private secuencia = 0;
  private readonly decisiones = new Set<string>();
  readonly pagos = computed(() => {
    const cache = this.cache();
    return this.identidad() === this.dueno ? [...cache.values()] : [];
  });
  readonly pedidos = computed(() => this.pagos().map((p) => p.pedido));
  constructor() {
    effect(() => {
      this.cuenta.perfil();
      this.cuenta.estadoSesion();
      untracked(() => this.sincronizar());
    });
    inject(DestroyRef).onDestroy(() => {
      this.secuencia++;
    });
  }
  private identidad() {
    return `${this.cuenta.perfil()?.id ?? ''}:${this.auth.revision}:${this.cuenta.perfil()?.rol ?? ''}`;
  }
  private sincronizar() {
    const identidad = this.identidad();
    if (identidad === this.dueno) return;
    this.dueno = identidad;
    this.secuencia++;
    this.secuenciaResumen++;
    this.resumenRemoto.set(null);
    this.estadoResumen.set('inicial');
    this.cache.set(new Map());
    this.resultados.set([]);
    this.conteos.set({});
    this.paginacion.set({ pagina: 1, limite: 20, total: 0, paginas: 0 });
    this.estadoListado.set('inicial');
    this.mensajeListado.set('');
  }
  private vigente(i: string) {
    return i === this.identidad() && this.cuenta.perfil()?.rol === 'ADMIN';
  }
  private guardar(p: PagoAdmin) {
    if ((this.cache().get(p.pedido.codigo)?.pedido.version ?? 0) > (p.pedido.version ?? 0)) return;
    this.cache.update((m) => new Map(m).set(p.pedido.codigo, p));
    this.resultados.update((lista) =>
      lista.map((v) => (v.pedido.codigo === p.pedido.codigo ? p : v)),
    );
  }
  obtener(codigo: string) {
    if (this.identidad() !== this.dueno) return undefined;
    return this.pagos().find((p) => p.pedido.codigo === codigo);
  }
  incorporarPedido(valor: unknown) {
    this.sincronizar();
    if (!this.vigente(this.dueno)) throw Error('Sin autorización.');
    const p = adaptarPagoAdmin(valor);
    this.guardar(p);
    return this.obtener(p.pedido.codigo)!.pedido;
  }
  retirarDatosPrivados() {
    this.cache.set(new Map());
    this.resultados.set([]);
    this.resumenRemoto.set(null);
  }
  async cargarListado(filtros: Record<string, string> = {}, tipo = 'pagos') {
    this.sincronizar();
    const identidad = this.dueno,
      secuencia = ++this.secuencia;
    if (!this.vigente(identidad)) return;
    this.estadoListado.set('cargando');
    this.mensajeListado.set('');
    this.resultados.set([]);
    try {
      const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
      const r = registro(
        await firstValueFrom(
          this.http.get<unknown>(`/api/admin/${tipo === 'pedidos' ? 'pedidos' : 'pagos'}`, {
            params,
            timeout: 15000,
          }),
        ),
      );
      if (!this.vigente(identidad) || secuencia !== this.secuencia) return;
      if (!Array.isArray(r['pedidos'])) throw Error('Listado inválido.');
      const lista = r['pedidos'].map(adaptarPagoAdmin),
        paginacion = adaptarPaginacion(r['paginacion']),
        conteos = registro(r['conteos']);
      lista.forEach((p) => this.guardar(p));
      this.resultados.set(lista.map((p) => this.cache().get(p.pedido.codigo) ?? p));
      this.paginacion.set(paginacion);
      this.conteos.set(conteos as Record<string, number>);
      this.estadoListado.set('lista');
    } catch (error) {
      if (this.vigente(identidad) && secuencia === this.secuencia) {
        this.estadoListado.set('error');
        this.mensajeListado.set(this.error(error));
      }
    }
  }
  async cargarDetalle(codigo: string) {
    this.sincronizar();
    const i = this.dueno;
    if (!this.vigente(i)) return { ok: false, error: 'Inicia sesión como administrador.' };
    try {
      const r = registro(
        await firstValueFrom(
          this.http.get<unknown>(`/api/admin/pagos/${codigo}`, { timeout: 15000 }),
        ),
      );
      if (!this.vigente(i)) return { ok: false, error: 'La sesión cambió.' };
      this.guardar(adaptarPagoAdmin(r['pedido']));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.vigente(i) ? this.error(error) : 'La sesión cambió.' };
    }
  }
  async cargarResumen(desde: string, hasta: string) {
    this.sincronizar();
    const identidad = this.dueno,
      secuencia = ++this.secuenciaResumen;
    if (!this.vigente(identidad)) return;
    this.estadoResumen.set('cargando');
    this.mensajeResumen.set('');
    try {
      const r = registro(
        await firstValueFrom(
          this.http.get<unknown>('/api/admin/resumen-pedidos', {
            params: { desde, hasta },
            timeout: 15000,
          }),
        ),
      );
      if (!this.vigente(identidad) || secuencia !== this.secuenciaResumen) return;
      const lista = (campo: string) => {
        if (!Array.isArray(r[campo])) throw Error('Resumen inválido.');
        return (r[campo] as unknown[]).map(adaptarPagoAdmin);
      };
      this.resumenRemoto.set({
        pendientes: lista('pendientes'),
        observados: lista('observados'),
        porPreparar: lista('porPreparar').map((p) => p.pedido),
        incidencias: lista('incidencias').map((p) => p.pedido),
        reservasVencidas:
          r['reservasVencidas'] === undefined ? [] : lista('reservasVencidas').map((p) => p.pedido),
        reservasVencidasTotal:
          r['reservasVencidasTotal'] === undefined ? 0 : Number(r['reservasVencidasTotal']),
        recientes: lista('recientes').map((p) => p.pedido),
        conteos: registro(r['conteos']) as Record<string, number>,
        porPrepararTotal: Number(r['porPrepararTotal']),
        incidenciasTotal: Number(r['incidenciasTotal']),
        importePendiente: Number(r['importePendiente']),
        ventas: r['ventas'] as ResumenAdmin['ventas'],
      });
      this.estadoResumen.set('lista');
    } catch (error) {
      if (this.vigente(identidad) && secuencia === this.secuenciaResumen) {
        this.estadoResumen.set('error');
        this.mensajeResumen.set(this.error(error));
      }
    }
  }
  async revisar(codigo: string, decision: DecisionPagoAdmin) {
    this.sincronizar();
    const i = this.dueno;
    if (!this.vigente(i) || this.decisiones.has(codigo))
      return { ok: false, error: 'Espera a que termine la operación.' };
    if (
      decision.accion === 'aprobado' &&
      this.obtener(codigo)?.pedido.vencimientoReservas?.unidadesLiberadas
    )
      return {
        ok: false,
        error:
          'La reserva venció y fue liberada. Resuelve la incidencia de inventario antes de aprobar el pago.',
      };
    this.decisiones.add(codigo);
    try {
      const {
        accion,
        comprobanteId,
        confirmado,
        motivo,
        mensaje,
        solicitud,
        versionPedido,
        versionPago,
      } = decision;
      const cuerpo = {
        comprobanteId,
        versionPedido,
        versionPago,
        accion: accion.toUpperCase(),
        ...(accion === 'aprobado'
          ? { confirmado }
          : {
              motivo: motivo.toUpperCase(),
              mensaje: mensaje.trim(),
              ...(accion === 'observado' ? { solicitud: solicitud.toUpperCase() } : { confirmado }),
            }),
      };
      const r = registro(
        await firstValueFrom(
          this.http.post<unknown>(`/api/admin/pagos/${codigo}/decision`, cuerpo, {
            timeout: 30000,
          }),
        ),
      );
      if (!this.vigente(i)) return { ok: false, error: 'La sesión cambió.' };
      this.guardar(adaptarPagoAdmin(r['pedido']));
      return { ok: true };
    } catch (error) {
      if (!this.vigente(i)) return { ok: false, error: 'La sesión cambió.' };
      // Tras un timeout puede haberse confirmado: se consulta, nunca se repite la escritura.
      await this.cargarDetalle(codigo);
      return { ok: false, error: this.vigente(i) ? this.error(error) : 'La sesión cambió.' };
    } finally {
      this.decisiones.delete(codigo);
    }
  }
  async comprobante(codigo: string, id: string) {
    const i = this.identidad();
    if (!this.vigente(i)) throw Error('Sin autorización.');
    const blob = await firstValueFrom(
      this.http.get(`/api/pedidos/${codigo}/comprobantes/${id}`, {
        responseType: 'blob',
        timeout: 15000,
      }),
    );
    if (
      !this.vigente(i) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
      !blob.size ||
      blob.size > 5 * 1024 * 1024
    )
      throw Error('No se pudo abrir el comprobante.');
    return blob;
  }
  private error(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409)
        return 'El pedido cambió o sus reservas necesitan revisión. Actualiza y revisa el comprobante actual.';
      if (error.status === 401 || error.status === 403) {
        this.cache.set(new Map());
        this.resultados.set([]);
        return 'Tu sesión no autoriza esta operación. Inicia sesión nuevamente.';
      }
      if (error.status === 404) return 'No encontramos el pedido.';
      if (error.status === 400)
        return 'Revisa la confirmación, el motivo y el mensaje antes de guardar.';
    }
    return 'No pudimos confirmar la operación. Actualiza el pedido para comprobar su estado antes de reintentar.';
  }
}
