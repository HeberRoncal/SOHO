import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import {
  adaptarConfiguracionReservas,
  borradorReserva,
  politicaReserva,
  mismaPolitica,
  BorradorReserva,
  RespuestaReservas,
  PoliticaReserva,
} from './contrato-reservas';

const ruta = '/api/admin/configuracion/reservas';
@Injectable()
export class InventarioEstado {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(EstadoAutenticacion);
  private readonly destruccion = inject(DestroyRef);
  private readonly dueno = signal<string | null>(null);
  private readonly datos = signal<BorradorReserva | null>(null);
  private readonly respuesta = signal<RespuestaReservas | null>(null);
  private secuencia = 0;
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly errorCarga = signal('');
  readonly mensaje = signal('');
  readonly esError = signal(false);
  readonly recargaNecesaria = signal(false);
  readonly intentado = signal(false);
  readonly confirmado = signal(false);
  readonly cargada = computed(
    () => this.dueno() !== null && this.dueno() === this.identidad() && !!this.respuesta(),
  );
  readonly configuracion = computed(() =>
    this.cargada() ? this.respuesta()!.configuracion : null,
  );
  readonly borrador = computed(() => (this.cargada() ? this.datos() : null));
  readonly temporalDisponible = computed(
    () => this.cargada() && this.respuesta()!.capacidades.reservaTemporalDisponible,
  );
  readonly ocupado = computed(() => this.cargando() || this.guardando());
  readonly bloqueado = computed(() => this.ocupado() || !this.cargada() || !!this.errorCarga());
  readonly cambios = computed(
    () =>
      !!this.borrador() &&
      JSON.stringify(this.datos()) !== JSON.stringify(borradorReserva(this.configuracion()!)),
  );
  readonly errores = computed<Record<string, string>>(() => {
    const b = this.borrador(),
      p = this.configuracion();
    if (!b || !p) return {};
    const e: Record<string, string> = {};
    if (!['HASTA_DECISION', 'TIEMPO'].includes(b.modo))
      e['modo'] = 'Selecciona una política válida.';
    if (!['LIBERAR', 'PREGUNTAR'].includes(b.accionCancelacion))
      e['accionCancelacion'] = 'Selecciona qué ocurrirá al cancelar.';
    if (b.modo === 'TIEMPO') {
      if (!/^\d{1,6}$/.test(b.horas) || Number(b.horas) < 1 || Number(b.horas) > 999999)
        e['horas'] = 'Usa de 1 a 999999 horas enteras.';
      if (!['LIBERAR_Y_ALERTAR', 'SOLO_ALERTAR'].includes(b.accionVencimiento))
        e['accionVencimiento'] = 'Selecciona una acción de vencimiento.';
      if (!this.temporalDisponible() && !mismaPolitica(p, politicaReserva(b)))
        e['modo'] =
          'La reserva por tiempo no está disponible para nuevos cambios. Puedes volver a reserva hasta decisión.';
    }
    if (this.cambios() && p.version === 4294967295)
      e['version'] = 'La configuración alcanzó su límite de versiones y requiere revisión.';
    if (this.cambios() && !this.confirmado())
      e['confirmado'] = 'Confirma que el cambio se aplicará únicamente a nuevas reservas.';
    return e;
  });
  readonly listaErrores = computed(() => [
    ...(this.intentado() ? Object.values(this.errores()) : []),
    ...(this.esError() && this.mensaje() ? [this.mensaje()] : []),
  ]);
  constructor() {
    let observada = this.identidad();
    effect(() => {
      const identidad = this.identidad();
      this.sesion.estado();
      untracked(() => {
        if (observada !== identidad) {
          observada = identidad;
          this.limpiar();
        }
      });
    });
    this.destruccion.onDestroy(() => {
      this.secuencia++;
    });
  }
  private identidad() {
    const p = this.sesion.perfil();
    return p?.rol === 'ADMIN' ? `${p.id}:${this.sesion.revision}` : null;
  }
  private vigente(id: string, n: number) {
    return !this.destruccion.destroyed && this.identidad() === id && this.secuencia === n;
  }
  private limpiar() {
    this.secuencia++;
    this.dueno.set(null);
    this.datos.set(null);
    this.respuesta.set(null);
    this.cargando.set(false);
    this.guardando.set(false);
    this.confirmado.set(false);
    this.recargaNecesaria.set(false);
    this.intentado.set(false);
    this.mensaje.set('');
    this.errorCarga.set('');
    this.esError.set(false);
  }
  private adoptar(r: RespuestaReservas, id: string, conservar = false) {
    const anterior = this.datos();
    this.dueno.set(id);
    this.respuesta.set(r);
    this.datos.set(conservar && anterior ? anterior : borradorReserva(r.configuracion));
    this.confirmado.set(false);
    this.intentado.set(false);
    this.recargaNecesaria.set(false);
    this.errorCarga.set('');
  }
  private async consultar() {
    return adaptarConfiguracionReservas(
      await firstValueFrom(this.http.get<unknown>(ruta, { timeout: 15000 })),
    );
  }
  async cargar(conservarBorrador = false) {
    if (this.ocupado()) return;
    const id = this.identidad();
    if (!id) {
      this.limpiar();
      this.errorCarga.set('Inicia sesión como administrador para consultar las reservas.');
      return;
    }
    const n = ++this.secuencia,
      conservar = conservarBorrador && this.cargada() && this.cambios();
    this.cargando.set(true);
    this.errorCarga.set('');
    this.esError.set(false);
    this.mensaje.set('');
    try {
      const r = await this.consultar();
      if (!this.vigente(id, n)) return;
      if (r.configuracion.version < (this.configuracion()?.version ?? 0))
        throw Error('La versión recibida está atrasada.');
      this.adoptar(r, id, conservar);
      this.mensaje.set(
        conservar
          ? 'Configuración actualizada. Conservamos tu borrador; revisa los datos y confirma nuevamente.'
          : '',
      );
    } catch (e) {
      if (!this.vigente(id, n)) return;
      if (this.sinAcceso(e)) {
        this.limpiar();
        this.errorCarga.set(this.error(e));
        return;
      }
      this.errorCarga.set(this.error(e));
    } finally {
      if (this.vigente(id, n)) this.cargando.set(false);
    }
  }
  cambiar(cambio: Partial<BorradorReserva>) {
    if (this.bloqueado()) return;
    const b = this.datos();
    if (!b) return;
    if (
      (cambio.modo === 'TIEMPO' || b.modo === 'TIEMPO') &&
      !this.temporalDisponible() &&
      cambio.modo !== 'HASTA_DECISION'
    )
      return;
    this.datos.set({
      ...b,
      ...cambio,
      ...(cambio.modo === 'HASTA_DECISION' ? { horas: '', accionVencimiento: '' as const } : {}),
    });
    this.confirmado.set(false);
    this.esError.set(false);
    this.mensaje.set('');
  }
  confirmar(valor: boolean) {
    if (!this.bloqueado()) this.confirmado.set(valor === true);
  }
  descartar() {
    if (this.ocupado() || !this.configuracion()) return;
    this.datos.set(borradorReserva(this.configuracion()!));
    this.confirmado.set(false);
    this.intentado.set(false);
    this.esError.set(false);
    this.mensaje.set(
      this.recargaNecesaria()
        ? 'Borrador descartado. Actualiza para comprobar el resultado anterior antes de guardar.'
        : 'Cambios de reservas descartados.',
    );
  }
  private sinAcceso(e: unknown) {
    return e instanceof HttpErrorResponse && [401, 403].includes(e.status);
  }
  private error(e: unknown) {
    if (e instanceof HttpErrorResponse) {
      if ([401, 403].includes(e.status))
        return 'Tu sesión no autoriza esta operación. Inicia sesión nuevamente.';
      if (e.status === 400)
        return 'Revisa la política de reservas y su confirmación antes de guardar.';
      if (e.status === 429)
        return 'Hay demasiados intentos. Espera un minuto y vuelve a consultar.';
      if (e.status === 503 && e.error?.codigo === 'CONFIGURACION_RESERVAS_NO_DISPONIBLE')
        return 'La configuración de reservas no está disponible. No se guardaron cambios.';
      if (e.status === 409) {
        if (e.error?.codigo === 'VENCIMIENTOS_NO_DISPONIBLES')
          return 'La reserva por tiempo todavía no admite cambios. Actualiza y revisa la política guardada.';
        if (e.error?.codigo === 'VERSION_RESERVAS_AGOTADA')
          return 'La configuración alcanzó su límite de versiones y requiere revisión.';
        return 'La configuración cambió o requiere revisión. Tu borrador se conserva; pulsa Actualizar antes de guardar de nuevo.';
      }
    }
    return 'No pudimos confirmar el resultado. Tu borrador se conserva; pulsa Actualizar antes de volver a guardar.';
  }
  async guardar() {
    if (this.bloqueado() || this.recargaNecesaria()) return;
    this.intentado.set(true);
    this.esError.set(false);
    this.mensaje.set('');
    if (!this.cambios()) {
      this.mensaje.set('No hay cambios que guardar.');
      return;
    }
    if (Object.keys(this.errores()).length) return;
    const id = this.identidad(),
      p = this.configuracion(),
      b = this.borrador();
    if (!id || !p || !b) return;
    const n = ++this.secuencia,
      politica = politicaReserva(b),
      usuario = this.sesion.perfil()!.id;
    const cuerpo = { version: p.version, confirmado: true, ...politica };
    const coincide = (r: RespuestaReservas) =>
      r.configuracion.version === p.version + 1 &&
      r.configuracion.creadoEn === p.creadoEn &&
      r.configuracion.actualizadoEn >= p.actualizadoEn &&
      r.configuracion.actualizadoPor?.id === usuario &&
      mismaPolitica(r.configuracion, politica);
    this.guardando.set(true);
    try {
      const r = adaptarConfiguracionReservas(
        await firstValueFrom(this.http.patch<unknown>(ruta, cuerpo, { timeout: 30000 })),
        true,
      );
      if (!this.vigente(id, n)) return;
      if (r.modificada !== true || !coincide(r))
        throw Error('Resultado de configuración inesperado.');
      this.adoptar(r, id);
      this.mensaje.set('Configuración de reservas guardada. Se aplicará a nuevas reservas.');
    } catch (e) {
      if (!this.vigente(id, n)) return;
      if (this.sinAcceso(e)) {
        this.limpiar();
        this.errorCarga.set(this.error(e));
        return;
      }
      const estado = e instanceof HttpErrorResponse ? e.status : 0;
      if (![400, 404, 429].includes(estado)) {
        this.recargaNecesaria.set(true);
        try {
          const actual = await this.consultar();
          if (!this.vigente(id, n)) return;
          if (estado !== 409 && coincide(actual)) {
            this.adoptar(actual, id);
            this.mensaje.set(
              'Guardado comprobado al consultar. La configuración se aplicará a nuevas reservas.',
            );
            return;
          }
        } catch (consultaError) {
          if (!this.vigente(id, n)) return;
          if (this.sinAcceso(consultaError)) {
            this.limpiar();
            this.errorCarga.set(this.error(consultaError));
            return;
          }
        }
      }
      this.confirmado.set(false);
      this.esError.set(true);
      this.mensaje.set(this.error(e));
    } finally {
      if (this.vigente(id, n)) this.guardando.set(false);
    }
  }
}
