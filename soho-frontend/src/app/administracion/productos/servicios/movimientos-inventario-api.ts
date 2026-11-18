import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { registro } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import { uuid } from '../modelos/edicion-productos-api';
import { DatosMovimiento } from '../modelos/movimiento-inventario';
import {
  VarianteInventarioAdmin,
  MovimientoPendiente,
  listaVariantesInventario,
  resultadoMovimiento,
  solicitudMovimiento,
  validarSolicitudMovimiento,
  varianteInventario,
} from '../modelos/movimientos-inventario-api';

export class ErrorMovimientoInventario extends Error {
  constructor(
    message: string,
    readonly estado = 0,
    readonly incierto = false,
    readonly codigo = '',
  ) {
    super(message);
  }
}
const BASE = '/api/admin/inventario';
@Injectable({ providedIn: 'root' })
export class MovimientosInventarioApi {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  private readonly enCurso = new Set<string>();
  private identidad() {
    if (this.cuenta.perfil()?.rol !== 'ADMIN')
      throw new ErrorMovimientoInventario('Inicia sesión como administrador.', 403);
    return `${this.cuenta.perfil()!.id}:${this.auth.revision}`;
  }
  private vigente(i: string) {
    if (i !== this.identidad())
      throw new ErrorMovimientoInventario('La sesión cambió. Vuelve a abrir el formulario.', 403);
  }
  private almacen() {
    return 'soho:movimiento-inventario:' + this.cuenta.perfil()!.id;
  }
  pendiente(): MovimientoPendiente | null {
    this.identidad();
    let s: string | null;
    try {
      s = sessionStorage.getItem(this.almacen());
    } catch {
      throw new ErrorMovimientoInventario(
        'Habilita el almacenamiento de esta pestaña para recuperar movimientos.',
      );
    }
    if (!s) return null;
    try {
      const p = registro(JSON.parse(s));
      if (typeof p['incierto'] !== 'boolean') throw Error();
      return {
        varianteId: uuid(p['varianteId']),
        cuerpo: validarSolicitudMovimiento(p['cuerpo']),
        incierto: p['incierto'],
      };
    } catch {
      throw new ErrorMovimientoInventario(
        'La solicitud guardada no se pudo leer. Conserva esta pestaña y revisa el historial antes de registrar otro movimiento.',
        0,
        true,
        'PENDIENTE_INVALIDO',
      );
    }
  }
  private guardar(p: MovimientoPendiente) {
    try {
      sessionStorage.setItem(this.almacen(), JSON.stringify(p));
    } catch {
      throw new ErrorMovimientoInventario(
        'Habilita el almacenamiento de esta pestaña antes de registrar el movimiento.',
      );
    }
  }
  async buscar(filtros: Record<string, string> = {}) {
    const i = this.identidad();
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtros)) if (v) params = params.set(k, v);
    try {
      const r = await firstValueFrom(
        this.http.get<unknown>(BASE + '/variantes', { params, timeout: 15000 }),
      );
      this.vigente(i);
      return listaVariantesInventario(r);
    } catch (e) {
      throw this.error(e);
    }
  }
  async detalle(id: string) {
    uuid(id);
    const i = this.identidad();
    try {
      const r = await firstValueFrom(
        this.http.get<unknown>(BASE + '/variantes/' + id, { timeout: 15000 }),
      );
      this.vigente(i);
      const v = varianteInventario(registro(r)['variante']);
      if (v.id !== id) throw Error();
      return v;
    } catch (e) {
      throw this.error(e);
    }
  }
  async registrar(v: VarianteInventarioAdmin, d: DatosMovimiento) {
    if (this.pendiente())
      throw new ErrorMovimientoInventario('Consulta primero el movimiento pendiente.', 0, true);
    const p: MovimientoPendiente = {
      varianteId: v.id,
      cuerpo: solicitudMovimiento(v, d),
      incierto: false,
    };
    this.guardar(p);
    return this.ejecutar(p, true);
  }
  async recuperar(reintentar = false) {
    const p = this.pendiente();
    if (!p) throw new ErrorMovimientoInventario('No hay un movimiento pendiente.');
    return this.ejecutar(p, reintentar);
  }
  private async ejecutar(p: MovimientoPendiente, enviar: boolean) {
    const i = this.identidad(),
      propietario = this.cuenta.perfil()!.id,
      almacen = this.almacen();
    if (this.enCurso.has(i))
      throw new ErrorMovimientoInventario('Espera a que termine la operación.', 0, true);
    this.enCurso.add(i);
    let confirmada = false;
    try {
      const r = await firstValueFrom(
        enviar
          ? this.http.post<unknown>(`${BASE}/variantes/${p.varianteId}/movimientos`, p.cuerpo, {
              timeout: 30000,
            })
          : this.http.get<unknown>(`${BASE}/movimientos/operaciones/${p.cuerpo.claveSolicitud}`, {
              timeout: 15000,
            }),
      );
      this.vigente(i);
      const resultado = resultadoMovimiento(r, p, propietario);
      confirmada = true;
      // El resultado recuperado es histórico; la siguiente escritura necesita una lectura vigente.
      const actual = await this.detalle(p.varianteId);
      this.vigente(i);
      if (actual.versionExistencias < resultado.variante.versionExistencias)
        throw Error('Versión obsoleta.');
      sessionStorage.removeItem(almacen);
      return { ...resultado, actual };
    } catch (e) {
      const base = this.error(e),
        definitivo =
          enviar &&
          !p.incierto &&
          !confirmada &&
          e instanceof HttpErrorResponse &&
          [400, 401, 403, 404, 409, 413, 415, 422, 429].includes(e.status);
      if (this.cuenta.perfil()?.id === propietario) {
        if (definitivo) sessionStorage.removeItem(almacen);
        else {
          try {
            sessionStorage.setItem(almacen, JSON.stringify({ ...p, incierto: true }));
          } catch {
            /* Conservar la solicitud original si el almacenamiento deja de estar disponible. */
          }
        }
      }
      throw new ErrorMovimientoInventario(base.message, base.estado, !definitivo, base.codigo);
    } finally {
      this.enCurso.delete(i);
    }
  }
  private error(e: unknown): ErrorMovimientoInventario {
    if (e instanceof ErrorMovimientoInventario) return e;
    const estado = e instanceof HttpErrorResponse ? e.status : 0,
      codigo =
        e instanceof HttpErrorResponse && typeof e.error?.codigo === 'string' ? e.error.codigo : '';
    const mensajes: Record<string, string> = {
      INVENTARIO_CAMBIADO:
        'El físico, las reservas o la habilitación cambiaron. Actualiza los saldos y revisa el movimiento; tus campos se conservan.',
      RESERVAS_COMPROMETIDAS:
        'La reducción compromete unidades reservadas. Revisa la cantidad o los pedidos asociados.',
      INVENTARIO_INCONSISTENTE:
        'Las reservas o la identidad del SKU requieren revisión. Actualiza los saldos antes de continuar.',
      CLAVE_MOVIMIENTO_EN_USO:
        'La clave pertenece a otra solicitud. Consulta el resultado pendiente.',
      SALDO_FISICO_INVALIDO: 'El físico resultante debe estar entre 0 y 99,999 unidades.',
      CATALOGO_NO_CONVERTIDO:
        'La conversión del catálogo debe estar confirmada antes de registrar stock.',
    };
    const estados: Record<number, string> = {
      400: 'Revisa el tipo, la cantidad y el motivo.',
      401: 'Tu sesión venció. Inicia sesión nuevamente.',
      403: 'Tu sesión no autoriza esta operación.',
      404: 'No encontramos el resultado. Si hay un movimiento pendiente, consulta o reintenta la misma solicitud.',
      409: 'El inventario cambió. Actualiza los saldos y revisa el movimiento.',
      429: 'Espera un minuto antes de volver a intentarlo.',
    };
    return new ErrorMovimientoInventario(
      mensajes[codigo] ??
        estados[estado] ??
        'No pudimos confirmar el resultado. Tus campos se conservan; consulta el movimiento pendiente o reintenta la misma solicitud.',
      estado,
      false,
      codigo,
    );
  }
}
