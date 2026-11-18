import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { CODIGO_PEDIDO, registro } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import {
  adaptarPagoAdmin,
  PagosAdministracionApi,
} from '../../pagos/servicios/pagos-administracion-api';
import { SolicitudCancelacionAdmin, erroresCancelacionPedido } from '../modelos/cancelacion-admin';
import { PedidoAdmin } from '../modelos/pedido-admin';

export interface ResultadoCancelacionAdmin {
  ok: boolean;
  errores: Record<string, string>;
  requiereActualizar?: boolean;
  recuperado?: boolean;
}
export interface SolicitudLiberacionAdmin {
  versionPedido?: number;
  versionPago?: number;
  confirmado: boolean;
}

@Injectable({ providedIn: 'root' })
export class CancelacionesAdministracionApi {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  private readonly pedidos = inject(PagosAdministracionApi);
  private readonly operaciones = new Set<string>();
  private readonly pendientes = new Set<string>();
  private identidad() {
    return `${this.cuenta.perfil()?.id ?? ''}:${this.auth.revision}:${this.cuenta.perfil()?.rol ?? ''}`;
  }
  private vigente(i: string) {
    return i === this.identidad() && this.cuenta.perfil()?.rol === 'ADMIN';
  }
  private incorporar(valor: unknown, codigo: string, identidad: string) {
    if (!this.vigente(identidad)) throw Error('La sesión cambió.');
    if (registro(valor)['codigo'] !== codigo) throw Error('Pedido distinto al solicitado.');
    return this.pedidos.incorporarPedido(valor);
  }
  private async consultar(codigo: string, identidad: string) {
    const r = registro(
      await firstValueFrom(
        this.http.get<unknown>(`/api/admin/pedidos/${codigo}`, { timeout: 15000 }),
      ),
    );
    const p = this.incorporar(r['pedido'], codigo, identidad);
    this.pendientes.delete(`${identidad}:${codigo}`);
    return p;
  }
  async actualizar(codigo: string): Promise<{ ok: boolean; error?: string }> {
    const i = this.identidad();
    if (!this.vigente(i)) return { ok: false, error: 'Inicia sesión como administrador.' };
    if (!CODIGO_PEDIDO.test(codigo)) return { ok: false, error: 'No encontramos el pedido.' };
    try {
      await this.consultar(codigo, i);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.vigente(i) ? this.error(e) : 'La sesión cambió.' };
    }
  }
  cancelar(codigo: string, solicitud: SolicitudCancelacionAdmin) {
    return this.guardar(codigo, solicitud, false);
  }
  liberar(codigo: string, solicitud: SolicitudLiberacionAdmin) {
    return this.guardar(codigo, solicitud, true);
  }
  private async guardar(
    codigo: string,
    entrada: SolicitudLiberacionAdmin | SolicitudCancelacionAdmin,
    liberar: boolean,
  ): Promise<ResultadoCancelacionAdmin> {
    const identidad = this.identidad(),
      clave = `${identidad}:${codigo}`;
    const fallo = (estado: string, requiereActualizar = false): ResultadoCancelacionAdmin => ({
      ok: false,
      errores: { estado },
      requiereActualizar,
    });
    if (!this.vigente(identidad)) return fallo('Inicia sesión como administrador.');
    if (!CODIGO_PEDIDO.test(codigo)) return fallo('No encontramos el pedido.');
    if (this.operaciones.has(clave)) return fallo('Espera a que termine la operación.');
    if (this.pendientes.has(clave))
      return fallo(
        'Actualiza el pedido para comprobar el resultado anterior antes de guardar.',
        true,
      );
    const p = this.pedidos.obtener(codigo)?.pedido;
    const versionValida = (v: number | undefined, max: number) =>
      Number.isSafeInteger(v) && v! >= 1 && v! <= max;
    if (
      !p ||
      !versionValida(entrada.versionPedido, 4294967294) ||
      !versionValida(entrada.versionPago, 4294967295) ||
      p.version !== entrada.versionPedido ||
      p.versionPago !== entrada.versionPago
    )
      return fallo('El pedido o su pago cambiaron. Actualiza antes de continuar.', true);
    // La recuperación compara una copia de la entrada enviada, no un borrador que pueda cambiar.
    const version = entrada.versionPedido!,
      versionPago = entrada.versionPago!,
      solicitud = { ...entrada } as SolicitudCancelacionAdmin,
      motivo = liberar ? '' : solicitud.motivo.trim(),
      decision = solicitud.decisionReservasConsultadas;
    if (liberar) {
      if (
        p.estadoEntrega !== 'cancelado' ||
        p.cancelacion?.decisionReservasConsultadas !== 'CONSERVAR' ||
        !p.reservasCancelacion?.puedeLiberarRetenidas ||
        !p.reservasCancelacion.unidadesRetenidas ||
        !['aprobado', 'anulado'].includes(p.estadoPago)
      )
        return fallo(
          'El pedido no tiene reservas retenidas que puedan liberarse. Actualiza sus datos.',
          true,
        );
      if (entrada.confirmado !== true)
        return {
          ok: false,
          errores: { confirmado: 'Confirma la liberación de todas las reservas retenidas.' },
        };
    } else {
      const errores = erroresCancelacionPedido(p, solicitud);
      if (Object.keys(errores).length) return { ok: false, errores };
    }
    const cuerpo = {
      versionPedido: version,
      versionPago,
      confirmado: entrada.confirmado,
      ...(!liberar
        ? { motivo, ...(decision ? { decisionReservasConsultadas: decision } : {}) }
        : {}),
    };
    const coherente = (actual: PedidoAdmin, recuperando = false) => {
      if (actual.version !== version + 1 || actual.estadoEntrega !== 'cancelado') return false;
      if (liberar) {
        if (
          actual.versionPago !== versionPago ||
          actual.estadoPago !== p.estadoPago ||
          !actual.reservasCancelacion ||
          actual.reservasCancelacion.unidadesRetenidas !== 0 ||
          JSON.stringify(actual.cancelacion) !== JSON.stringify(p.cancelacion)
        )
          return false;
        return (
          !recuperando ||
          actual.eventos.some(
            (e) =>
              e.interna &&
              e.titulo === 'Reservas retenidas liberadas' &&
              e.responsable?.id === this.cuenta.perfil()?.id &&
              !p.eventos.some((anterior) => JSON.stringify(anterior) === JSON.stringify(e)),
          )
        );
      }
      const c = actual.cancelacion,
        estadoPago = p.estadoPago === 'aprobado' ? 'aprobado' : 'anulado';
      const retenidas = decision === 'CONSERVAR' ? p.reservasCancelacion!.unidadesConsultables : 0;
      return (
        !!c &&
        c.versionPedido === version + 1 &&
        c.responsableId === this.cuenta.perfil()?.id &&
        c.motivo === motivo &&
        c.estadoEntregaAnterior === p.estadoEntrega &&
        c.estadoPagoAnterior === p.estadoPago &&
        c.decisionReservasConsultadas === (decision ?? null) &&
        actual.estadoPago === estadoPago &&
        actual.versionPago ===
          (['aprobado', 'anulado'].includes(p.estadoPago) ? versionPago : versionPago + 1) &&
        actual.reservasCancelacion?.unidadesRetenidas === retenidas
      );
    };
    this.operaciones.add(clave);
    try {
      const r = registro(
        await firstValueFrom(
          this.http.post<unknown>(
            `/api/admin/pedidos/${codigo}/cancelacion${liberar ? '/liberar-reservas' : ''}`,
            cuerpo,
            { timeout: 30000 },
          ),
        ),
      );
      if (!this.vigente(identidad)) return fallo('La sesión cambió.');
      const actual = adaptarPagoAdmin(r['pedido']).pedido;
      if (actual.codigo !== codigo || !coherente(actual))
        throw Error('Resultado de cancelación inesperado.');
      this.incorporar(r['pedido'], codigo, identidad);
      return { ok: true, errores: {} };
    } catch (e) {
      if (!this.vigente(identidad)) return fallo('La sesión cambió.');
      const estado = e instanceof HttpErrorResponse ? e.status : 0;
      if ([400, 401, 403, 404, 429].includes(estado)) return fallo(this.error(e));
      this.pendientes.add(clave);
      let actual: PedidoAdmin | undefined;
      try {
        actual = await this.consultar(codigo, identidad);
      } catch (consultaError) {
        if (
          this.vigente(identidad) &&
          consultaError instanceof HttpErrorResponse &&
          [401, 403].includes(consultaError.status)
        )
          return fallo(this.error(consultaError));
      }
      if (!this.vigente(identidad)) return fallo('La sesión cambió.');
      if (estado !== 409 && actual && coherente(actual, true))
        return { ok: true, errores: {}, recuperado: true };
      return fallo(this.error(e), true);
    } finally {
      this.operaciones.delete(clave);
    }
  }
  private error(e: unknown) {
    if (e instanceof HttpErrorResponse) {
      if ([401, 403].includes(e.status)) {
        this.pedidos.retirarDatosPrivados();
        return 'Tu sesión no autoriza esta operación. Inicia sesión nuevamente.';
      }
      if (e.status === 404) return 'No encontramos el pedido.';
      if (e.status === 400)
        return 'Revisa el motivo, la decisión de reservas y la confirmación antes de guardar.';
      if (e.status === 429)
        return 'Hay demasiados intentos. Espera un minuto antes de volver a guardar.';
      if (e.status === 409)
        return e.error?.codigo === 'INVENTARIO_INCONSISTENTE'
          ? 'El inventario o las reservas necesitan revisión. Actualiza el pedido; no se registró esta acción.'
          : 'El pedido cambió o ya no admite esta acción. Actualiza y revisa su estado.';
    }
    return 'No pudimos confirmar el resultado. Actualiza el pedido antes de volver a guardar; tus datos se conservan.';
  }
}
