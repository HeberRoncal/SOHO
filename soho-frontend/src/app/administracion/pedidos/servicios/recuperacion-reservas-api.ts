import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { registro } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import {
  adaptarPagoAdmin,
  PagosAdministracionApi,
} from '../../pagos/servicios/pagos-administracion-api';
import {
  adaptarPlanRecuperacion,
  PlanRecuperacionReservas,
  SolicitudRecuperacionReservas,
} from '../modelos/recuperacion-reservas';
import { PedidoAdmin } from '../modelos/pedido-admin';

@Injectable({ providedIn: 'root' })
export class RecuperacionReservasApi {
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
    const p = adaptarPagoAdmin(valor).pedido;
    if (p.codigo !== codigo || (this.pedidos.obtener(codigo)?.pedido.version ?? 0) > p.version!)
      throw Error('Respuesta de pedido obsoleta.');
    return this.pedidos.incorporarPedido(valor);
  }
  async consultar(
    codigo: string,
  ): Promise<{ ok: boolean; plan?: PlanRecuperacionReservas; error?: string }> {
    const i = this.identidad();
    if (!this.vigente(i)) return { ok: false, error: 'Inicia sesión como administrador.' };
    if (!/^SOHO-[A-Z0-9]{6,24}$/.test(codigo))
      return { ok: false, error: 'No encontramos el pedido.' };
    try {
      const r = registro(
        await firstValueFrom(
          this.http.get<unknown>(`/api/admin/pedidos/${codigo}/reservas/recuperacion`, {
            timeout: 15000,
          }),
        ),
      );
      if (!this.vigente(i)) return { ok: false, error: 'La sesión cambió.' };
      const p = adaptarPagoAdmin(r['pedido']).pedido;
      if (p.codigo !== codigo) throw Error('Pedido diferente.');
      const plan = adaptarPlanRecuperacion(r['recuperacion'], p);
      this.incorporar(r['pedido'], codigo, i);
      this.pendientes.delete(`${i}:${codigo}`);
      return { ok: true, plan };
    } catch (e) {
      return { ok: false, error: this.vigente(i) ? this.error(e) : 'La sesión cambió.' };
    }
  }

  async guardar(
    codigo: string,
    entrada: SolicitudRecuperacionReservas,
  ): Promise<{ ok: boolean; error?: string; requiereActualizar?: boolean; recuperado?: boolean }> {
    const i = this.identidad(),
      clave = `${i}:${codigo}`,
      original = this.pedidos.obtener(codigo)?.pedido;
    if (!this.vigente(i)) return { ok: false, error: 'Inicia sesión como administrador.' };
    if (this.operaciones.has(clave))
      return { ok: false, error: 'Espera a que termine la operación.' };
    if (
      this.pendientes.has(clave) ||
      !original?.recuperacionReservas?.puedeSolicitar ||
      original.version !== entrada.versionPedido ||
      original.versionPago !== entrada.versionPago
    )
      return {
        ok: false,
        error: 'Actualiza el pedido antes de confirmar la recuperación.',
        requiereActualizar: true,
      };
    const cuerpo = { ...entrada, motivo: entrada.motivo.trim() };
    if (
      !cuerpo.confirmado ||
      Array.from(cuerpo.motivo).length < 10 ||
      Array.from(cuerpo.motivo).length > 300 ||
      /[\p{Cc}\p{Cf}]/u.test(cuerpo.motivo.replace(/[\r\n]/g, ''))
    )
      return { ok: false, error: 'Escribe un motivo válido y confirma la recuperación.' };
    const coherente = (p: PedidoAdmin) => {
      const u = p.recuperacionReservas?.ultima;
      return (
        p.codigo === codigo &&
        p.version === cuerpo.versionPedido + 1 &&
        p.versionPago === cuerpo.versionPago &&
        p.estadoEntrega === 'pendiente' &&
        p.estadoPago === original.estadoPago &&
        !p.cancelacion &&
        !p.datosEnvio &&
        u?.versionPedido === p.version &&
        u.motivo === cuerpo.motivo &&
        u.responsable.id === this.cuenta.perfil()?.id &&
        p.vencimientoReservas?.unidadesLiberadas === 0 &&
        JSON.stringify(p.articulos) === JSON.stringify(original.articulos) &&
        p.total === original.total &&
        p.envio === original.envio &&
        p.descuento === original.descuento
      );
    };
    this.operaciones.add(clave);
    try {
      const r = registro(
        await firstValueFrom(
          this.http.post<unknown>(`/api/admin/pedidos/${codigo}/reservas/recuperacion`, cuerpo, {
            timeout: 30000,
          }),
        ),
      );
      if (!this.vigente(i)) return { ok: false, error: 'La sesión cambió.' };
      if (!coherente(adaptarPagoAdmin(r['pedido']).pedido))
        throw Error('Resultado de recuperación inesperado.');
      this.incorporar(r['pedido'], codigo, i);
      return { ok: true };
    } catch (e) {
      if (!this.vigente(i)) return { ok: false, error: 'La sesión cambió.' };
      const estado = e instanceof HttpErrorResponse ? e.status : 0;
      if ([400, 401, 403, 404, 429].includes(estado)) return { ok: false, error: this.error(e) };
      this.pendientes.add(clave);
      try {
        const r = registro(
          await firstValueFrom(
            this.http.get<unknown>(`/api/admin/pedidos/${codigo}`, { timeout: 15000 }),
          ),
        );
        const actual = this.incorporar(r['pedido'], codigo, i);
        if (estado !== 409 && coherente(actual)) {
          this.pendientes.delete(clave);
          return { ok: true, recuperado: true };
        }
      } catch {
        /* Mantener el borrador hasta consultar expresamente un resultado válido. */
      }
      return {
        ok: false,
        error: this.vigente(i) ? this.error(e) : 'La sesión cambió.',
        requiereActualizar: true,
      };
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
      if (e.status === 400) return 'Revisa el motivo y la confirmación.';
      if (e.status === 409)
        return 'El pedido o su disponibilidad cambiaron. Actualiza antes de confirmar.';
      if (e.status === 429) return 'Espera un minuto antes de volver a intentarlo.';
    }
    return 'No pudimos confirmar el resultado. Actualiza el pedido antes de volver a guardar; tu motivo se conserva.';
  }
}
