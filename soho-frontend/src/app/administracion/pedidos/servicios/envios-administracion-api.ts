import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { CODIGO_PEDIDO, registro } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import { PagosAdministracionApi } from '../../pagos/servicios/pagos-administracion-api';
import {
  CambioEntregaAdmin,
  ACCIONES_ENTREGA_ADMIN,
  erroresCambioEntrega,
} from '../modelos/entrega-admin';
import { PedidoAdmin } from '../modelos/pedido-admin';

export interface ResultadoEntregaAdmin {
  ok: boolean;
  errores: Record<string, string>;
  requiereActualizar?: boolean;
  recuperado?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EnviosAdministracionApi {
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
  private async consultar(codigo: string, identidad: string) {
    const r = registro(
      await firstValueFrom(
        this.http.get<unknown>(`/api/admin/pedidos/${codigo}`, { timeout: 15000 }),
      ),
    );
    if (!this.vigente(identidad)) throw Error('La sesión cambió.');
    if (registro(r['pedido'])['codigo'] !== codigo) throw Error('Pedido distinto al solicitado.');
    const p = this.pedidos.incorporarPedido(r['pedido']);
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
  async guardar(codigo: string, cambio: CambioEntregaAdmin): Promise<ResultadoEntregaAdmin> {
    const identidad = this.identidad(),
      clave = `${identidad}:${codigo}`;
    const fallo = (estado: string, requiereActualizar = false): ResultadoEntregaAdmin => ({
      ok: false,
      errores: { estado },
      requiereActualizar,
    });
    if (!this.vigente(identidad)) return fallo('Inicia sesión como administrador.');
    if (this.operaciones.has(clave)) return fallo('Espera a que termine la operación.');
    if (this.pendientes.has(clave))
      return fallo(
        'Actualiza el pedido para comprobar el resultado anterior antes de guardar.',
        true,
      );
    const p = this.pedidos.obtener(codigo)?.pedido;
    if (
      !p ||
      !Number.isInteger(cambio.versionPedido) ||
      cambio.versionPedido! < 1 ||
      cambio.versionPedido! >= 4294967295 ||
      p.version !== cambio.versionPedido
    )
      return fallo('El pedido cambió. Actualiza sus datos antes de continuar.', true);
    const errores = erroresCambioEntrega(p, cambio);
    if (Object.keys(errores).length) return { ok: false, errores };
    const ruta = { preparar: 'preparacion', enviar: 'envio', entregar: 'entrega' }[cambio.accion];
    const destino = ACCIONES_ENTREGA_ADMIN.find((a) => a.accion === cambio.accion)!.destino;
    this.operaciones.add(clave);
    try {
      const r = registro(
        await firstValueFrom(
          this.http.post<unknown>(
            `/api/admin/pedidos/${codigo}/${ruta}`,
            {
              versionPedido: cambio.versionPedido,
              ...(cambio.nota.trim() ? { nota: cambio.nota.trim() } : {}),
              ...(cambio.accion === 'enviar'
                ? {
                    transportista: cambio.empresa.trim(),
                    referenciaSeguimiento: cambio.seguimiento.trim(),
                  }
                : {}),
              ...(cambio.accion === 'entregar' ? { confirmado: cambio.confirmado } : {}),
            },
            { timeout: 30000 },
          ),
        ),
      );
      if (!this.vigente(identidad)) return fallo('La sesión cambió.');
      if (registro(r['pedido'])['codigo'] !== codigo) throw Error('Pedido distinto al solicitado.');
      const actual = this.pedidos.incorporarPedido(r['pedido']);
      if ((actual.version ?? 0) <= cambio.versionPedido! || actual.estadoEntrega !== destino)
        throw Error('Resultado de entrega inesperado.');
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
        // La escritura no se repite; se exige una lectura confirmada.
      }
      if (!this.vigente(identidad)) return fallo('La sesión cambió.');
      const responsable =
        cambio.accion === 'preparar'
          ? actual?.responsablesEnvio?.preparacion
          : cambio.accion === 'enviar'
            ? actual?.responsablesEnvio?.despacho
            : actual?.responsablesEnvio?.entrega;
      if (
        estado !== 409 &&
        actual?.estadoEntrega === destino &&
        actual.version === cambio.versionPedido! + 1 &&
        responsable?.id === this.cuenta.perfil()?.id &&
        (cambio.accion !== 'enviar' ||
          (actual.seguimiento?.empresa === cambio.empresa.trim() &&
            actual.seguimiento.codigo === cambio.seguimiento.trim()))
      )
        return { ok: true, errores: {}, recuperado: true };
      return fallo(this.error(e), true);
    } finally {
      this.operaciones.delete(clave);
    }
  }
  private error(e: unknown) {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 401 || e.status === 403) {
        this.pedidos.retirarDatosPrivados();
        return 'Tu sesión no autoriza esta operación. Inicia sesión nuevamente.';
      }
      if (e.status === 404) return 'No encontramos el pedido.';
      if (e.status === 400) return 'Revisa los datos de envío y la confirmación antes de guardar.';
      if (e.status === 429)
        return 'Hay demasiados intentos. Espera un minuto antes de volver a guardar.';
      if (e.status === 409)
        return e.error?.codigo === 'INVENTARIO_INCONSISTENTE'
          ? 'El inventario o las reservas necesitan revisión. Actualiza el pedido; no se registró esta acción.'
          : 'El pedido cambió o ya avanzó de etapa. Actualiza y revisa su estado antes de continuar.';
    }
    return 'No pudimos confirmar el resultado. Actualiza el pedido antes de volver a guardar; tus datos se conservan.';
  }
}
