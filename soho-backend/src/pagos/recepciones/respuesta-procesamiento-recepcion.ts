import { ServiceUnavailableException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { OperacionRecepcionCompra } from '../../generated/prisma/client.js';
import { RespuestaRecepcionCompra } from './respuesta-recepcion-compra.js';
import type { RecepcionCompra } from './recepcion-compra.interface.js';

export class RespuestaProcesamientoRecepcion {
  static estado(r: RecepcionCompra) {
    return {
      estado: r.estado,
      version: r.version,
      comprobanteActualId: r.comprobanteActualId,
      motivos: r.motivos,
      pedidoId: r.pedidoId,
    };
  }
  static crear(r: RecepcionCompra, clave: string, plazo: number) {
    if (r.estado !== 'PEDIDO_CREADO' && r.estado !== 'REQUIERE_ATENCION')
      throw new ServiceUnavailableException(
        'El resultado de procesamiento requiere revisión.',
      );
    return {
      ...RespuestaRecepcionCompra.actual(r, plazo),
      operacion: { claveSolicitud: clave, estado: 'CONFIRMADA' as const },
      resultado: r.estado,
      pedido: r.pedido ? { codigo: r.pedido.codigo } : null,
    };
  }
  static leer(o: OperacionRecepcionCompra, r: RecepcionCompra, plazo: number) {
    try {
      const s = o.despues as ReturnType<typeof this.estado> | null;
      if (
        !['PROCESAR', 'REGISTRAR_PEDIDO'].includes(o.accion) ||
        o.estado !== 'CONFIRMADA' ||
        o.codigoHttp !== 200 ||
        !s ||
        !isDeepStrictEqual(
          Object.keys(s).sort(),
          [
            'estado',
            'version',
            'comprobanteActualId',
            'motivos',
            'pedidoId',
          ].sort(),
        ) ||
        s.version !== o.versionResultante ||
        s.comprobanteActualId !== o.comprobanteId ||
        !['REQUIERE_ATENCION', 'PEDIDO_CREADO'].includes(s.estado) ||
        (s.estado === 'PEDIDO_CREADO'
          ? !s.pedidoId || s.pedidoId !== r.pedidoId || !r.pedido
          : s.pedidoId !== null)
      )
        throw Error();
      const respuesta = this.crear(
        { ...r, ...s, pedido: s.pedidoId ? r.pedido : null },
        o.claveSolicitud,
        plazo,
      );
      if (
        !isDeepStrictEqual(o.respuesta, JSON.parse(JSON.stringify(respuesta)))
      )
        throw Error();
      return respuesta;
    } catch {
      throw new ServiceUnavailableException(
        'La operación registrada requiere revisión. Conserva su clave.',
      );
    }
  }
  static pendiente(r: RecepcionCompra, clave: string, plazo: number) {
    return {
      ...RespuestaRecepcionCompra.actual(r, plazo),
      operacion: { claveSolicitud: clave, estado: 'PENDIENTE' as const },
      resultado: null,
      pedido: null,
    };
  }
}
