import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import {
  ConfiguracionTienda,
  DatosTienda,
  SolicitudTienda,
  datosTiendaApi,
  erroresTienda,
  respuestaTienda,
  solicitudTienda,
  tiendaDesdeApi,
  tiendaVacia,
} from './contrato-tienda';
const ruta = '/api/admin/configuracion/tienda';
@Injectable()
export class TiendaEstado {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(EstadoAutenticacion);
  private readonly original = signal<ConfiguracionTienda | null>(null);
  private readonly datos = signal(tiendaVacia());
  private readonly propietario = signal<string | null>(null);
  private operacion: SolicitudTienda | null = null;
  private turno = 0;
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly mensaje = signal('');
  readonly errorCarga = signal('');
  readonly pendiente = signal(false);
  readonly recargaNecesaria = signal(false);
  readonly intentado = signal(false);
  readonly cargada = computed(() => !!this.original() && this.propietario() === this.identidad());
  readonly borrador = computed(() => (this.cargada() ? this.datos() : tiendaVacia()));
  readonly cambios = computed(
    () =>
      this.cargada() &&
      JSON.stringify(datosTiendaApi(this.datos())) !==
        JSON.stringify(datosTiendaApi(this.original()!.tienda)),
  );
  readonly errores = computed(() => erroresTienda(this.borrador()));
  readonly bloqueado = computed(
    () =>
      !this.cargada() ||
      !!this.errorCarga() ||
      this.cargando() ||
      this.guardando() ||
      this.pendiente() ||
      this.recargaNecesaria(),
  );
  constructor() {
    inject(DestroyRef).onDestroy(() => this.turno++);
    effect(() => {
      if (this.propietario() && this.propietario() !== this.identidad()) {
        this.turno++;
        this.original.set(null);
        this.datos.set(tiendaVacia());
        this.propietario.set(null);
        this.operacion = null;
        this.pendiente.set(false);
        this.cargando.set(false);
        this.guardando.set(false);
        this.errorCarga.set('La sesión cambió. Vuelve a entrar en Tienda.');
        this.mensaje.set('');
      }
    });
  }
  private identidad() {
    const p = this.auth.perfil();
    return p?.rol === 'ADMIN' ? p.id + ':' + this.auth.revision : null;
  }
  private clave() {
    return 'soho:tienda:guardado:' + this.auth.perfil()!.id;
  }
  private vigente(id: string, turno: number) {
    return id === this.identidad() && turno === this.turno;
  }
  private adoptar(c: ConfiguracionTienda, id: string) {
    this.original.set(c);
    this.datos.set(structuredClone(c.tienda));
    this.propietario.set(id);
  }
  error(clave: string) {
    return this.intentado() ? (this.errores()[clave] ?? '') : '';
  }
  actualizar(cambio: Partial<DatosTienda>) {
    if (this.bloqueado()) return;
    this.datos.update((t) => ({ ...t, ...cambio }));
    this.mensaje.set('');
  }
  descartar() {
    if (!this.bloqueado() && this.original()) {
      this.datos.set(structuredClone(this.original()!.tienda));
      this.intentado.set(false);
      this.mensaje.set('');
    }
  }
  async cargar() {
    const id = this.identidad();
    if (!id || this.guardando() || this.cargando()) return;
    const turno = ++this.turno;
    this.cargando.set(true);
    this.errorCarga.set('');
    try {
      const c = respuestaTienda(await firstValueFrom(this.http.get(ruta)));
      if (!this.vigente(id, turno)) return;
      this.adoptar(c, id);
      this.recargaNecesaria.set(false);
      this.intentado.set(false);
      const previa = sessionStorage.getItem(this.clave());
      this.operacion = previa ? solicitudTienda(JSON.parse(previa)) : null;
      this.pendiente.set(!!this.operacion);
      if (this.operacion) {
        this.datos.set(tiendaDesdeApi(this.operacion.tienda));
        this.mensaje.set(
          'Hay un guardado pendiente de confirmar. Comprueba su resultado antes de continuar.',
        );
      }
    } catch {
      if (this.vigente(id, turno))
        this.errorCarga.set('No se pudieron cargar los datos de Tienda. Intenta de nuevo.');
    } finally {
      if (this.vigente(id, turno)) this.cargando.set(false);
    }
  }
  private async confirmar(respuesta: unknown, op: SolicitudTienda, id: string, turno: number) {
    const guardada = respuestaTienda(respuesta);
    if (
      guardada.version !== op.versionEsperada + 1 ||
      JSON.stringify(datosTiendaApi(guardada.tienda)) !== JSON.stringify(op.tienda)
    )
      throw Error('Confirmación no válida.');
    const actual = respuestaTienda(await firstValueFrom(this.http.get(ruta)));
    if (!this.vigente(id, turno)) return;
    if (actual.version < guardada.version) throw Error('Versión no confirmada.');
    sessionStorage.removeItem(this.clave());
    this.adoptar(actual, id);
    this.operacion = null;
    this.pendiente.set(false);
    this.mensaje.set('Datos de Tienda guardados.');
    this.intentado.set(false);
  }
  async guardar() {
    if (this.bloqueado() || !this.cambios()) return;
    this.intentado.set(true);
    if (Object.keys(this.errores()).length) {
      this.mensaje.set(Object.values(this.errores()).join(' '));
      return;
    }
    const op = solicitudTienda({
      claveSolicitud: crypto.randomUUID(),
      versionEsperada: this.original()!.version,
      tienda: datosTiendaApi(this.datos()),
    });
    try {
      sessionStorage.setItem(this.clave(), JSON.stringify(op));
    } catch {
      this.mensaje.set(
        'El navegador no permite proteger este guardado. Habilita el almacenamiento de la sesión e intenta de nuevo.',
      );
      return;
    }
    this.operacion = op;
    this.pendiente.set(true);
    await this.enviar(op);
  }
  private async enviar(op: SolicitudTienda) {
    const id = this.identidad();
    if (!id || this.guardando()) return;
    const turno = this.turno;
    this.guardando.set(true);
    this.mensaje.set('');
    try {
      const r = await firstValueFrom(this.http.patch(ruta, op));
      if (this.vigente(id, turno)) await this.confirmar(r, op, id, turno);
    } catch (e) {
      if (!this.vigente(id, turno)) return;
      if (e instanceof HttpErrorResponse && [400, 409, 413, 415, 422, 429].includes(e.status)) {
        sessionStorage.removeItem(this.clave());
        this.operacion = null;
        this.pendiente.set(false);
        this.recargaNecesaria.set(e.status === 409);
        this.mensaje.set(
          e.status === 409
            ? 'Otro administrador cambió Tienda. Carga la versión guardada antes de editar.'
            : 'El servidor rechazó los cambios. Revisa los campos e intenta de nuevo.',
        );
      } else
        this.mensaje.set(
          'No se pudo confirmar el guardado. Comprueba el resultado o reintenta el mismo envío.',
        );
    } finally {
      if (this.vigente(id, turno)) this.guardando.set(false);
    }
  }
  async comprobar() {
    const op = this.operacion,
      id = this.identidad();
    if (!op || !id || this.guardando()) return;
    const turno = this.turno;
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(this.http.get(ruta + '/operaciones/' + op.claveSolicitud));
      if (this.vigente(id, turno)) await this.confirmar(r, op, id, turno);
    } catch (e) {
      if (this.vigente(id, turno))
        this.mensaje.set(
          e instanceof HttpErrorResponse && e.status === 404
            ? 'Este envío aún no está guardado. Puedes reintentar el mismo envío.'
            : 'No se pudo comprobar el resultado. Intenta de nuevo.',
        );
    } finally {
      if (this.vigente(id, turno)) this.guardando.set(false);
    }
  }
  async reintentar() {
    if (this.operacion && this.pendiente()) await this.enviar(this.operacion);
  }
}
